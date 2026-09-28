const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const pty = require('node-pty');
const { spawnSync } = require('child_process');

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

// Snippets travel into the sandbox base64-encoded in this environment
// variable (Firejail passes its environment through, while its own
// arguments are capped at 4128 bytes). The kernel caps a single
// environment string at 128 KiB, so keep the encoded code well under that.
const MAX_CODE_BYTES = 64 * 1024;

for (let lang in cfg.langs) {
    let langObj = cfg.langs[lang];

    const spawnCmd = (code) => {
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
        const spawnArgs = sandboxArgs(langObj, cmd);

        const env = sandboxEnv();
        env.DEMONIC_CODE = Buffer.from(code).toString('base64');

        return new pty.spawn(spawnArgs[0], spawnArgs.slice(1), { env });
    }

    processes.push(new Process(lang, spawnCmd));
}

module.exports = processes;
module.exports.UserError = UserError;
