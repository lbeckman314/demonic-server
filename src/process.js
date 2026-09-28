const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const path = require('path');
const pty = require('node-pty');
const { spawnSync } = require('child_process');

let processes = [];

class Process {
    constructor(name, cmd) {
        this.name = name;
        this.cmd = cmd;
    }
}

const cfg = yaml.load(fs.readFileSync('src/process.yaml', 'utf8'));
const sandboxCmd = Array.isArray(cfg.sandbox) ? cfg.sandbox : cfg.sandbox.split(' ');

// Convert '512M' style sizes into bytes for Firejail's --rlimit-* options.
function toBytes(size) {
    const match = String(size).trim().match(/^(\d+)\s*([KMG]?)B?$/i);
    if (!match)
        throw new Error(`process.yaml: invalid size '${size}'`);
    const units = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
    return Number(match[1]) * units[match[2].toUpperCase()];
}

// Build the full argv for a sandboxed command: firejail, its options, the
// resource limits for this entry (merged over the top-level defaults), and
// finally 'sh -c <cmd>'.
function sandboxArgs(entry, cmd) {
    const limits = Object.assign({}, cfg.limits, entry.limits);
    const args = sandboxCmd.slice();

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

// Refuse to start unless a sandboxed command really runs inside the chroot.
// Firejail can fall back to running a command unsandboxed (see sandboxEnv),
// and --quiet hides the warning, so check for a marker file that only exists
// in the chroot and not on the host.
function selfTest() {
    const marker = '/etc/demonic-chroot';
    if (fs.existsSync(marker))
        throw new Error(`sandbox self-test: ${marker} exists on the host; cannot tell host from chroot`);

    const args = sandboxArgs({}, `test -e ${marker} && echo demonic-sandbox-ok`);
    const res = spawnSync(args[0], args.slice(1), { env: sandboxEnv(), encoding: 'utf8', timeout: 30000 });
    if (!/demonic-sandbox-ok/.test(res.stdout || ''))
        throw new Error('sandbox self-test failed: command did not run inside the chroot\n' +
            (res.error || '') + (res.stdout || '') + (res.stderr || ''));
}

selfTest();

for (let prog in cfg.progs) {
    let progObj = cfg.progs[prog] || {};

    const spawnCmd = (args, dims) => {
        let cmd = args;

        if (progObj.cmd)
            cmd = progObj.cmd.concat(' ', args.split(' ').slice(1).join(' '));

        const spawnArgs = sandboxArgs(progObj, cmd);

        let opt = { env: sandboxEnv() };

        if (dims.cols)
            opt.cols = dims.cols;

        if (dims.rows)
            opt.rows = dims.rows;

        console.log("DEBUG: spawnArgs: ", spawnArgs);
        console.log("DEBUG: spawnArgs[0]: ", spawnArgs[0]);
        console.log("DEBUG: spawnArgs.slice(1): ", spawnArgs.slice(1));
        return new pty.spawn(spawnArgs[0], spawnArgs.slice(1), opt);
    }

    processes.push(new Process(prog, spawnCmd));
}

for (let lang in cfg.langs) {
    let langObj = cfg.langs[lang];

    const spawnCmd = (code) => {
        // Create temporary directory to hold script files.
        // e.g. the directory for a C script on a UNIX machine would be '/tmp/demonic-abc123/'.
        // This directory would then have two files in it:
        //   - the script: 'main.c'
        //   - the executable: 'main'
        let dir = fs.mkdtempSync(path.join(cfg.root, os.tmpdir(), 'demonic-'));

        // Create file with correct file extension and write code to file.
        let exePath = path.join(dir, 'main');
        let srcPath = exePath + '.' + langObj.ext;
        fs.writeFileSync(srcPath, code);

        let langCmd = langObj.cmd;
        if (Array.isArray(langCmd))
            langCmd = langCmd.join(';');

        langCmd = langCmd.replace(/<path>/g, exePath.substr(cfg.root.length));
        langCmd = langCmd.replace(/<dir>/g, dir.substr(cfg.root.length));
        langCmd = langCmd.replace(/<url>/g, cfg.url);
        const spawnArgs = sandboxArgs(langObj, langCmd);

        let opt = { env: sandboxEnv() };

        let child = new pty.spawn(spawnArgs[0], spawnArgs.slice(1), opt);

        if (langObj.rm != false) {
            child.on('exit', () => {
                fs.rmdir(dir, { recursive: true }, (err) => {
                    if (err) console.log(err);
                })
            });
        }

        return child;
    }

    processes.push(new Process(lang, spawnCmd));
}

module.exports = processes;
