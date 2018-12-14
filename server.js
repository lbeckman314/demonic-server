const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

const server = require('./config.js');

const wss = new WebSocket.Server({ server });

console.log("Waiting for clients...");

wss.on('connection', function connection(ws) {
    console.log("Client connected!");

    const { spawn } = require('child_process');
    const options = {
        detached: true,
        stdio: 'pipe'
    };

    let child = spawn('sh', options);
    child.unref();
    child.stdin.setEncoding('utf-8');

    let first = true;
    programs = ["devilish", "matriz", "palindrome", "prime"];
    files = ["m1", "m2"];

    ws.on('message', function incoming(message) {
        //console.log('received: %s', message);
        if (first == true) {
            first = false;
            switch(message) {
                case "devilish":
                    child = spawn('sh', ['-c', './programs/devilish'], options);
                    //child = spawn('sh', ['-c', './programs/devilish -c "cd /home/demo/"'], options);
                    break;

                case "ls":
                    for (i = 0; i < programs.length; i++) {
                        ws.send(programs[i] + "\n");
                    }
                    for (i = 0; i < files.length; i++) {
                        ws.send(files[i] + "\n");
                    }
                    ws.send(">");
                    first = true;
                    break;

                case "matriz":
                    child = spawn('sh', ['-c', './programs/matriz.sh add ./files/m1 ./files/m1'], options);
                    break;

                case "palindrome":
                    child = spawn('sh', ['-c', './programs/palindrome.out'], options);
                    break;

                case "prime":
                    child = spawn('sh', ['-c', './programs/prime.out'], options);
                    break;

                default:
                    first = true;
                    console.log("Invalid program.");
                    ws.send("Invalid program.\n");
                    ws.send(">");
                    child.kill("SIGINT");
            }

            //let res = ""
            child.stdout.on('data', (data) => {
                //console.log(`stdout: ${data}`);
                //console.log("SENDING TO CLIENT:", data.toString());
                //res += data.toString();
                ws.send(data.toString());
                //return res;
                //res = ""
            });

            child.stderr.on('data', (data) => {
                //console.log(`stdout: ${data}`);
                //console.log("SENDING TO CLIENT:", data.toString());
                //res += data.toString();
                ws.send(data.toString());
                //return res;
                //res = ""
            });



            child.on('close', (code) => {
                console.log(`child process exited with code ${code}`);
                first = true;
                child.kill("SIGINT");
                ws.send("> ");
            });

        }


        else {
            child.stdin.write(message + "\n");
        }
        //child.stdin.write("exit\n");
        //child.stdin.end();

    });

});

server.listen(8181);
