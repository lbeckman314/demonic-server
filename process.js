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
        this.options = {
            detached: true,
            stdio: 'inherit',
        };
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
        '--net=none',
        '--hostname=demonic',
        '--nice=10',
        '--private-home=/tmp/demonic/bin',
        'sh',
        '-c',
    ];

    for (const prop in parsed) {
        const process = parsed[prop];
        let name = process.name.split(' ');
        let userArgs = false;
        let command = process.comm;
        if (Array.isArray(command)) {
            command = command.join(';');
        }

        if (process.args) {
            userArgs = process.args;
        }

        // Program
        const comm = (arg) => {
            if (userArgs) {
                return new pty.spawn(shell, args.concat(`${command} ${arg}`), this.options);
            }

            return new pty.spawn(shell, args.concat(command), this.options);
        }

        // Language
        if (process.file) {
            const comm = (code) => {
                let path = '';
                const dir = '/tmp/demonic';

                // Create random file name with correct file extension.
                // Verify that file with same name does not exist.
                while (path.length == '') {
                    const id = Math.floor(Math.random() * 1e3);
                    path = `${dir}/tmp-${id}`;
                }
                // Write code to file.
                fs.writeFileSync(`${path}.${process.file}`, code);

                let pathCommand = command.replace(/<path>/g, path);
                pathCommand = pathCommand.replace(/<dir>/g, dir);

                return new pty.spawn(shell, args.concat(pathCommand));
            }

            processes.push(new Process(name, comm));
            continue;
        }

        processes.push(new Process(name, comm));
    }
}));

module.exports = {Process, processes};

