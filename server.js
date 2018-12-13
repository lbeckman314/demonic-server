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

    //const child = spawn('./devilish');

    //console.log("child:", child);

    child.stdin.setEncoding('utf-8');
    //child.stdout.pipe(process.stdout);


    let first = true;

    ws.on('message', function incoming(message) {
        //console.log('received: %s', message);
        if (first == true) {
            first = false;
            switch(message) {
                case "devilish":
                    child = spawn('sh', ['-c', './devilish'], options);
                    break;
                case "prime":
                    child = spawn('sh', ['-c', './prime.out'], options);
                    break;
                case "palindrome":
                    child = spawn('sh', ['-c', './palindrome'], options);
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
                ws.send(">");
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
