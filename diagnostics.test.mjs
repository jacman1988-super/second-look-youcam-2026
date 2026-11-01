import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';

// In-process request dispatch: no listener, socket, provider or real credential.
// All fetches are stubbed before each fresh module is imported.
const KEY='SyntheticDiagnosticKeyOnly_1234567890';
const PRIVATE='SyntheticProviderMessageToken_NEVER_ECHO';
const PRIVATE_URL='https://private.example.test/result?token=SyntheticPrivateToken';
const IMAGES={consent:true,src_file_url:'https://example.test/person.png',ref_file_url:'https://example.test/dress.png'};
const UNVERIFIED={state:'not_requested',message:'Key has not been verified. Verification runs only when you press Verify key.'};
let fixture=0;

async function exercise(provider,check,{limit='1',setup}={}){
 delete process.env.YOUCAM_API_KEY;
 process.env.YOUCAM_ENABLE_LIVE='no';process.env.YOUCAM_ALLOW_LOCAL_CONNECT='yes';process.env.YOUCAM_MAX_TASKS=limit;
 const oldFetch=globalThis.fetch,oldLog=console.log;const logs=[];let calls=0;
 console.log=(...args)=>logs.push(args.join(' '));
 globalThis.fetch=async(...args)=>{calls++;return provider(...args);};
 try{
  const {server}=await import(new URL(`./server.mjs?diagnostic-fixture=${++fixture}`,import.meta.url));
  const request=(path,payload)=>new Promise(resolve=>{
   const content=payload===undefined?'':JSON.stringify(payload);
   const req=Readable.from(content?[Buffer.from(content)]:[]);
   Object.assign(req,{url:path,method:payload===undefined?'GET':'POST',headers:{host:'127.0.0.1:43210',origin:'http://127.0.0.1:43210','content-type':'application/json','sec-fetch-site':'same-origin'},socket:{localPort:43210}});
   const res={writeHead(status){this.status=status;},end(body){resolve({status:this.status,body,json:JSON.parse(body)});}};
   server.emit('request',req,res);
  });
  if(setup){await setup({request,get calls(){return calls;},logs});return;}
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

for(const [name,error,category] of [
 ['timeout',Object.assign(Error(PRIVATE),{name:'TimeoutError'}),'request timed out'],
 ['DNS failure',Object.assign(Error(PRIVATE),{cause:{code:'ENOTFOUND',message:PRIVATE_URL}}),'network connection failed'],
 ['header failure',Object.assign(Error(PRIVATE),{code:'ERR_INVALID_CHAR'}),'local header encoding rejected'],
 ['ByteString failure',TypeError('Cannot convert argument to a ByteString because the character at index 50 has a value of 8230 which is greater than 255.'),'local header encoding rejected'],
 ['unknown transport failure',Error(PRIVATE_URL),'unclassified local transport failure']
]){
 test(`${name} produces only a static diagnostic and never retries`,async()=>{
  await exercise(()=>{throw error;},result=>assert.equal(result.json.error,`YouCam request could not be completed (${category}). No automatic retry was made.`));
 });
}

for(const [name,provider,expected] of [
 ['invalid JSON',()=>({ok:true,status:200,json:async()=>{throw SyntaxError(PRIVATE);}}),'invalid or unreadable JSON'],
 ['missing data',()=>({ok:true,status:200,json:async()=>({status:200,error:PRIVATE})}),'missing result data'],
 ['missing task ID',()=>({ok:true,status:200,json:async()=>({status:200,data:{error:PRIVATE,url:PRIVATE_URL}})}),'missing or invalid task identifier']
]){
 test(`HTTP200 with ${name} is not treated as a started task`,async()=>{
  await exercise(provider,result=>assert.equal(result.json.error,`YouCam returned an unusable response (HTTP 200; ${expected}). No automatic retry was made.`));
 });
}

test('explicit zero cap allows safe local connection but prevents every generation',async()=>{
 await exercise(()=>{throw Error('Provider must not be called at zero cap.');},null,{limit:'0',setup:async h=>{
  assert.deepEqual((await h.request('/api/status')).json,{live:false,localConnectEnabled:true,remainingTaskCap:0,verification:UNVERIFIED});
  const connected=await h.request('/api/connect',{apiKey:KEY});assert.equal(connected.status,200);assert.equal(connected.json.remainingTaskCap,0);
  assert.equal((await h.request('/api/try-on',IMAGES)).status,429);assert.equal((await h.request('/api/try-on',IMAGES)).status,429);assert.equal(h.calls,0);
  assert.equal(h.logs.length,0);
 }});
});

test('opaque visible-ASCII key is preserved while non-ASCII and internal whitespace cannot replace it',async()=>{
 const valid='SyntheticOpaque_'+Array.from({length:94},(_,i)=>String.fromCharCode(33+i)).join('');
 await exercise((url,options)=>{assert.equal(options.headers.Authorization,`Bearer ${valid}`);return {ok:false,status:401,json:async()=>({status:401})};},null,{setup:async h=>{
  assert.equal((await h.request('/api/connect',{apiKey:` \t${valid}\r\n `})).status,200);
  for(const invalid of ['Synthetic…Truncated12345','SyntheticéNonASCII12345','Synthetic Key With Spaces','Synthetic\u0000Control12345','Synthetic\u007fControl12345','Bearer SyntheticPrefix12345']){
   const result=await h.request('/api/connect',{apiKey:invalid});assert.equal(result.status,400);assert.ok(!result.body.includes(invalid));
  }
  assert.equal(h.calls,0);assert.equal((await h.request('/api/try-on',IMAGES)).status,400);assert.equal(h.calls,1);
 }});
});

test('explicit read-only verification uses only V2 feature-cost once and preserves zero cap and privacy',async()=>{
 const requests=[];await exercise((url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({status:200,result:{skus:[{description:PRIVATE,run_task_url:PRIVATE_URL}],next_token:PRIVATE}})};},null,{limit:'0',setup:async h=>{
  assert.equal((await h.request('/api/verify-key',{})).status,409);assert.equal(h.calls,0);
  await h.request('/api/connect',{apiKey:KEY});assert.equal(h.calls,0);
  const result=await h.request('/api/verify-key',{});assert.equal(result.status,200);assert.deepEqual(result.json,{authenticated:true,remainingTaskCap:0});
  for(const forbidden of [KEY,PRIVATE,PRIVATE_URL,'skus','next_token'])assert.ok(!result.body.includes(forbidden));
  assert.equal(requests.length,1);assert.equal(requests[0].url,'https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost?page_size=20');assert.equal(requests[0].options.method,'GET');assert.equal(requests[0].options.body,undefined);
  assert.equal((await h.request('/api/verify-key',{})).status,429);assert.equal((await h.request('/api/try-on',IMAGES)).status,429);assert.equal(h.calls,1);
  await h.request('/api/connect',{apiKey:KEY});assert.equal((await h.request('/api/verify-key',{})).status,200);assert.equal(h.calls,2);assert.equal((await h.request('/api/status')).json.remainingTaskCap,0);assert.equal(h.logs.length,0);
 }});
});

test('failed verification remains limited and exposes only safe upstream classification',async()=>{
 await exercise(()=>({ok:false,status:401,json:async()=>({status:401,error:PRIVATE,error_code:'InvalidAccessToken'})}),null,{limit:'0',setup:async h=>{
  await h.request('/api/connect',{apiKey:KEY});const failed=await h.request('/api/verify-key',{});
  assert.equal(failed.status,400);assert.match(failed.json.error,/HTTP 401; API 401; authentication rejected/);assert.ok(!failed.body.includes(PRIVATE));assert.ok(!failed.body.includes(KEY));
  assert.equal((await h.request('/api/verify-key',{})).status,429);assert.equal(h.calls,1);const saved=await h.request('/api/status');assert.equal(saved.json.remainingTaskCap,0);assert.equal(saved.json.verification.state,'failed');assert.ok(!saved.body.includes(PRIVATE));
 }});
});

test('status reads from another page retain pending and authenticated verification without another provider request',async()=>{
 let complete;const gate=new Promise(resolve=>{complete=resolve;});
 await exercise(()=>gate,null,{limit:'0',setup:async h=>{
  await h.request('/api/connect',{apiKey:KEY});assert.deepEqual((await h.request('/api/status')).json.verification,UNVERIFIED);
  const verifying=h.request('/api/verify-key',{});await new Promise(resolve=>setImmediate(resolve));
  const pending=await h.request('/api/status');assert.equal(pending.json.verification.state,'pending');assert.equal(h.calls,1);
  assert.equal((await h.request('/api/verify-key',{})).status,429);
  complete({ok:true,status:200,json:async()=>({status:200,result:{skus:[{description:PRIVATE}],next_token:PRIVATE}})});await verifying;
  for(let page=0;page<2;page++){
   const saved=await h.request('/api/status');assert.equal(saved.json.verification.state,'authenticated');assert.match(saved.json.verification.message,/Key authenticated by the read-only/);assert.deepEqual(Object.keys(saved.json.verification).sort(),['message','state']);
   assert.equal(saved.json.remainingTaskCap,0);for(const value of [KEY,PRIVATE,PRIVATE_URL,'skus','next_token'])assert.ok(!saved.body.includes(value));
  }
  assert.equal((await h.request('/api/verify-key',{})).status,429);assert.equal(h.calls,1);
 }});
});
