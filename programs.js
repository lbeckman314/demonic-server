const { spawn } = require('child_process');
const options = {
    detached: true,
    stdio: 'pipe'
};


const programs = [];

class Program {

let child = spawn('ls', options);
child.unref();
child.stdin.setEncoding('utf-8');
child.stdout.setEncoding('utf-8');
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

module.exports = programs;
module.exports.child = child;
