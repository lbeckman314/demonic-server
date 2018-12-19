# demo

A fake terminal cleans up user input and sends it to the server. The server then parses the input, and if it matches a predefined command, spawns a child process of that command/program.

# installation and running

```sh
# install dependencies
npm install

# copy example config
cp config-example.js config.js

# edit key, certificate, and passphrase information
nano config.js

# run server
node server.js

# edit server information
nano demo.js

# then you can connect to the server from a client (e.g. client-example.html) 
```

# uninstallation

```sh
# remove this directory
rm -rfI demo
```
