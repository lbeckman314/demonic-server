const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const server = new https.createServer({
    cert: fs.readFileSync('/path/to/cert.pem'),
    key: fs.readFileSync('/path/to/key.pem'),
    passphrase: 'PASSWORD'
});

module.exports= server;
