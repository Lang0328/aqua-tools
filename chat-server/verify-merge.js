/** verify-merge.js — boots server + runs focused feature checks on merged server */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DB = require('./db');           // for hashPass (mirrors client hashing convention)
const PORT = 3866;
const BASE = 'http://localhost:' + PORT;
const DATA = 'data'; // relative to chat-server

let server;
let failures = [];
function pass(n){ console.log('  \u2713 '+n); }
function fail(n, msg){ failures.push(n+': '+(msg||'')); console.log('  \u2717 '+n+' '+msg); }
function req(path, opts, body){
  return new Promise((resolve)=>{
    opts = opts || {};
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE+path, {method: opts.method||'GET', headers: Object.assign({'content-type':'application/json'}, opts.headers||{}), timeout: 5000}, res=>{
      let chunks=''; res.on('data',d=>chunks+=d); res.on('end',()=>{try{resolve({status:res.statusCode, json:chunks?JSON.parse(chunks):null})}catch(e){resolve({status:res.statusCode, json:null, raw:chunks})}});
    });
    r.on('error', e=>resolve({status:0, error:e.message})); r.setTimeout(5000,()=>resolve({status:0, timeout:true}));
    if(data) r.write(data); r.end();
  });
}

(async()=>{
  // ensure fresh db
  try{ fs.rmSync('data/aquachat.db',{}); }catch(e){}

  server = spawn(process.execPath, ['server.js'], {env:{...process.env, PORT:String(PORT)}, stdio:['ignore','ignore','ignore']});
  let ready=false;
  for(let i=0;i<40 && !ready;i++){ await new Promise(r=>setTimeout(r,250)); const t=await req('/api/db/users/count'); if(t.status===401){ready=true;} }
  if(!ready){ fail('server boot','still not 401 after 10s'); console.log('\nBOOT FAILED'); process.exit(1); }

  // 1. password login admin (client hashes secret per convention)
  let r = await req('/api/auth',{method:'POST'},{type:'password',username:'admin',secret:DB.hashPass('admin123')});
  if(r.json && r.json.ok && r.json.token){ pass('admin login'); } else { fail('admin login', JSON.stringify(r.json)); }
  const tok = r.json && r.json.token;
  const headers = {'x-auth-token': tok};

  // 2. subscribeChannels → c_ann & c_official in user's channel list
  let users = await req('/api/db/users',{headers});
  const adminRow = users.json && users.json.list && users.json.list.find(u=>u.username==='admin');
  const cid = adminRow && adminRow.id;
  let allChans = await req('/api/db/channels?idx=subscribers&val='+encodeURIComponent(cid), {headers}); // scalar won't match array
  let chAll = await req('/api/db/channels',{headers});
  const subs = (chAll.json && chAll.json.list || []).filter(c=>Array.isArray(c.subscribers) && c.subscribers.indexOf(cid)!==-1);
  const chids = subs.map(c=>c.id);
  if(chids.indexOf('c_ann')!==-1 && chids.indexOf('c_official')!==-1){ pass('auto subscribed c_ann/c_official'); } else { fail('auto subscribe', JSON.stringify(chids)); }

  // 3. moss bot exists + is a contact via DM
  let moss = await req('/api/db/users/u_moss',{headers});
  if(moss.json && moss.json.data && moss.json.data.role==='bot'){ pass('moss bot seeded (role=bot)'); } else { fail('moss bot', JSON.stringify(moss.json)); }

  let dmKey = 'dm_'+[cid,'u_moss'].sort().join('|');
  await req('/api/db/messages',{method:'POST',headers},{data:{id:undefined, chatId: dmKey, sender: cid, type:'text', content:'/start', time: Date.now(), edited:false, recalled:false, isExpired:false}});
  // bots reply comes async via broadcast; fetch messages in that chat
  await new Promise(r=>setTimeout(r,700));
  let ms = await req('/api/db/messages?idx=chatId&val='+encodeURIComponent(dmKey), {headers});
  const texts = ms.json && ms.json.list && ms.json.list.map(m=>m.content||'');
  if(texts && texts.some(t=>t.indexOf('MOSS')!==-1 || t.indexOf('Welcome')!==-1 || t.indexOf('命令')!==-1)){ pass('moss replied to /start'); } else { fail('moss reply', JSON.stringify(texts)); }

  // 4. device-login: first-time create → needSetPassword
  const deviceIdent = 'dev_fgtest_'+Date.now();
  let d1 = await req('/api/auth',{method:'POST'},{type:'device',identifier:deviceIdent});
  if(d1.json && d1.json.needSetPassword && d1.json.token){ pass('device first-login needSetPassword'); } else { fail('device first-login', JSON.stringify(d1.json)); }
  const dtok = d1.json && d1.json.token;
  // 5. set device password
  let sp = await req('/api/auth/device/set-password',{method:'POST',headers:{'x-auth-token':dtok}},{secret:'abc1234'});
  if(sp.json && sp.json.passwordSet){ pass('set device password'); } else { fail('set device password', JSON.stringify(sp.json)); }

  // 6. second login WITHOUT secret → 401 + needPassword
  let d2 = await req('/api/auth',{method:'POST'},{type:'device',identifier:deviceIdent});
  if(d2.status===401 && d2.json && d2.json.needPassword){ pass('device re-login without secret → 401/needPassword'); } else { fail('device re-login no secret', 'status='+d2.status+' '+JSON.stringify(d2.json)); }

  // 7. second login WITH correct secret → ok
  let d3 = await req('/api/auth',{method:'POST'},{type:'device',identifier:deviceIdent,secret:'abc1234'});
  if(d3.json && d3.json.token && !d3.json.needSetPassword){ pass('device re-login with secret → ok'); } else { fail('device re-login with secret', JSON.stringify(d3.json)); }

  // 8. mutual contact: add alice as contact (cur=cid, contactId=aliceId)
  let subsAlice = await req('/api/db/users?idx=username&val=alice',{headers});
  let aliceId = (subsAlice.json && subsAlice.json.list && subsAlice.json.list[0] && subsAlice.json.list[0].id) || 'u_alice';
  let revKey = aliceId + '|' + cid;
  let myKey = cid + '|' + aliceId;
  await req('/api/db/contacts',{method:'POST',headers},{data:{id:myKey, owner:cid, contactId:aliceId, created:Date.now()}});
  // fetch all contacts + filter (array equality not supported by idx)
  let allC = await req('/api/db/contacts',{headers});
  const hasReverse = (allC.json && allC.json.list || []).some(c=>c.owner===aliceId && c.contactId===cid);
  const hasMine = (allC.json && allC.json.list || []).some(c=>c.owner===cid && c.contactId===aliceId);
  if(hasReverse && hasMine){ pass('mutual contact auto-created'); } else { fail('mutual contact', JSON.stringify({hasReverse, hasMine})); }

  // 9. 401 after logout
  await req('/api/logout',{method:'POST',headers});
  let after = await req('/api/db/users/count',{headers});
  if(after.status===401){ pass('token invalid after logout'); } else { fail('logout 401', 'status='+after.status); }

  server.kill();
  console.log('\n'+failures.length? failures.length+' FAILED' : '全部通过');
  process.exit(failures.length?1:0);
})().catch(e=>{console.error(e); process.exit(1);});
