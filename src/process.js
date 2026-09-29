const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const pty = require('node-pty');
const { spawnSync } = require('child_process');
const debug = require('./debug.js');
const network = require('./network.js');

let processes = [];

class Process {
    constructor(name, cmd) {
        this.name = name;
        this.cmd = cmd;
    }
}

// An error whose message is safe to show to the visitor.
class UserError extends Error {}

const cfg = yaml.load(fs.readFileSync('src/process.yaml', 'utf8'));
const sandboxCmd = Array.isArray(cfg.sandbox) ? cfg.sandbox : cfg.sandbox.split(' ');
const netProfiles = network.profiles(cfg);

for (const p of netProfiles.values())
    if (!network.isSetUp(p))
        console.log(`Warning: network ${p.bridge} (${p.domains.join(', ')}) is not set up; ` +
            'programs using it will run without network access. Run `node src/network.js setup` as root.');

// Convert '512M' style sizes into bytes for Firejail's --rlimit-* options.
function toBytes(size) {
    const match = String(size).trim().match(/^(\d+)\s*([KMG]?)B?$/i);
    if (!match)
        throw new Error(`process.yaml: invalid size '${size}'`);
    const units = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
    return Number(match[1]) * units[match[2].toUpperCase()];
}

// Build the full argv for a sandboxed command: firejail, its options, the
// network for this entry, its resource limits (merged over the top-level
// defaults), and finally 'sh -c <cmd>'.
function sandboxArgs(entry, cmd) {
    const limits = Object.assign({}, cfg.limits, entry.limits);
    let args = sandboxCmd.slice();

    // Programs with a `net` list join their network's bridge instead of
    // --net=none, and reach the internet only through its proxy. If the
    // network was not set up, they keep --net=none.
    const profile = network.profileFor(netProfiles, '', entry);
    if (profile && network.isSetUp(profile)) {
        args = args.filter(arg => !arg.startsWith('--net='));
        args.push(`--net=${profile.bridge}`);
        for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'])
            args.push(`--env=${name}=${profile.proxy}`);
    }

    if (limits.nproc != null)
        args.push(`--rlimit-nproc=${limits.nproc}`);
    if (limits.as != null)
        args.push(`--rlimit-as=${toBytes(limits.as)}`);
    if (limits.fsize != null)
        args.push(`--rlimit-fsize=${toBytes(limits.fsize)}`);
    if (limits.timeout != null)
        args.push(`--timeout=${limits.timeout}`);

    return args.concat('sh', '-c', cmd);
}

// Environment for Firejail itself. Firejail copies its environment into the
// sandbox, so the server's own variables must not be passed through.
// 'container' tells Firejail it is running inside a container; without it
// Firejail 0.9.72 mistakes Docker for an existing sandbox and runs the
// command with no sandboxing at all.
function sandboxEnv() {
    const env = {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: os.userInfo().homedir,
    };
    for (const key of ['container', 'LANG'])
        if (process.env[key])
            env[key] = process.env[key];
    return env;
}

// Pool of unprivileged users that sandboxes run as: the members of this
// group, one per running sandbox. Per-user kernel limits such as
// RLIMIT_NPROC count every process a UID owns, so if all sandboxes shared
// one user, a fork bomb in one would stop every other visitor's programs
// from starting. The server starts Firejail as a pool user through sudo
// (see docker/sudoers). Without the group, sandboxes run as the server's
// own user.
const SANDBOX_GROUP = 'demonic-sandbox';

function sandboxUsers() {
    let group;
    try {
        group = fs.readFileSync('/etc/group', 'utf8').split('\n')
            .map(line => line.split(':'))
            .find(fields => fields[0] == SANDBOX_GROUP);
    } catch (err) {
        return [];
    }
    if (!group)
        return [];

    return fs.readFileSync('/etc/passwd', 'utf8').split('\n')
        .map(line => line.split(':'))
        .filter(fields => fields[3] == group[2])
        .map(fields => ({ name: fields[0], home: fields[5] }));
}

const userPool = sandboxUsers();
const freeUsers = userPool.slice();

if (userPool.length == 0)
    console.log(`Warning: no '${SANDBOX_GROUP}' users; all sandboxes share the server's user, ` +
        'so one visitor can exhaust the process limit for everyone.');

// Wrap sandbox argv so that it runs as a free pool user. Returns the argv,
// environment and the user (to hand back with releaseUser), or throws a
// UserError when every pool user is busy.
function asSandboxUser(args, env) {
    if (userPool.length == 0)
        return { args, env, user: null };

    const user = freeUsers.shift();
    if (!user)
        throw new UserError('demonic: too many programs running right now, please try again soon\n');

    env = Object.assign({}, env, { HOME: user.home });
    return { args: ['sudo', '-n', '-u', user.name, '--'].concat(args), env, user };
}

function releaseUser(user) {
    if (user)
        freeUsers.push(user);
}

// Spawn a sandboxed command in a pseudo-terminal.
function spawnSandbox(entry, cmd, env, dims) {
    const run = asSandboxUser(sandboxArgs(entry, cmd), env);
    // The pty's terminal type; the sandbox also sets TERM (process.yaml).
    const opt = { env: run.env, name: 'xterm-256color' };

    if (dims && dims.cols)
        opt.cols = dims.cols;

    if (dims && dims.rows)
        opt.rows = dims.rows;

    let child;
    try {
        child = pty.spawn(run.args[0], run.args.slice(1), opt);
    } catch (err) {
        releaseUser(run.user);
        throw err;
    }
    // Firejail kills everything left in the sandbox when it exits, so the
    // user is free again once the child is gone.
    child.onExit(() => releaseUser(run.user));
    return child;
}

// Run a script in a sandbox for 'entry' and fail if it prints a line
// starting with 'FAIL:' or does not finish.
function sandboxCheck(entry, script) {
    const run = asSandboxUser(sandboxArgs(entry, script + '; echo demonic-sandbox-done'), sandboxEnv());
    const res = spawnSync(run.args[0], run.args.slice(1), { env: run.env, encoding: 'utf8', timeout: 30000 });
    releaseUser(run.user);
    const out = (res.stdout || '') + (res.stderr || '');
    if (res.error || !/demonic-sandbox-done/.test(out) || /FAIL:/.test(out))
        throw new Error('sandbox self-test failed:\n' + (res.error || '') + out);
}

// Refuse to start unless a sandboxed command really runs inside the chroot,
// as a non-root user, and cannot modify the chroot. Firejail can fall back
// to running a command unsandboxed (see sandboxEnv), and --quiet hides the
// warning, so check for a marker file that only exists in the chroot.
// For each network, check that the proxy is reachable and the internet is
// not.
function selfTest() {
    const marker = '/etc/demonic-chroot';
    if (fs.existsSync(marker))
        throw new Error(`sandbox self-test: ${marker} exists on the host; cannot tell host from chroot`);

    // Only run the other checks once we know we are in the chroot, so a
    // failed sandbox can never touch the host's files.
    const checks = [
        ['test "$(id -u)" != 0', 'sandboxed commands run as root; run the server as a non-root user'],
        ['! test -w /usr', '/usr is writable inside the sandbox'],
        [`! touch ${marker} 2>/dev/null`, 'the chroot is writable inside the sandbox'],
    ];
    sandboxCheck({}, `if test -e ${marker}; then ` +
        checks.map(([test, msg]) => `{ ${test} || echo 'FAIL: ${msg}'; }; `).join('') +
        `else echo 'FAIL: command did not run inside the chroot'; fi`);

    for (const p of netProfiles.values()) {
        if (!network.isSetUp(p))
            continue;
        const [host, port] = p.proxy.replace('http://', '').split(':');
        sandboxCheck({ net: p.domains }, `bash -c '` +
            `(exec 3<>/dev/tcp/${host}/${port}) 2>/dev/null || echo "FAIL: ${p.bridge}: proxy unreachable"; ` +
            `timeout 3 bash -c "exec 3<>/dev/tcp/1.1.1.1/443" 2>/dev/null && echo "FAIL: ${p.bridge}: direct internet access"; true'`);
    }
}

selfTest();

for (let prog in cfg.progs) {
    let progObj = cfg.progs[prog] || {};

    const spawnCmd = (args, dims) => {
        let cmd = args;

        if (progObj.cmd)
            cmd = progObj.cmd.concat(' ', args.split(' ').slice(1).join(' '));

        debug("cmd:", cmd);
        return spawnSandbox(progObj, cmd, sandboxEnv(), dims);
    }

    processes.push(new Process(prog, spawnCmd));
}

// Snippets travel into the sandbox base64-encoded in this environment
// variable (Firejail passes its environment through, while its own
// arguments are capped at 4128 bytes). The kernel caps a single
// environment string at 128 KiB, so keep the encoded code well under that.
const MAX_CODE_BYTES = 64 * 1024;

for (let lang in cfg.langs) {
    let langObj = cfg.langs[lang];

    const spawnCmd = (code, dims) => {
        code = String(code == null ? '' : code);
        if (Buffer.byteLength(code) > MAX_CODE_BYTES)
            throw new UserError(`${lang}: code is larger than ${MAX_CODE_BYTES / 1024} KiB\n`);

        // The sandbox writes the code into its own private /tmp (a tmpfs
        // from --private-tmp), e.g. /tmp/demonic/main.c, and compiles or
        // runs it from there. Nothing is written to the chroot, so
        // --private-tmp or a read-only chroot cannot hide it. /tmp is used
        // rather than the home directory because Firejail mounts the
        // private home noexec, which would stop compiled programs running.
        let langCmd = langObj.cmd;
        if (Array.isArray(langCmd))
            langCmd = langCmd.join(';');

        const dir = '/tmp/demonic';
        langCmd = langCmd.replace(/<path>/g, `${dir}/main`);
        langCmd = langCmd.replace(/<dir>/g, dir);
        langCmd = langCmd.replace(/<url>/g, cfg.url);

        const cmd = `mkdir -p ${dir} && cd ${dir} && printf %s "$DEMONIC_CODE" | base64 -d > main.${langObj.ext} ` +
            `&& unset DEMONIC_CODE && { ${langCmd}; }`;
        const env = sandboxEnv();
        env.DEMONIC_CODE = Buffer.from(code).toString('base64');

        return spawnSandbox(langObj, cmd, env, dims);
    }

    processes.push(new Process(lang, spawnCmd));
}

module.exports = processes;
module.exports.UserError = UserError;
