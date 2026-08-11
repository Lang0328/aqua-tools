const fs = require('fs');
const net = require('net');
const port = 3866;
const s = new net.Socket();
s.setTimeout(500);
s.on('connect', () => { console.log('SOMETHING LISTENING on ' + port); s.destroy(); });
s.on('error', (e) => { console.log('port ' + port + ' free (no listener): ' + e.code); });
s.on('timeout', () => { console.log('timeout'); s.destroy(); });
s.connect(port, '127.0.0.1');
