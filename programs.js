const { spawn, exec } = require('child_process');
const programs = [];

class Program {
    constructor(name, command) {
        this.name = name;
        this.command = command;
        this.error = null;
        this.message = null;

        this.child = spawn('ls', this.options);

        this.options = {
            detached: true,
            stdio: 'pipe',
        };

        this.options_shell = {
            detached: true,
            stdio: 'pipe',
            shell: true,
            cwd: 'programs/wyeast',
        };

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

let palindrome = new Program(
    ["palindrome", "./palindrome"],
    function() {
        return spawn('programs/palindrome.out', this.options);
    });

let scheme = new Program(
    ["scheme"],
    function() {
        return spawn('scheme48', this.options);
    });

let haskell = new Program(
    ["haskell"],
    function() {
        return spawn('ghci', this.options);
    });

let cat = new Program(
    ["cat"],
    function() {
        return spawn('cat', [`./files/${commands[1]}`], this.options);
    });

let ls = new Program(
    ["ls"],
    function() {
        let list = "";
        for (let i = 0; i < programs.length; i++) {
            list += programs[i].name[0] + "\n";
        }
        for (let i = 0; i < files.length; i++) {
            list += files[i] + "\n";
        }
        console.log('setting message to:', list);
        return list;
        //return this.getMessage();
        //return spawn('ls', this.options);
    });

let matriz = new Program(
    ["matriz", "./matriz"],
    function() {
        /*
        for (i = 0; i < commands.length; i++) {
            console.log(`!!: ${commands[i]}`);
        }
        */
        if (commands[3]) {
            return spawn('programs/matriz.sh', [ `${commands[1]}`, `./files/${commands[2]}`, `./files/${commands[3]}`], this.options);
        }
        else {
            console.log(`!!: ${commands[0]} ${commands[1]} ${commands[2]}`);
            return spawn('programs/matriz.sh', [ `${commands[1]}`, `./files/${commands[2]}`], this.options);
        }
    });

let prime = new Program(
    ["prime", "./prime"],
    function() {
        if (commands[1] <= 1000000) {
            return spawn('programs/prime.out', [`${commands[1]}`], this.options);
        }

        else {
            this.setError("Prime number must be less than or equal to 1000000.\n");
        }
    });

let withfeathers = new Program(
    ["withfeathers", "python withfeathers"],
    function() {
        return spawn('python3',  ['programs/withfeathers/main.py', `${commands[1]}`], this.options);
    });

let devilish = new Program(
    ["devilish", "./devilish"],
    function() {
        return spawn('firejail', ['--quiet', '--net=none', '--hostname=demonic', '--rlimit-nproc=100', '--rlimit-as=50000000', '--nice=10', '--private=/home/demo', '--private-tmp', '--chroot=/let/www/demo/files/fire', '/usr/local/bin/devilish.out'], this.options);
    });

let zigzag_server = new Program(
    ["zigzag-server"],
    function() {
        return spawn('python3',  ['-u', 'programs/zigzag/zigzag-server.py'], this.options);
    });

let zigzag_client = new Program(
    ["zigzag-client"],
    function() {
        return spawn('programs/zigzag/zigzag-client.out', [`127.0.1.1`, `${commands[1]}`], this.options);
    });

let wyeast = new Program(
    ["wyeast"],
    function() {
        return spawn('./buildworld && ./wyeast',  this.options_shell);
    });

let voy = new Program(
    ["voy"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        return spawn('voy', args, this.options);
    });

let python = new Program(
    ["python", "python3"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        console.log('args:', args);
        return spawn('python3', args, this.options);
    });

let javascript = new Program(
    ["javascript", "node"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        console.log('args:', args);
        return spawn('node', args, this.options);
    });

let gpp = new Program(
    ["gpp"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        console.log('args:', args);

        return spawn(`g++ -o ${args[1]} ${args[1]}.cpp && ${args[1]}`, {
            shell: true,
        });
    });

let gcc = new Program(
    ["gcc"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        console.log('args:', args);

        const run = `
        gcc -o ${args[1]} ${args[1]}.c &&
        while [ ! -f ${args[1]} ]; do
            sleep 1
        done;
        ${args[1]}
        `;
        console.log(run)
        return spawn(run, {
            shell: true,
        });
    });

let telnet = new Program(
    ["telnet"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        return spawn('telnet', args, this.options);
    });

let vim = new Program(
    ["vim"],
    function() {
        let args = [];
        for (let i = 1; i < commands.length; i++) {
            args.push(commands[i]);
        }
        return spawn('vim', args, this.options);
    });

let markdown = new Program(
    ["markdown"],
    function() {
        console.log('commands:', commands);
        srcfile = commands[1];
        outfile = `demo.${Math.random()}.html`;
        const run = `
            pandoc -f markdown -t html -s ${srcfile} -o /tmp/${outfile} -H header.html
            mv /tmp/${outfile} /var/www/demo/demo-web/tmp
            echo https://demo.liambeckman.com/tmp/${outfile}
        `;
        console.log(run)
        return spawn(run, {
            shell: true,
        });
    });

module.exports = programs;
