import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';

// In-process request dispatch: no listener, socket, provider or real credential.
// All fetches are stubbed before each fresh module is imported.
const KEY='SyntheticDiagnosticKeyOnly_1234567890';
const PRIVATE='SyntheticProviderMessageToken_NEVER_ECHO';
const PRIVATE_URL='https://private.example.test/result?token=SyntheticPrivateToken';
const IMAGES={consent:true,src_file_url:'https://example.test/person.png',ref_file_url:'https://example.test/dress.png'};
let fixture=0;

async function exercise(provider,check){
 delete process.env.YOUCAM_API_KEY;
 process.env.YOUCAM_ENABLE_LIVE='no';process.env.YOUCAM_ALLOW_LOCAL_CONNECT='yes';process.env.YOUCAM_MAX_TASKS='1';
 const oldFetch=globalThis.fetch,oldLog=console.log;const logs=[];let calls=0;
 console.log=(...args)=>logs.push(args.join(' '));
 globalThis.fetch=async()=>{calls++;return provider();};
 try{
  const {server}=await import(new URL(`./server.mjs?diagnostic-fixture=${++fixture}`,import.meta.url));
  const request=(path,payload)=>new Promise(resolve=>{
   const content=payload===undefined?'':JSON.stringify(payload);
   const req=Readable.from(content?[Buffer.from(content)]:[]);
   Object.assign(req,{url:path,method:payload===undefined?'GET':'POST',headers:{host:'127.0.0.1:43210',origin:'http://127.0.0.1:43210','content-type':'application/json','sec-fetch-site':'same-origin'},socket:{localPort:43210}});
   const res={writeHead(status){this.status=status;},end(body){resolve({status:this.status,body,json:JSON.parse(body)});}};
   server.emit('request',req,res);
  });
  assert.equal((await request('/api/connect',{apiKey:KEY})).status,200);assert.equal(calls,0);
  const rejected=await request('/api/try-on',IMAGES);
  assert.equal(rejected.status,400);await check(rejected);
  for(const forbidden of [KEY,PRIVATE,PRIVATE_URL,'Authorization','Bearer'])assert.ok(!rejected.body.includes(forbidden),'diagnostics must contain no secret or upstream content');
  assert.equal((await request('/api/status')).json.remainingTaskCap,0);
  assert.equal((await request('/api/try-on',IMAGES)).status,429);assert.equal(calls,1,'a rejected attempt must not be repeated');
  assert.equal(logs.length,0,'no provider content should be logged');
 }finally{
  globalThis.fetch=oldFetch;console.log=oldLog;
  delete process.env.YOUCAM_API_KEY;process.env.YOUCAM_ENABLE_LIVE='no';delete process.env.YOUCAM_ALLOW_LOCAL_CONNECT;
 }
}

for(const [code,category] of [[401,'authentication rejected'],[422,'request validation rejected'],[503,'provider service failure']]){
 test(`upstream ${code} is classified without echoing provider data and still consumes one attempt`,async()=>{
  await exercise(()=>({ok:false,status:code,json:async()=>({status:code,error:PRIVATE,error_code:code===401?'InvalidAccessToken':PRIVATE,token:KEY,url:PRIVATE_URL})}),result=>{
   assert.equal(result.json.error,`YouCam rejected the request (HTTP ${code}; API ${code}; ${category}). No automatic retry was made.`);
  });
 });
}

test('API rejection inside HTTP200 retains both numeric statuses safely',async()=>{
 await exercise(()=>({ok:true,status:200,json:async()=>({status:422,error:PRIVATE,error_code:PRIVATE})}),result=>{
  assert.match(result.json.error,/HTTP 200; API 422; request validation rejected/);
 });
});

test('non-JSON upstream failure retains HTTP status without echoing parse errors',async()=>{
 await exercise(()=>({ok:false,status:502,json:async()=>{throw Error(PRIVATE_URL);}}),result=>{
  assert.match(result.json.error,/HTTP 502; API unknown; provider service failure/);
 });
});

test('unknown provider code and nonnumeric API status use a static fallback',async()=>{
 await exercise(()=>({ok:false,status:418,json:async()=>({status:PRIVATE,error_code:PRIVATE,error:KEY,url:PRIVATE_URL})}),result=>{
  assert.equal(result.json.error,'YouCam rejected the request (HTTP 418; API unknown; unclassified provider rejection). No automatic retry was made.');
 });
});
