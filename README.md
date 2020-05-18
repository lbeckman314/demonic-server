![demonic logo](./demonic.png)

# demonic server

A web-based client for running commands and code snippets in a sandboxed environment.

I really liked the ability to try out haskell interactively at [haskell.org](https://www.haskell.org/), so this is something like that.

# Installation

```sh
# get code
git clone https://github.com/lbeckman314/demo-server
cd demo-server

# install dependencies
npm install

# copy example config
cp config-example.js config.js

# edit key, certificate, and passphrase information
vim config.js

# run server (if no port number is provided, 12345 in this example, the server will default to port 8181)
node server.js 12345

# edit server information
vim demo.js

# then you can connect to the server from a client (e.g. client.html)
```

# Uninstallation

```sh
# remove this directory
rm -rfI demo-server
```

# Message Protocol

- Connection is established between client and server.

- Client sends server the command mode (and language if `mode` is set to 'code').

```json
{
    "mode": "shell",
}
```

```json
{
    "mode": "code",
    "lang": "ruby",
}
```

- Client sends server data on every keypress.

- Server buffers the incoming data until a 'newline' charcter is received.

- Server finds the program named in the input, and sends the contents of the input buffer to that program.

- Server sends client the output of the command.

```json
{
    "out": "Wow, I'm in a shell!"
}
```

- Client displays output on terminal.

- Server sends client the exit status of the command.

```json
{
    "exit": 0
}
```

- Client displays user prompt on terminal.

## Client to Server

- mode: Keyword to inform server of expected behavior. Possible options are 'shell' and 'code'.
- lang: If mode is set to 'code', language specifies the respective programming language.
- data: The commands or code sent by the user to be evaulted by the server.

## Server to Client

- exit: Exit status of spawned process.
- control: Keyword to inform client that spawned process will handle output of characters (e.g. vim). Disables writing client-side as well as buffering server-side.
- out: STDOUT of the spawned process.
- err: STDERR of the spawned process.

