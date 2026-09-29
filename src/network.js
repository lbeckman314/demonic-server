// Network access for programs that opt in with `net: [domain, ...]` in
// process.yaml. Everything else runs with --net=none.
//
// Each distinct list of domains gets its own "network":
//   - a Linux bridge, demonic-n<i>, with the address 10.200.<i>.1/24;
//   - a tinyproxy listening only on that address, allowing HTTP and HTTPS
//     (CONNECT to port 443) to exactly those domains;
//   - nftables rules that let sandboxes on the bridge reach their own proxy
//     and nothing else: not the internet, not the container's other ports,
//     not DNS, and not each other.
// Sandboxes join the bridge with Firejail's --net=<bridge> and find the
// proxy through the usual HTTP(S)_PROXY variables.
//
// `node src/network.js setup` builds all of this and must run as root before
// the server starts (see docker/entrypoint.sh). The server only reads the
// same profiles to pick Firejail arguments.

const fs = require('fs');
const net = require('net');
const { execFileSync, spawn } = require('child_process');

const PROXY_PORT = 8888;
const RUN_DIR = '/run/demonic';

// A host name, or '*.' followed by one for "any subdomain of".
const DOMAIN = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

function normalizeDomains(entryName, domains) {
    if (!Array.isArray(domains))
        throw new Error(`process.yaml: ${entryName}: 'net' must be a list of domains`);
    return [...new Set(domains.map(d => String(d).trim().toLowerCase()))].sort().map(d => {
        if (!DOMAIN.test(d))
            throw new Error(`process.yaml: ${entryName}: invalid domain '${d}'`);
        return d;
    });
}

// Profiles for every distinct `net` list, in the order they first appear.
// Returns a Map from 'domain,domain' to { index, domains, bridge, gateway, proxy }.
function profiles(cfg) {
    const result = new Map();
    const entries = Object.entries(cfg.progs || {}).concat(Object.entries(cfg.langs || {}));

    for (const [name, entry] of entries) {
        if (!entry || entry.net == null)
            continue;
        const domains = normalizeDomains(name, entry.net);
        if (domains.length == 0)
            continue;
        const key = domains.join(',');
        if (result.has(key))
            continue;

        const index = result.size;
        if (index > 250)
            throw new Error('process.yaml: too many distinct net lists');
        const gateway = `10.200.${index}.1`;
        result.set(key, {
            index,
            domains,
            bridge: `demonic-n${index}`,
            gateway,
            proxy: `http://${gateway}:${PROXY_PORT}`,
        });
    }
    return result;
}

// The profile for one program or language entry, or null for --net=none.
function profileFor(allProfiles, name, entry) {
    if (!entry || entry.net == null)
        return null;
    const domains = normalizeDomains(name, entry.net);
    return domains.length ? allProfiles.get(domains.join(',')) : null;
}

// Whether the bridge for a profile has been set up on this machine.
function isSetUp(profile) {
    return fs.existsSync(`/sys/class/net/${profile.bridge}`);
}

// tinyproxy regular expression (POSIX ERE) for one domain.
function domainFilter(domain) {
    const escape = (s) => s.replace(/\./g, '\\.');
    if (domain.startsWith('*.'))
        return `^.+\\.${escape(domain.slice(2))}$`;
    return `^${escape(domain)}$`;
}

function tinyproxyConfig(p) {
    return [
        'User tinyproxy',
        'Group tinyproxy',
        `Port ${PROXY_PORT}`,
        `Listen ${p.gateway}`,
        'Timeout 60',
        'MaxClients 64',
        `Allow 10.200.${p.index}.0/24`,
        `Filter "${RUN_DIR}/filter-${p.index}"`,
        'FilterType ere',
        'FilterURLs Off',
        'FilterDefaultDeny Yes',
        'ConnectPort 443',
        'DisableViaHeader Yes',
        'LogLevel Notice',
        `LogFile "${RUN_DIR}/tinyproxy-${p.index}.log"`,
        '',
    ].join('\n');
}

function nftRules(all) {
    const accept = all.map(p =>
        `    iifname "${p.bridge}" ip daddr ${p.gateway} tcp dport ${PROXY_PORT} accept`);
    return `
table inet demonic {
  chain input {
    type filter hook input priority 0; policy accept;
${accept.join('\n')}
    iifname "demonic-n*" drop
  }
  chain forward {
    type filter hook forward priority 0; policy accept;
    iifname "demonic-n*" drop
    oifname "demonic-n*" drop
  }
}
table bridge demonic {
  chain forward {
    type filter hook forward priority 0; policy accept;
    meta ibrname "demonic-n*" drop
  }
}
`;
}

function waitForPort(host, port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const sock = net.connect(port, host, () => { sock.destroy(); resolve(); });
            sock.on('error', () => {
                sock.destroy();
                if (Date.now() > deadline)
                    reject(new Error(`proxy ${host}:${port} did not start`));
                else
                    setTimeout(attempt, 100);
            });
        };
        attempt();
    });
}

async function setup(cfg) {
    const all = [...profiles(cfg).values()];
    if (all.length == 0) {
        console.log('network: no programs use the network');
        return;
    }

    const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });

    // Nothing on a sandbox bridge is ever routed anywhere.
    run('sysctl', '-qw', 'net.ipv4.ip_forward=0', 'net.ipv6.conf.all.forwarding=0');

    fs.mkdirSync(RUN_DIR, { recursive: true });
    execFileSync('chown', ['tinyproxy:tinyproxy', RUN_DIR]);

    for (const p of all) {
        run('ip', 'link', 'add', p.bridge, 'type', 'bridge');
        run('sysctl', '-qw', `net.ipv6.conf.${p.bridge}.disable_ipv6=1`);
        run('ip', 'addr', 'add', `${p.gateway}/24`, 'dev', p.bridge);
        run('ip', 'link', 'set', p.bridge, 'up');

        fs.writeFileSync(`${RUN_DIR}/filter-${p.index}`, p.domains.map(domainFilter).join('\n') + '\n');
        fs.writeFileSync(`${RUN_DIR}/tinyproxy-${p.index}.conf`, tinyproxyConfig(p));
    }

    execFileSync('nft', ['-f', '-'], { input: nftRules(all) });

    // Run each proxy in the foreground but detached from this script, so it
    // is adopted by the container's init once setup exits.
    for (const p of all) {
        spawn('tinyproxy', ['-d', '-c', `${RUN_DIR}/tinyproxy-${p.index}.conf`],
            { detached: true, stdio: 'ignore' }).unref();
    }
    await Promise.all(all.map(p => waitForPort(p.gateway, PROXY_PORT, 10000)));

    for (const p of all)
        console.log(`network: ${p.bridge} -> ${p.domains.join(', ')} (proxy ${p.proxy})`);
}

module.exports = { profiles, profileFor, isSetUp };

if (require.main === module) {
    const yaml = require('js-yaml');
    const cfg = yaml.load(fs.readFileSync('src/process.yaml', 'utf8'));
    if (process.argv[2] == 'setup') {
        setup(cfg).catch((err) => {
            console.error('network setup failed:', err.message);
            process.exit(1);
        });
    } else {
        console.log([...profiles(cfg).values()]);
    }
}
