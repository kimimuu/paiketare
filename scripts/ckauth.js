const fs=require('fs'),path=require('path'),os=require('os');
const p=path.join(os.homedir(),'.config/.cloudbase/auth.json');
try{const s=fs.readFileSync(p,'utf8');console.log('exists size='+s.length);console.log(s.slice(0,600));}
catch(e){console.log('ERR '+e.message)}
