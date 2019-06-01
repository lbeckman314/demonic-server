const WebSocket = require('ws');
const fs = require('fs');
const server = require('./config.js');

const AU = require('ansi_up');
const ansi_up = new AU.default;


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

const { spawn } = require('child_process');
const options = {
    detached: true,
    stdio: 'pipe'
};

const options_shell = {
    detached: true,
    stdio: 'pipe',
    shell: true,
    cwd: 'programs/wyeast'
};



wss.on('connection', function connection(ws) {
    console.log("Client connected!");
    let first = true;

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    let child = spawn('ls', options);
    child.unref();
    child.stdin.setEncoding('utf-8');
    child.stdout.setEncoding('utf-8');

    files = ["m1", "m2"];

    const programs = [];

    class Program {
        constructor(name, command) {
            this.name = name;
            this.command = command;
            this.error = null;
            this.message = null;
            programs.push(this);
        }
        echo(name, command) {
            console.log(`My name is ${this.name} and my command is ${this.command}.`);
        }
        run(command) {
            command();
        }
        getError() {
            return this.error;
        }
        setError(message) {
            this.error = message;
        }

        getMessage() {
            return this.message;
        }
        setMessage(message) {
            this.message = message;
        }
    }

    var palindrome = new Program(
        ["palindrome", "./palindrome"],
        function() {
            child = spawn('programs/palindrome.out', options);
        });

    var scheme = new Program(
        ["scheme"],
        function() {
            child = spawn('scheme48', options);
        });

    var haskell = new Program(
        ["haskell"],
        function() {
            child = spawn('ghci', options);
        });

    var cat = new Program(
        ["cat"],
        function() {
            child = spawn('cat', [`./files/${messages[1]}`], options);
        });

    var ls = new Program(
        ["ls"],
        function() {
            let list = "";
            for (let i = 0; i < programs.length; i++) {
                list += programs[i].name[0] + "\n";
            }
            for (let i = 0; i < files.length; i++) {
                list += files[i] + "\n";
            }
            this.setMessage(list);

        });

    var matriz = new Program(
        ["matriz", "./matriz"],
        function() {
            /*
        for (i = 0; i < messages.length; i++) {
            console.log(`!!: ${messages[i]}`);
        }
        */
            if (messages[3]) {
                child = spawn('programs/matriz.sh', [ `${messages[1]}`, `./files/${messages[2]}`, `./files/${messages[3]}`], options);
            }
            else {
                console.log(`!!: ${messages[0]} ${messages[1]} ${messages[2]}`);
                child = spawn('programs/matriz.sh', [ `${messages[1]}`, `./files/${messages[2]}`], options);
            }
        });

    var prime = new Program(
        ["prime", "./prime"],
        function() {
            if (messages[1] <= 1000000) {
                child = spawn('programs/prime.out', [`${messages[1]}`], options);
            }

            else {
                this.setError("Prime number must be less than or equal to 1000000.\n");
            }
        });

    var withfeathers = new Program(
        ["withfeathers", "python withfeathers"],
        function() {
            child = spawn('python3',  ['programs/withfeathers/main.py', `${messages[1]}`], options);
        });

    var devilish = new Program(
        ["devilish", "./devilish"],
        function() {
            child = spawn('firejail', ['--quiet', '--net=none', '--hostname=demonic', '--rlimit-nproc=100', '--rlimit-as=50000000', '--nice=10', '--private=/home/demo', '--private-tmp', '--chroot=/var/www/demo/files/fire', '/usr/local/bin/devilish.out'], options);
        });

    var zigzag_server = new Program(
        ["zigzag-server"],
        function() {
            child = spawn('python3',  ['-u', 'programs/zigzag/zigzag-server.py'], options);
        });

    var zigzag_client = new Program(
        ["zigzag-client"],
        function() {
            child = spawn('programs/zigzag/zigzag-client.out', [`127.0.1.1`, `${messages[1]}`], options);
        });

    var wyeast = new Program(
        ["wyeast"],
        function() {
            child = spawn('./buildworld && ./wyeast',  options_shell);
        });

    var voy = new Program(
        ["voy"],
        function() {
            if (messages[2]) {
                child = spawn('voy',  [`${messages[1]}`, `${messages[2]}`], options);
            }
            else if (messages[1]) {
                child = spawn('voy',  [`${messages[1]}`], options);
            }
            else {
                child = spawn('voy', options);
            }
        });

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

            }

            else {

                messages = message.split(" ");
                for (i = 0; i < messages.length; i++) {
                    //console.log(messages[i]);
                }

                let found = false;
                for (i = 0; i < programs.length; i++) {
                    for (n = 0; n < programs[i].name.length; n++) {
                        if (messages[0] === programs[i].name[n]) {
                            console.log("calling:", programs[i].name[n]);
                            programs[i].command();
                            console.log("geterror:", programs[i].getError());
                            console.log("getMessage:", programs[i].getMessage());
                            if (programs[i].getError()) {
                                ws.send(programs[i].getError());
                                first = true;
                                programs[i].setError(null);
                            }
                            if (programs[i].getMessage()) {
                                ws.send(programs[i].getMessage());
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

                    child.kill("SIGINT");
                }
            }

            child.stdout.on('data', (data) => {
                let sendData = ansi_up.ansi_to_html(data)

                console.log(`stdout: ${data}`);
                ws.send(sendData, function ack(error) {
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
    });
});

server.listen(process.argv[2] || 8181);
