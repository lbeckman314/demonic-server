// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

//var WebSocket = require('ws')
//const readline = require('readline');


//process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// Create WebSocket connection.
const socket = new WebSocket('wss://liambeckman.com:8181');
//const socket = new WebSocket('https://liambeckman.com/demo/devilish');

const userPrompt = "devilish";

var MYLIBRARY = MYLIBRARY || (function(){
    var _args = {}; // private

    return {
        init : function(Args) {
            _args = Args;
            // some other initialising
        },
        helloWorld : function() {
            //alert('Hello World! :: ' + _args[0]);
            //console.log('Hello World! :: ' + _args[0]);
            return _args[0];
        }
    };
}());


document.addEventListener('DOMContentLoaded', function () {
    let terminal = document.getElementById("terminal");
    terminal.spellcheck = false;
    console.log("terminal:", terminal);
    console.log("Connecting to server...");
    terminal.innerHTML = "Connecting...\n";
    // Connection opened
    socket.onopen = function (event) {
        console.log("Success!");
        //terminal.innerHTML += "OK\n";
        //command = readline.question(": ");
        console.log("Sending initial message to server.");
        //terminal.innerHTML += "Sending initial message to server.\n";
        terminal.innerHTML = "Press ENTER to blast off!\n\n";

        let userPrompt = MYLIBRARY.helloWorld();

        terminal.innerHTML += "> " + userPrompt;

        //socket.send("devilish");

        let message = "";
        let messages = [];
        let commands = [];
        let commNum = 0;
        let up = 0;
        let down = 0;
        let ctrl = false;
        // Listen for messages
        socket.onmessage = function(event) {
            //console.log("MESSAGE:", event.data);
            terminal.innerHTML += event.data;
            message = event.data.toString();
            console.log("MESSAGE:", message);
            messages = message.split("\n");
            terminal.scrollTop = terminal.scrollHeight;
            console.log("MESSAGES:", messages);

            console.log("COMMAND:", comm);
        }

        // https://stackoverflow.com/questions/22092762/how-to-detect-ctrlc-and-ctrlv-key-pressing-using-regular-expression/22092839
        document.getElementById('terminal').addEventListener("keydown",function(e){
            e = e || window.event;
            var key = e.which || e.keyCode; // keyCode detection
            var ctrl = e.ctrlKey ? e.ctrlKey : ((key === 17) ? true : false); // ctrl detection

            if ( key == 76 && ctrl ) {
                console.log("Ctrl + L Pressed !");
                terminal.innerHTML = "> ";
                event.preventDefault();
                e.preventDefault();
                terminal.focus();
            }
            else if ( key == 67 && ctrl ) {
                console.log("Ctrl + C Pressed !");
                //e.preventDefault();
                //event.preventDefault();
                socket.send("SIGINT");
                terminal.innerHTML += "\n";
                //terminal.innerHTML = terminal.innerHTML.replace(/.*$/ ,"> ");
            }

            else if ( key == 85 && ctrl ) {
                console.log("Ctrl + U Pressed !");
                e.preventDefault();
                //event.preventDefault();
                terminal.innerHTML = terminal.innerHTML.replace(/.*$/ ,"> ");
            }

        },false);


        document.getElementById('terminal').onkeydown = function (event) {
            let key = event.keyCode;
            let lines = terminal.innerHTML.split("\n");

            console.log("key:", key);

            if (key == 8) {
                console.log(lines[lines.length - 1].length);
                if (lines[lines.length - 1].length <= 2) {
                    console.log("backspace detected");
                    event.preventDefault();
                }
            }

            else if (key == 46) {
                console.log("delete detected");
                //terminal.innerHTML += "\n> ";
            }

            else if (key == 9) {
                event.preventDefault();
                terminal.innerHTML += "TAB detected";
                terminal.innerHTML += "\n> ";
                console.log("TAB detected");
                //socket.send("TAB");
                //terminal.innerHTML += "\n> ";
            }


            else if (key == 38) {
                console.log("up arrow detected");
                event.preventDefault();
                if ((up - down) < commands.length && down <= up) {
                    up += 1;
                    console.log("up:", up);
                    console.log("down:", down);
                    console.log("commands.length:", commands.length);
                    terminal.innerHTML = terminal.innerHTML.replace(/.*$/ ,"> " + commands[commands.length - up + down]);
                }
                console.log("commands:", commands);
                //terminal.innerHTML += "\n> ";
            }

            else if (key == 40) {
                console.log("down arrow detected");
                event.preventDefault();
                if (down < up && (up - down) <= commands.length) {
                    down += 1;
                    console.log("up:", up);
                    console.log("down:", down);
                    if (down == up) {
                        terminal.innerHTML = terminal.innerHTML.replace(/.*$/ ,"> ");
                    }
                    else {
                        terminal.innerHTML = terminal.innerHTML.replace(/.*$/ ,"> " + commands[commands.length - up + down]);
                    }
                }
                console.log("commands:", commands);
                //terminal.innerHTML += "\n> ";
            }

            else if (key == 13)
            {
                event.preventDefault();
                terminal.innerHTML += "\n";
                up = 0;
                down = 0;
                for (let i = 0; i < lines.length; i++)
                {
                    //console.log(lines[i]);
                }
                console.log("message:", message);
                comm = lines[lines.length-1];
                //console.log("you entered:", comm);
                console.log("messages.length:", messages.length);
                if (messages.length > 0) {
                    comm = comm.substring(messages[messages.length - 1].length - 1);
                }
                //console.log("you entered:", comm);
                comm = comm.replace(/([>:]+ *)/g, "");
                comm = comm.replace(/^[ ]*/g, "");

                console.log("you entered:", comm);
                if (comm == "clear") {
                    event.preventDefault();
                    terminal.innerHTML = "> ";
                    commands[commNum] = comm;
                    commNum += 1;
                }

                else if (comm == "") {
                    event.preventDefault();
                    terminal.innerHTML += "\n> ";
                }

                else {
                    socket.send(comm);
                    commands[commNum] = comm;
                    commNum += 1;
                }

                terminal.scrollTop = terminal.scrollHeight;
            }

        }
    }
});
