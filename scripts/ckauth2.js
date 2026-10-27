// 检查凭证过期状态
const fs=require('fs'),path=require('path'),os=require('os');
const p=path.join(os.homedir(),'.config/.cloudbase/auth.json');
const s=JSON.parse(fs.readFileSync(p,'utf8'));
const c=s.credential;
const now=Date.now();
function tstamp(ms){return new Date(ms).toISOString().slice(0,19)+'Z'}
console.log('tmpExpired:', c.tmpExpired ? tstamp(c.tmpExpired) : 'N/A', c.tmpExpired ? (c.tmpExpired<now?'❌已过期':'✅未过期'):'');
console.log('expired   :', c.expired    ? tstamp(c.expired)    : 'N/A', c.expired    ? (c.expired<now?'❌已过期':'✅未过期'):'');
console.log('refreshToken present:', !!(c.refreshToken&&c.refreshToken.length>10));
console.log('now:', tstamp(now));
console.log('secs until tmpExpired:', c.tmpExpired?Math.floor((c.tmpExpired-now)/1000):'N/A');
