const WebSocket = require('ws');
const server = require('./ws-config.js');
const processes = require('./process.js');

const wss = new WebSocket.Server({ server });
const port = process.argv[2] || 8181;
server.listen(port);

const proto = server.hasOwnProperty('cert') ? 'wss' : 'ws';
console.log(`Waiting for clients at ${proto}://localhost:` + port);

wss.on('connection', (ws) => {
    // An ongoing process is present.
    // Incoming data should be sent to it's STDIN.
    let process = false;
    let child = {};
    let program = {};

    userPrompt = '> ';
    buffer = [];
    let obj = {};
    let data;

    ws.on('message', (msg) => {
        try {
            obj = JSON.parse(msg);
        } catch(err) {
            return;
        }

        if (obj.exit == 1) {
            child.kill();
            return;
        }

        if (obj.data != null)
            data = obj.data;

        // Language
        if (obj.lang != null && obj.code != null) {
            const loading = {'loading': 'true'};
            ws.send(JSON.stringify(loading));

            program = findProcess(obj.lang);

            if (program == null) {
                let err = {'err': `${obj.lang}: command not found\n`};
                ws.send(JSON.stringify(err));

                let exit = {'exit': 1};
                ws.send(JSON.stringify(exit));

                return;
            }
            ws.send(JSON.stringify({draw: false}));
            child = program.cmd(obj.code);
        }

        // Program
        else {
            // If a child process is ongoing.
            if (process) {
                child.write(data);
                return;
            }

            if (typeof data == 'undefined')
                return;

            if (data == '\u001b[2K\r') {
                buffer.length = 0;
                return;
            }

            if (data == '\f' || data == '\u0015' ||
                data == '\u001b[A' || data == '\u001b[B') {
                return;
            }

            if (data == '\r' && buffer.length == 0) {
                let exit = {'exit': 1};
                ws.send(JSON.stringify(exit));
                return;
            }

            // No process is ongoing, identify command and spawn process.
            let cmd = addToBuffer(buffer, data);

            if (cmd == null)
                return;

            ws.send(JSON.stringify({'cmd': cmd}));

            let cmds = cmd.split(/[\|;]/);
            let notFound = [];
            let found = [];

            for (const cmd of cmds) {
                const name = cmd.trim().split(' ')[0]
                program = findProcess(name);

                if (program == null) {
                    notFound.push(name);
                }
                else {
                    found.push(program);
                }
            }

            if (notFound.length > 0) {
                for (const cmd of notFound) {
                    const err = {'err': `${cmd}: command not found\n`};
                    ws.send(JSON.stringify(err));
                }
                ws.send(JSON.stringify({'exit': 1}));
                return;
            }

            program = found[0];

            // If program has 'draw' attribute set to false,
            // inform client not to write to terminal (the program
            // will do so.)
            if (!program.draw)
                ws.send(JSON.stringify({'draw': false}));

            const dims = {
                cols: obj.cols,
                rows: obj.rows,
            }

            // Spawn child process and store reference in 'child' variable.
            child = program.cmd(cmd, dims);
        }

        // STDOUT
        child.on('data', (data) => {
            const out = {'out': data};
            try {
                ws.send(JSON.stringify(out));
            } catch(err) {
                console.log(err);
            }
        });

        // STDERR
        child.on('error', (data) => {
            const err = {'err': data};
            ws.send(JSON.stringify(err));
        });

        // Exit Code
        child.on('exit', (code) => {
            const exit = {'exit': code};
            ws.send(JSON.stringify(exit));
            process = false;
        });

        process = true;
    });
});

function addToBuffer(buffer, data) {
    if (data.charCodeAt(0) == 13) {
        command = buffer.join('');
        buffer.length = 0;
        return command;
    }

    else if (data.charCodeAt(0) == 127) {
        let lastElement = buffer.pop();
        if (lastElement != null && lastElement.length > 1)
            buffer.push(lastElement.slice(0, -1));
    }

    else
        buffer.push(data);

    return null;
}

function findProcess(command) {
    // For all processes.
    for (const program of processes) {
        // If the first word of the user command matches a name/alias.
        if (command == program.name) {
            return program;
        }
    }

    // If no available program was found.
    return null;
}

