const BSON = require('bson');
const WebSocket = require('ws');
const fs = require('fs');
const server = require('./config.js');
const {Process, processes} = require('./process.js');
const {spawn, exec} = require('child_process');

const wss = new WebSocket.Server({ server });
const port = process.argv[2] || 8181;
server.listen(port);
console.log('Waiting for clients at ws://localhost:' + port);

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
        obj = JSON.parse(message);
        if (obj.data != null) {
            data = obj.data;
        }
        console.log(obj.lang != null && obj.code != null);

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
            console.log('command:', command);
            if (command == null) {
                return;
            }

            // Close connection.
            if (command == 'close') {
                ws.close();
                return;
            }

            let commands = command.split(' ');
            program = findProcess(commands[0]);
            if (program == null) {
                const err = {'err': `${commands[0]}: command not found\n`};
                ws.send(JSON.stringify(err));
                const exit = {'exit': 1};
                ws.send(JSON.stringify(exit));
                return;
            }

            // If program has 'draw' attribute set to false,
            // inform client not to write to terminal (the program
            // will do so.)
            if (!program.draw) {
                const obj = {draw: false};
                ws.send(JSON.stringify(obj));
            }

            // Spawn child process and store reference in 'child' variable.
            const args = commands.slice(1);
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

