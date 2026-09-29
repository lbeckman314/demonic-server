const WebSocket = require('ws');
const server = require('./config.js');
const processes = require('./process.js');
const { UserError } = processes;

// Comma-separated origins allowed to connect, e.g.
// DEMONIC_ALLOWED_ORIGINS=https://example.com,https://docs.example.com
// Unset allows any origin; '*' does so explicitly.
const allowedOrigins = (process.env.DEMONIC_ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
const maxSessionsPerIp = parseInt(process.env.DEMONIC_MAX_SESSIONS_PER_IP || '3', 10);
// Behind a reverse proxy every client appears to come from the proxy, so
// optionally take the address from X-Forwarded-For instead. Only enable this
// when the proxy sets the header, or clients can pick their own address.
const trustProxy = /^(1|true|yes)$/i.test(process.env.DEMONIC_TRUST_PROXY || '');

// Longest command line accepted at the prompt. Firejail rejects longer
// arguments anyway.
const MAX_COMMAND_LENGTH = 4096;

if (allowedOrigins.length == 0)
    console.log('Warning: DEMONIC_ALLOWED_ORIGINS is not set; accepting connections from any origin.');

const sessionsPerIp = new Map();

function clientIp(req) {
    if (trustProxy && req.headers['x-forwarded-for'])
        return req.headers['x-forwarded-for'].split(',')[0].trim();
    return req.socket.remoteAddress;
}

function originAllowed(origin) {
    if (allowedOrigins.length == 0 || allowedOrigins.includes('*'))
        return true;
    return allowedOrigins.includes(origin);
}

const wss = new WebSocket.Server({
    server,
    // Language snippets are capped at 64 KiB; leave room for JSON escaping.
    maxPayload: 1024 * 1024,
    verifyClient: ({ origin, req }, done) => {
        if (!originAllowed(origin)) {
            console.log(`Rejected connection from origin ${origin}`);
            return done(false, 403, 'Origin not allowed');
        }
        if ((sessionsPerIp.get(clientIp(req)) || 0) >= maxSessionsPerIp)
            return done(false, 429, 'Too many sessions');
        done(true);
    },
});
const port = process.argv[2] || 8181;
server.listen(port);

const proto = server.hasOwnProperty('cert') ? 'wss' : 'ws';
console.log(`Waiting for clients at ${proto}://localhost:` + port);

wss.on('connection', (ws, req) => {
    // Count sessions per address. verifyClient already turned away most
    // clients over the limit; this catches ones that raced past it.
    const ip = clientIp(req);

    // Protocol errors (oversized or malformed frames) are emitted here; ws
    // closes the connection afterwards. Without a listener they would crash
    // the whole server.
    ws.on('error', (err) => console.log(`WebSocket error from ${ip}: ${err.message}`));

    const sessions = (sessionsPerIp.get(ip) || 0) + 1;
    sessionsPerIp.set(ip, sessions);
    ws.on('close', () => {
        const left = sessionsPerIp.get(ip) - 1;
        if (left > 0)
            sessionsPerIp.set(ip, left);
        else
            sessionsPerIp.delete(ip);
    });
    if (sessions > maxSessionsPerIp) {
        ws.close(1013, 'Too many sessions');
        return;
    }

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

            try {
                child = program.cmd(obj.data);
            } catch (err) {
                if (!(err instanceof UserError))
                    console.log(err);
                send({err: err instanceof UserError ? err.message : 'failed to start\n'});
                send({exit: 1});
                return;
            }
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
            try {
                child = program.cmd(cmd, dims);
            } catch (err) {
                if (!(err instanceof UserError))
                    console.log(err);
                send({err: err instanceof UserError ? err.message : 'failed to start\n'});
                send({exit: 1});
                return;
            }
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

    else if (buffer.join('').length < MAX_COMMAND_LENGTH)
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

