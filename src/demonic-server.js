const WebSocket = require('ws');
const server = require('./config.js');
const processes = require('./process.js');

const wss = new WebSocket.Server({ server });
const port = process.argv[2] || 8181;
server.listen(port);

const proto = server.hasOwnProperty('cert') ? 'wss' : 'ws';
console.log(`Waiting for clients at ${proto}://localhost:` + port);

wss.on('connection', (ws) => {
    console.log('Client connected!');
    let process = false;
    let program = {};
    let buffer = [];
    let obj = {};
    let child = {};

    const send = (data) => {
        try {
            if (ws.readyState == WebSocket.OPEN)
                ws.send(JSON.stringify(data));
        } catch (err) {
            console.log(err);
        }
    }

    ws.on('close', () => {
        if (typeof child.kill == 'function')
            child.kill();
    });

    ws.on('message', (msg) => {
        try {
            obj = JSON.parse(msg);
        } catch(err) {
            return;
        }
        console.log("DEBUG: obj:", obj)

        // Language
        if (obj.lang != null) {
            send({loading: 'true'});

            program = findProcess(obj.lang);
            if (program == null) {
                send({err: `${obj.lang}: command not found\n`});
                send({exit: 1});

                return;
            }
            send({draw: false});

            child = program.cmd(obj.data);
            process = true;
        }

        // Program
        else {
            // If a child process is ongoing.
            if (process) {
                child.write(obj.data);
                return;
            }

            if (typeof obj.data == 'undefined')
                return;

            if (obj.data == '\u001b[2K\r') {
                buffer.length = 0;
                return;
            }

            if (obj.data == '\f' || obj.data == '\u0015' ||
                obj.data == '\u001b[A' || obj.data == '\u001b[B') {
                return;
            }

            if (obj.data == '\r' && buffer.length == 0) {
                send({exit: 1});
                return;
            }

            // No process is ongoing, identify command and spawn process.
            let cmd = addToBuffer(buffer, obj.data);

            if (cmd == null)
                return;

            send({cmd: cmd});

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
                for (const cmd of notFound)
                    send({err: `${cmd}: command not found\n`});

                send({exit: 1});
                return;
            }

            program = found[0];

            // If program has 'draw' attribute set to false,
            // inform client not to write to terminal (the program
            // will do so.)
            if (!program.draw)
                send({draw: false});

            const dims = {
                cols: obj.cols,
                rows: obj.rows,
            }

            // Spawn child process and store reference in 'child' variable.
            child = program.cmd(cmd, dims);
        }

        // STDOUT
        child.on('data', (data) => {
            try {
                send({out: data});
            } catch(err) {
                console.log(err);
            }
        });

        // STDERR
        child.on('error', (data) => {
            send({err: data});
        });

        // Exit Code
        child.on('exit', (code) => {
            const exit = {exit: code};
            send(exit);
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

