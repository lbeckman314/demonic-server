const fs = require('fs');
const server = require('./config.js');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });
const programs = require('./programs.js');
const BSON = require('bson');

// heartbeat interval (attempts to reconnect if connection is broken)
function noop() {}

function heartbeat() {
    this.isAlive = true;
}

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();

        ws.isAlive = false;
        ws.ping(noop);
    });
}, 3000);

// reference to spawned child process.
// actions for child's stdout, stdin, stderr, close
// are handled below.

console.log("Waiting for clients...");
server.listen(process.argv[2] || 8181);

wss.on('connection', function connection(ws) {
    let child = programs[0].child;
    console.log("Client connected!");
    let first = true;

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    files = ["m1", "m2"];
    userPrompt = "> ";

    ws.on('message', async function incoming(message) {
        let command = '';
        let code = '';
        let language = '';
        let mode = '';

        try {
            //console.log('message:', message);
            message = BSON.deserialize(message);

            if (message.command) {
                command = message.command;
            }

            if (message.code) {
                code = message.code;
                command = message.language;
                mode = message.mode;
            }
        } catch(err) {
            command = message;
        }

        //console.log('command:', command);
        //console.log('COMMAND:', command);

        if (mode == 'code') {
            let language = message.language;
            let code = message.code;
            file = `/tmp/tmp.${Math.random()}`;

            switch (language) {
                case 'python':
                    write(file, code);
                    command = `python3 ${file}`;
                    break;
                case 'javascript':
                    write(file, code);
                    command = `node ${file}`;
                    break;
                case 'clike':
                    write(file, code, '.c');
                    command = `gcc -o ${file} ${file}.c && ${file}`;
                    break;
                case 'markdown':
                    write(file, code);
                    command = `markdown ${file}`;
                    break;
            }
        }

        if (command == "ping") {
            ws.send("pong");
            return;
        }

        else if (command == "close") {
            ws.close();
            return;
        }

        if (first == true) {
            first = false;

            if (message == ":(){ :|:& };:" || command == "sudo rm -rf /*") {

                first = true;
                let song = "Daisy, Daisy,\n" +
                    "Give me your answer, do!\n" +
                    "I'm half crazy,\n" +
                    "All for the love of you!\n"

                ws.send(song , function ack(error) {
                    console.error("ERROR:", error);
                });
                ws.send(userPrompt, function ack(error) {
                    console.error("ERROR:", error);
                });
            }

            else {
                console.log('command:', command);
                commands = command.split(" ");
                let found = false;

                // for all programs
                for (i = 0; i < programs.length; i++) {
                    // for all names and aliases of each program
                    for (n = 0; n < programs[i].name.length; n++) {
                        // if the first word of the user command matches a name/alias
                        if (commands[0] === programs[i].name[n]) {
                            //console.log('child eval()', eval(programs[i].command)());
                            //console.log('typeof child eval()', typeof eval(programs[i].command)());
                            child = eval(programs[i].command)();
                            //console.log('typeof child:', typeof child);
                            if (typeof child == 'function') {
                                child = await child();
                            }
                            //console.log('new typeof child:', typeof child);
                            //console.log('new child:', child);

                            // emulates stderr
                            if (programs[i].getError()) {
                                ws.send(programs[i].getError());
                                ws.send(userPrompt);
                                first = true;
                                programs[i].setError(null);
                            }

                            // emulates stdout
                            else if (programs[i].getMessage()) {
                                ws.send(programs[i].getMessage());
                                ws.send(userPrompt);
                                first = true;
                                programs[i].setMessage(null);
                            }


                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                    first = true;
                    console.log("Invalid program.");
                    ws.send("Invalid program.\n", function ack(error) {
                        console.error("ERROR:", error);
                    });
                    ws.send(userPrompt, function ack(error) {
                        console.error("ERROR:", error);
                    });

                    child.kill("SIGINT");
                }
            }

            //console.log('child:', child);
            //console.log('typeof child:', typeof child);

            // child is from "psuedo command" like "ls"
            if (typeof child == 'string') {
                let data = child;
                ws.send(data, function ack(error) {
                    console.error("ERROR:", error);
                });

                first = true;
                ws.send(userPrompt, function ack(error) {
                    console.error("ERROR:", error);
                });
            }

            // child is spawned process
            else {
                child.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                    ws.send(data, function ack(error) {
                        console.error("ERROR:", error);
                    });
                });

                child.stderr.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                    ws.send(data.toString(), function ack(error) {
                        console.error("ERROR:", error);
                    });
                });

                child.on('close', (code) => {
                    console.log(`child process exited with code ${code}`);
                    first = true;
                    child.kill("SIGINT");
                    ws.send(userPrompt, function ack(error) {
                        console.error("ERROR:", error);
                    });
                });
            }

        }

        else {
            // signals
            if (command == "SIGINT") {
                ws.send("SIGINT received.\n", function ack(error) {
                    console.error("ERROR:", error);
                });
                child.kill("SIGINT");
                first = true;
            }
            if (command == "SIGTSTP") {
                ws.send("SIGTSTP received.\n", function ack(error) {
                    console.error("ERROR:", error);
                });
                child.kill("SIGTSTP");
                first = true;
            }

            // stdin
            else {
                console.log("writing to child:", command);
                child.stdin.write(command + "\n");
            }
        }
    });
});


function write(file, code, ext = '') {
    let filename = file + ext;
    fs.writeFile(filename, code, err => {
        if(err) {
            return console.log(err);
        }
    });
    console.log(`wrote ${code} to ${filename}`);
}

function read(file) {
    fs.readFile(file, (err, data) => { 
        if (err) throw err; 
        if(err) {
            return console.log(err);
        }
        return data;
    }) 
}
