const fs = require('fs');

// Corrige o painel: API aponta para o próprio site no Render (não localhost)
const orig = fs.readFileSync;
fs.readFileSync = function (file, encoding) {
  const result = orig.apply(this, arguments);
  const fname = String(file);
  if (fname.includes('index.html')) {
    let s = Buffer.isBuffer(result) ? result.toString('utf8') : String(result);
    s = s.replace(
      /const API = localStorage\.getItem\('apiBase'\) \|\| \(location\.port === '3080' \? '' : 'http:\/\/localhost:3080'\);/g,
      "const API = localStorage.getItem('apiBase') || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3080' : '');"
    );
    return encoding === undefined || encoding === null ? Buffer.from(s, 'utf8') : s;
  }
  return result;
};

require('./server.js');
