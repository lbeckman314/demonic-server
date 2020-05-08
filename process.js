const {spawn} = require('child_process');
const concat = require('concat-stream');
const fs = require('fs');
const toml = require('toml');
const pty = require('node-pty');

let processes = [];

class Process {
    constructor(name, comm) {
        this.name = name;
        this.comm = comm;
    }
}

let parsed = {};
fs.createReadStream('process.toml', 'utf8').pipe(concat((data) => {
    parsed = toml.parse(data);
    // '--rlimit-nproc=100',
    // '--rlimit-as=50000000',
    const sandbox = 'firejail';
    const args = [
        '--quiet',
        '--hostname=demonic',
        '--nice=10',
        '--private-home=/srv/chroot/home/demo',
        '--chroot=/srv/chroot',
        '--env=PATH=/home/demo/bin',
        'sh',
        '-c',
    ];

    for (const prop in parsed) {
        const proc = parsed[prop];
        let name = proc.name.split(' ');
        let userArgs = false;
        let command = proc.comm;
        if (Array.isArray(command)) {
            command = command.join(';');
        }

        if (proc.args) {
            userArgs = proc.args;
        }

        const options = {};

        // Program
        const comm = (arg) => {
            if (userArgs) {
                return new pty.spawn(sandbox, args.concat(`${command} ${arg}`), options);
            }

            return new pty.spawn(sandbox, args.concat(command), options);
        }

        // Language
        if (proc.file) {
            const comm = (code) => {
                let path = '';
                const writeDir = '/srv/chroot';
                const dir = '/tmp';
                const url = 'https://demo.liambeckman.com';

                // Create random file name with correct file extension.
                // Verify that file with same name does not exist.
                while (path.length == '') {
                    const id = Math.floor(Math.random() * 1e3);
                    path = `${dir}/tmp-${id}.${proc.file}`;
                }
                // Write code to file.
                fs.writeFileSync(`${writeDir}/${path}.${proc.file}`, code);

                let pathCommand = command.replace(/<path>/g, path);
                pathCommand = pathCommand.replace(/<dir>/g, dir);
                pathCommand = pathCommand.replace(/<url>/g, url);

                return new pty.spawn(sandbox, args.concat(pathCommand));
            }

            processes.push(new Process(name, comm));
            continue;
        }

        processes.push(new Process(name, comm));
    }
}));

module.exports = {Process, processes};

