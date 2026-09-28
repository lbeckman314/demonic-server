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
npm run start -- 12345

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
| -       | -         | -                                                                   | -                                  |
| `data`  | String    | The commands or code sent by the user to be evaulted by the server. | `print("Wow, I'm in a language!")` |
| `lang`  | String    | What programming language to compile or interpret `data`.           | `python`                           |

## Server to Client

| Keyword   | Data Type | Description                                                                      | Example                                          |
| -         | -         | -                                                                                | -                                                |
| `exit`    | Number    | Exit status of spawned process.                                                  | `0`                                              |
| `draw`    | Boolean   | Informs client that spawned process will handle output of characters (e.g. vim). | `false`                                          |
| `out`     | String    | STDOUT of the spawned process.                                                   | `Wow, I'm in a language!`                        |
| `err`     | String    | STDERR of the spawned process.                                                   | `SyntaxError: EOL while scanning string literal` |
| `loading` | Boolean   | Informs client that process is ongoing and output is forthcoming.                | `true`                                           |

# Security Model

Every command runs inside a [Firejail](https://firejail.wordpress.com/) sandbox, and **Firejail is the only security boundary**. The program and language names in `src/process.yaml` decide what the prompt accepts, but they are not an allowlist: `bash` is available, and anything after `&&`, `$(...)` or backticks runs too. Assume a visitor can run any binary in the chroot.

By default each sandbox gets:

| Firejail option                    | Effect                                                   |
| -                                  | -                                                        |
| `--chroot=/srv/chroot`             | Debian root filesystem, separate from the server's.      |
| `--private`, `--private-tmp`       | Empty, throwaway home directory and `/tmp`.              |
| `--net=none`                       | No network interfaces except loopback.                   |
| `--noroot`, `--caps.drop=all`      | No root user and no capabilities.                        |
| `--seccomp`, `--nonewprivs`        | Default syscall filter; setuid binaries cannot gain privileges. |
| `--rlimit-nproc`, `--rlimit-as`, `--rlimit-fsize` | Process count, memory and file size limits (see `limits` below). |
| `--timeout`                        | Wall-clock limit for the whole sandbox.                  |

On startup the server runs a sandboxed self-test and refuses to start unless the command really ran inside the chroot. The test looks for the marker file `/etc/demonic-chroot`, which must exist in the chroot and must not exist on the host. This matters inside Docker, where Firejail silently runs commands **without any sandbox** unless the environment variable `container=docker` is set. The Dockerfile sets it.

# Running with Docker

Firejail needs to create namespaces, so the container must be privileged. Also cap the container's memory and process count as a backstop for everything running inside it:

```sh
docker build -t demonic-server .
docker run -d -p 8181:8181 --privileged --memory 4g --pids-limit 1024 demonic-server
```

# Configuration (`src/process.yaml`)

| Key       | Description |
| -         | -           |
| `sandbox` | List of Firejail arguments. The command is appended as `sh -c '<cmd>'`. |
| `limits`  | Default resource limits for every program and language (see below). |
| `root`    | Path to the chroot on the host. |
| `progs`   | Programs, keyed by the name typed at the prompt. |
| `langs`   | Languages, keyed by the `lang` sent by the client. |

Fields for each entry under `progs` or `langs`:

| Field    | Applies to | Description |
| -        | -          | -           |
| `cmd`    | both       | Command to run. For programs, defaults to what the user typed. For languages, a string or list of commands run in `/tmp/demonic` inside the sandbox; `<path>` is replaced with `/tmp/demonic/main` (the source file is `<path>.<ext>`) and `<dir>` with `/tmp/demonic`. |
| `ext`    | langs      | File extension of the source file (e.g. `c`, `rs`). |
| `draw`   | progs      | Set to `false` when the program draws the screen itself (e.g. vim). Default `true`. |
| `limits` | both       | Overrides for any of the `limits` keys below. Keys not given inherit the top-level default. |

Language snippets are sent into the sandbox base64-encoded in the `DEMONIC_CODE` environment variable and written to `/tmp/demonic/main.<ext>` by the sandbox itself, so nothing is written to the chroot. Snippets are limited to 64 KiB.

`limits` keys:

| Key       | Firejail option   | Default    | Description |
| -         | -                 | -          | -           |
| `nproc`   | `--rlimit-nproc`  | `64`       | Maximum number of processes and threads. |
| `as`      | `--rlimit-as`     | `512M`     | Maximum address space (virtual memory) per process. Accepts `K`, `M` and `G`. Go, rustc and the JVM reserve large amounts up front and need more. |
| `fsize`   | `--rlimit-fsize`  | `16M`      | Maximum size of any file written. |
| `timeout` | `--timeout`       | `00:10:00` | Wall-clock limit for the sandbox (`hh:mm:ss`). |

Example:

```yaml
langs:
  rust:
    ext: rs
    cmd:
      - rustc -o <path> <path>.rs
      - <path>
    limits:
      as: 2G
```

# Sandbox Setup

The sandbox is composed of a Debian (stable) chroot secured with Firejail.

The following are instructions on how to set up the sandbox from a UNIX host (adapted from Firejail's [chroot documentation](https://firejail.wordpress.com/documentation/basic-usage/#chroot)).

```sh
# Set path for sandbox (e.g. /srv/chroot).
CHROOT=/srv/chroot

# Create sandbox directory.
sudo mkdir -p $CHROOT

# Create Debian filesystem in sandbox.
sudo debootstrap stable $CHROOT https://deb.debian.org/debian/

# Change root into the newly created filesystem.
sudo chroot $CHROOT

# Update apt sources.
apt update

# Install desired programs (e.g. cmatrix).
apt install cmatrix

# Install desired languages (e.g. C).
apt install gcc

# (Optional) Setup correct locale for text rendering.
apt install locales
sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen
locale-gen

# Create non-root user to run programs.
adduser demo

# Marker file checked by the server's startup self-test.
touch /etc/demonic-chroot

# Exit sandbox.
exit

# Test Firejail chroot.
firejail --chroot=$CHROOT gcc --version
```

## Programs Installed

| Program  | Package                        |
| -        | -                              |
| cmatrix  | cmatrix                        |
| cowsay   | cowsay                         |
| fortune  | fortune-mod                    |
| lolcat   | lolcat                         |
| pipes.sh | github.com/pipeseroni/pipes.sh |
| vim      | vim                            |

## Languages Installed

| Language   | Package     |
| -          | -           |
| Bash       | bash        |
| C          | gcc         |
| C++        | g++         |
| Go         | golang      |
| Haskell    | ghci (not in the Docker image) |
| Java       | default-jdk (not in the Docker image) |
| JavaScript | nodejs      |
| Python     | python3     |
| Racket     | racket      |
| Ruby       | ruby        |
| Rust       | rustc       |

# See Also

- [Demonic-Web](https://github.com/lbeckman314/demonic-web): A client for this backend service.
- [Demonic-Docs](https://github.com/lbeckman314/demonic-docs): Integrates demonic-web into your documentation.

