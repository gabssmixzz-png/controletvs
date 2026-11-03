const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const b64 = fs.readFileSync(path.join(__dirname, 'part1.txt'), 'utf8') + fs.readFileSync(path.join(__dirname, 'part2.txt'), 'utf8');
const code = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const tmp = path.join(__dirname, '._run.js');
fs.writeFileSync(tmp, code);
require(tmp);
