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

    //child = spawn('firejail', ['--quiet', '--net=none', '--private', '--chroot=files/fire', '/usr/local/bin/devilish.out'], options);
    child = spawn('programs/devilish.out', options);
    child.unref();
    child.stdin.setEncoding('utf-8');
    child.stdout.setEncoding('utf-8');

    userPrompt = "> ";

    var buffer = "";


    child.stdout.on('data', (data) => {

        let sendData = data.toString();

        console.log(`stdout: ${data}`);
        console.log("SENDING TO CLIENT:", data.toString());
        //res += data.toString();
        ws.send(sendData, function ack(error) {
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




    ws.on('message', function incoming(message) {
        if (message.charCodeAt(0) == 13) {
            console.log('buffer: %s', buffer);

            console.log("writing to child:", buffer);
            child.stdin.write(buffer + "\n");
            //child.stdin.write("exit\n");
            //child.stdin.end();

            buffer = "";
        }

        else {
            buffer += message;
            console.log('received: %s', message);
        }

    });


});

server.listen(process.argv[2] || 8181);
