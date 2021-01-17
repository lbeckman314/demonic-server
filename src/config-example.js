const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const server = new https.createServer({
    cert: fs.readFileSync('keys/cert.pem'),
    key: fs.readFileSync('keys/key.pem'),
    passphrase: 'hunter2'
});

module.exports = server;
