const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

let processes = [];

class Process {
    constructor(name, cmd) {
        this.name = name;
        this.cmd = cmd;
    }
}

const cfg = yaml.load(fs.readFileSync('src/process.yml', 'utf8'));
const sandboxCmd = cfg.sandbox.split(' ');

for (let prog in cfg.progs) {
    let progObj = cfg.progs[prog];

    const spawnCmd = (args, dims) => {
        let spawnArgs;

        if (progObj.cmd) {
            let cmd = progObj.cmd.concat(' ', args.split(' ').slice(1).join(' '));
            spawnArgs = sandboxCmd.concat(cmd)
        }

        else
            spawnArgs = sandboxCmd.concat(args);

        let opt = {};

        if (dims.cols)
            opt.cols = dims.cols;

        if (dims.rows)
            opt.rows = dims.rows;

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
        const spawnArgs = sandboxCmd.concat(langCmd);

        let opt = {};

        let child = new pty.spawn(spawnArgs[0], spawnArgs.slice(1), opt);

        if (langObj.rm != false) {
            child.on('exit', async () => {
                fs.rmdir(dir, { recursive: true }, (err) => {
                    if (err) throw err;
                })
            });
        }

        return child;
    }

    processes.push(new Process(lang, spawnCmd));
}

module.exports = processes;

