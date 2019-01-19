const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

const server = require('./config.js');

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
}, 30000);


const wss = new WebSocket.Server({ server });

console.log("Waiting for clients...");

wss.on('connection', function connection(ws) {
    console.log("Client connected!");

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    const { spawn } = require('child_process');
    const options = {
        detached: true,
        stdio: 'pipe'
    };

    let child = spawn('ls', options);
    child.unref();
    child.stdin.setEncoding('utf-8');

    let first = true;
    programs = ["matriz", "palindrome", "prime", "withfeathers"];
    files = ["m1", "m2"];
    userPrompt = "> ";

    ws.on('message', function incoming(message) {
        //console.log('received: %s', message);
        if (message == "ping") {
            ws.send("pong");
            return;
        }

        else if (message == "close") {
            ws.close();
            return;
        }

        if (first == true) {
            first = false;


            console.log(message);
            if (message == ":(){ :|:& };:" || message == "sudo rm -rf /*") {

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


                messages = message.split(" ");
                for (i = 0; i < messages.length; i++) {
                    //console.log(messages[i]);
                }

                switch(messages[0]) {

                    case "cat":
                        child = spawn('cat', [`./files/${messages[1]}`], options);
                        break;

                    case "ls":
                        for (i = 0; i < programs.length; i++) {
                            ws.send(programs[i] + "\n", function ack(error) {
                                console.error("ERROR:", error);
                            });
                        }
                        for (i = 0; i < files.length; i++) {
                            ws.send(files[i] + "\n", function ack(error) {
                                console.error("ERROR:", error);
                            });
                        }
                        ws.send(userPrompt, function ack(error) {
                            console.error("ERROR:", error);
                        });
                        first = true;
                        break;


                    case "./matriz":
                    case "matriz":
                        for (i = 0; i < messages.length; i++) {
                            //console.log(`!!: ${messages[i]}`);
                        }
                        if (messages[3]) {
                            child = spawn('programs/matriz.sh', [ `${messages[1]}`, `./files/${messages[2]}`, `./files/${messages[3]}`], options);
                        }
                        else {
                            child = spawn('programs/matriz.sh', [ `${messages[1]}`, `./files/${messages[2]}`], options);
                        }
                        break;

                    case "TAB":
                        ws.send("TAB received\n", function ack(error) {
                            console.error("ERROR:", error);
                        });
                        ws.send(userPrompt, function ack(error) {
                            console.error("ERROR:", error);
                        });
                        first = true;
                        break;

                    case "./palindrome":
                    case "palindrome":
                        child = spawn('programs/palindrome.out', options);
                        break;

                    case "./prime":
                    case "prime":
                        if (messages[1] <= 1000000) {
                            child = spawn('programs/prime.out', [`${messages[1]}`], options);
                        }

                        else {
                            ws.send("Prime number must be less than or equal to 1000000.\n", function ack(error) {
                                console.error("ERROR:", error);
                            });
                            first = true;
                            ws.send(userPrompt, function ack(error) {
                                console.error("ERROR:", error);
                            });
                            child.kill("SIGINT");
                        }
                        break;

                    case "python withfeathers":
                    case "withfeathers":
                        child = spawn('python3',  ['programs/withfeathers/main.py', `${messages[1]}`], options);
                        break;


                    case "./devilish":
                    case "devilish":
                    child = spawn('firejail', ['--quiet', '--net=none', '--private', '--chroot=files/fire', '/usr/local/bin/devilish.out'], options);
                        break;

                    case "zigzag-server":
                        child = spawn('python3',  ['-u', 'programs/zigzag/zigzag-server.py', '-a'], options);
                        break;

                    case "zigzag-client":
                        child = spawn('programs/zigzag/zigzag-client.out', [`127.0.1.1`, `${messages[1]}`], options);
                        break;

                    case "scheme":
                        child = spawn('scheme48', options);
                        break;

                    case "haskell":
                        child = spawn('ghci', options);
                        break;

                    default:
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

            //let res = ""
            child.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
                //console.log("SENDING TO CLIENT:", data.toString());
                //res += data.toString();
                ws.send(data.toString(), function ack(error) {
                    console.error("ERROR:", error);
                });
                //return res;
                //res = ""
            });

            child.stderr.on('data', (data) => {
                console.log(`stdout: ${data}`);
                //console.log("SENDING TO CLIENT:", data.toString());
                //res += data.toString();
                ws.send(data.toString(), function ack(error) {
                    console.error("ERROR:", error);
                });
                //return res;
                //res = ""
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


        else {
            if (message == "SIGINT") {
                ws.send("SIGINT received.\n", function ack(error) {
                    console.error("ERROR:", error);
                });
                child.kill("SIGINT");
                first = true;
            }
            if (message == "SIGTSTP") {
                ws.send("SIGTSTP received.\n", function ack(error) {
                    console.error("ERROR:", error);
                });
                child.kill("SIGTSTP");
                first = true;
            }
            else {
				console.log("writing to child:", message);
                child.stdin.write(message + "\n");
            }
        }
        //child.stdin.write("exit\n");
        //child.stdin.end();

    });

});

server.listen(process.argv[2] || 8181);
