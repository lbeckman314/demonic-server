![demonic logo](./assets/demonic.png)

# demonic-server

The backend for a web-based terminal to run commands and code snippets in a sandboxed environment.

Try it out at [liambeckman.com/code/demonic](https://liambeckman.com/code/demonic).

[![demonic in action](./assets/demonic-web.png)](https://liambeckman.com/code/demonic)

## Inspired By

Demonic was inspired by the following cool projects:

- [Rust Playground](https://play.rust-lang.org/)
- [Try Haskell!](https://www.tryhaskell.org/)
- [Repl.it](https://repl.it/languages/c)

# Installation

```sh
# get code
git clone https://github.com/lbeckman314/demonic-server
cd demonic-server

# install dependencies
npm install

# copy example config
cp src/config-example.js src/config.js

# edit key, certificate, and passphrase information
vim src/config.js

# run server (if no port number is provided, 12345 in this example, the server will default to port 8181)
npm run server -- 12345

# then you can connect to the server from a demonic client.
```

# Uninstallation

```sh
# remove this directory
rm -rf demonic-server
```

# Message Protocol

1) Connection is established between **client** and **server**. **Client** displays user prompt.

```
user @ demonic >
```

2) **Client** sends user input to the **server**.

```
user @ demonic > echo "Wow, I'm in a shell!"\n
```

4) **Server** searches for `echo` in the list of allowed programs. If found, **server** spawns the `echo` process.

5) **Server** sends **client** the output of the command.

```json
{ out: "Wow, I'm in a shell!" }
```

6) **Client** displays output of the command to the user.

```
user @ demonic > echo "Wow, I'm in a shell!"\n
Wow, I'm in a shell!
```

7) **Server** sends **client** the exit status of the command.

```json
{ exit: 0 }
```

- **Client** displays user prompt on terminal. Ready for next command!

```
user @ demonic >
```

## Client to Server

| Keyword | Data Type | Description                                                         | Example                            |
|---------|-----------|---------------------------------------------------------------------|------------------------------------|
| `data`  | String    | The commands or code sent by the user to be evaulted by the server. | `print("Wow, I'm in a language!")` |
| `lang`  | String    | What programming language to compile or interpret `data`.           | `python`                           |

## Server to Client

| Keyword   | Data Type | Description                                                                      | Example                                          |
|-----------|-----------|----------------------------------------------------------------------------------|--------------------------------------------------|
| `exit`    | Number    | Exit status of spawned process.                                                  | `0`                                              |
| `draw`    | Boolean   | Informs client that spawned process will handle output of characters (e.g. vim). | `false`                                          |
| `out`     | String    | STDOUT of the spawned process.                                                   | `Wow, I'm in a language!`                         |
| `err`     | String    | STDERR of the spawned process.                                                   | `SyntaxError: EOL while scanning string literal` |
| `loading` | Boolean   | Informs client that process is ongoing and output is forthcoming.                | `true`                                           |


# See Also

- [Demonic-Web](https://github.com/lbeckman314/demonic-web): A client for this backend service.
- [Demonic-Docs](https://github.com/lbeckman314/demonic-docs): Integrates demonic-web into your documentation.

