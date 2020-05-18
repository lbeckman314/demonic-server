const BSON = require('bson');
const WebSocket = require('ws');
const fs = require('fs');
const server = require('./config.js');
const {Process, processes} = require('./process.js');
const {spawn, exec} = require('child_process');

const wss = new WebSocket.Server({ server });
const port = process.argv[2] || 8181;
server.listen(port);
console.log('Waiting for clients at wss://localhost:' + port);

wss.on('connection', (ws) => {
    console.log('Client connected!');

    // An ongoing process is present.
    // Incoming data should be sent to it's STDIN.
    let process = false;
    let child = {};
    let program = {};

    userPrompt = '> ';
    buffer = [];
    let obj = {};
    let data = '';

    ws.on('message', (message) => {
        try {
            obj = JSON.parse(message);
        } catch(err) {
            console.error('Unable to parse JSON:', message);
            return;
        }

        if (obj.data != null) {
            data = obj.data;
        }

        // Language
        if (obj.lang != null && obj.code != null) {
            const loading = {'loading': 'true'};
            ws.send(JSON.stringify(loading));

            program = findProcess(obj.lang);
            ws.send(JSON.stringify({draw: false}));
            child = program.comm(obj.code);
        }

        // Program
        else {
            // If a child process is ongoing.
            if (process) {
                let command = data;

                child.write(command);
                return;
            }

            // No process is ongoing, identify command and spawn process.
            let command = buff(buffer, data);
            if (command == null) {
                return;
            }

            // Close connection.
            if (command == 'close') {
                ws.close();
                return;
            }

            let commands = command.split(/[\|;]/);
            let notFound = [];
            let found = [];
            for (const command of commands) {
                const name = command.trim().split(' ')[0]
                program = findProcess(name);
                if (program == null) {
                    notFound.push(name);
                }
                else {
                    found.push(program);
                }
            }
            if (notFound.length > 0) {
                for (const comm of notFound) {
                    const err = {'err': `${comm}: command not found\n`};
                    ws.send(JSON.stringify(err));
                }
                const exit = {'exit': 1};
                ws.send(JSON.stringify(exit));
                return;
            }

            program = found[0];

            // If program has 'draw' attribute set to false,
            // inform client not to write to terminal (the program
            // will do so.)
            if (!program.draw) {
                const obj = {draw: false};
                ws.send(JSON.stringify(obj));
            }

            // Spawn child process and store reference in 'child' variable.
            const args = command.split(' ').slice(1).join(' ');
            child = program.comm(args);
        }

        // STDOUT
        child.on('data', (data) => {
            const out = {'out': data};
            ws.send(JSON.stringify(out));
        });

        // STDERR
        child.on('error', (data) => {
            const err = {'err': data};
            ws.send(JSON.stringify(err));
        });

        // termination
        child.on('exit', (code) => {
            const exit = {'exit': code};
            ws.send(JSON.stringify(exit));
            process = false;
        });

        process = true;
    });
});

function buff(buffer, data) {
    if (data.charCodeAt(0) == 13) {
        command = buffer.join('');
        buffer.length = 0;
        return command;
    }
    else if (data.charCodeAt(0) == 127) {
        buffer.pop();
    }
    else {
        buffer.push(data);
    }
    return null;
}

function findProcess(command) {
    // For all processes.
    for (const program of processes) {
        for (const name of program.name) {
            // If the first word of the user command matches a name/alias.
            if (command == name) {
                return program;
            }
        }
    }

    // If no available program was found.
    return null;
}

