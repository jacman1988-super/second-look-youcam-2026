import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Synthetic keys only. Every provider fetch is stubbed before a fresh server
// module is imported. HTTP requests below target the ephemeral loopback server.
const KEY_A='SyntheticKeyOnlyForTests_A_1234567890';
const KEY_B='SyntheticKeyOnlyForTests_B_1234567890';
const IMAGES={consent:true,src_file_url:'https://example.test/adult.jpg',ref_file_url:'https://example.test/outfit.jpg'};
const UNVERIFIED={state:'not_requested',message:'Key has not been verified. Verification runs only when you press Verify key.'};
let fixtureNumber=0;

async function withServer(run,{enabled=true,provider}={}) {
  // Do not read inherited credentials. These assignments apply only to this
  // isolated Node test process and deliberately remove any live configuration.
  delete process.env.YOUCAM_API_KEY;
  process.env.YOUCAM_ENABLE_LIVE='no';
  process.env.YOUCAM_MAX_TASKS='1';
  if(enabled)process.env.YOUCAM_ALLOW_LOCAL_CONNECT='yes';
  else delete process.env.YOUCAM_ALLOW_LOCAL_CONNECT;
  const oldFetch=globalThis.fetch;
  const methods=['log','error','warn'];
  const oldLogs=Object.fromEntries(methods.map(name=>[name,console[name]]));
  const providerCalls=[],logs=[];
  for(const name of methods)console[name]=(...args)=>logs.push(args.map(String).join(' '));
  globalThis.fetch=async(url,options={})=>{
    providerCalls.push({url,options});
    assert.ok(String(url).startsWith('https://yce-api-01.makeupar.com/s2s/v2.0/'),'unexpected provider destination');
    if(provider)return provider(url,options);
    return {ok:true,json:async()=>({status:200,data:options.method==='POST'?{task_id:'synthetic-task-1'}:{task_status:'success',results:{url:'https://example.test/result.jpg'}}})};
  };
  let server;
  try {
    ({server}=await import(new URL(`./server.mjs?connect-fixture=${++fixtureNumber}`,import.meta.url)));
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const port=server.address().port;
    const request=(path,{method='GET',payload,raw,headers={}}={})=>new Promise((resolve,reject)=>{
      const content=raw!==undefined?raw:payload===undefined?undefined:JSON.stringify(payload);
      const req=http.request({hostname:'127.0.0.1',port,path,method,agent:false,headers:{Connection:'close',...(content===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(content)}),...headers}},res=>{
        let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part;});res.on('end',()=>{let json;try{json=JSON.parse(body);}catch{}resolve({status:res.statusCode,body,json});});
      });
      req.on('error',reject);req.end(content);
    });
    await run({request,providerCalls,logs,port});
  } finally {
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    globalThis.fetch=oldFetch;Object.assign(console,oldLogs);
    delete process.env.YOUCAM_API_KEY;process.env.YOUCAM_ENABLE_LIVE='no';delete process.env.YOUCAM_ALLOW_LOCAL_CONNECT;
  }
}
function localTest(name,run,options) {
  test(name,async t=>{
    try {await withServer(run,options);}
    catch(error) {
      if(error?.code==='EACCES'||error?.cause?.code==='EACCES') {t.skip('Loopback is blocked in this environment; root must run with its already authorized loopback access.');return;}
      throw error;
    }
  });
}
function noSecret(response,...secrets) {
  for(const secret of secrets)assert.ok(!response.body.includes(secret),'response must not echo a submitted key');
}

localTest('local key entry is disabled by default and cannot activate provider access',async h=>{
  const before=await h.request('/api/status');
  assert.deepEqual(before.json,{live:false,remainingTaskCap:1,localConnectEnabled:false,verification:UNVERIFIED});
  const result=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A}});
  assert.equal(result.status,403);noSecret(result,KEY_A);
  assert.equal((await h.request('/api/status')).json.live,false);
  assert.equal(h.providerCalls.length,0);
},{enabled:false});

localTest('opt-in connection and status return no key and make no provider requests',async h=>{
  assert.deepEqual((await h.request('/api/status')).json,{live:false,remainingTaskCap:1,localConnectEnabled:true,verification:UNVERIFIED});
  const result=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A},headers:{Origin:`http://127.0.0.1:${h.port}`}});
  assert.equal(result.status,200);assert.deepEqual(result.json,{live:true,remainingTaskCap:1});noSecret(result,KEY_A);
  const status=await h.request('/api/status');
  assert.deepEqual(status.json,{live:true,remainingTaskCap:1,localConnectEnabled:true,verification:UNVERIFIED});noSecret(status,KEY_A);
  assert.equal(h.providerCalls.length,0);
  assert.ok(!h.logs.join('\n').includes(KEY_A));
});

localTest('cross-origin, cross-site and rebound Host requests cannot install a key',async h=>{
  for(const headers of [{Origin:'https://unrelated.test'},{'Sec-Fetch-Site':'cross-site'},{Host:`rebound.test:${h.port}`}]) {
    const result=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A},headers});
    assert.equal(result.status,403);noSecret(result,KEY_A);
  }
  assert.equal((await h.request('/api/status')).json.live,false);
  assert.equal(h.providerCalls.length,0);
});

localTest('wrong content type, malformed JSON and oversized bodies return safe errors',async h=>{
  const wrongType=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A},headers:{'Content-Type':'text/plain'}});
  assert.equal(wrongType.status,415);noSecret(wrongType,KEY_A);
  const malformedSecret='SyntheticKey1234';
  const malformed=await h.request('/api/connect',{method:'POST',raw:malformedSecret});
  assert.equal(malformed.status,400);noSecret(malformed,malformedSecret);
  const oversized=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A,padding:'x'.repeat(6_200)}});
  assert.equal(oversized.status,400);noSecret(oversized,KEY_A);
  assert.equal((await h.request('/api/status')).json.live,false);
  assert.equal(h.providerCalls.length,0);
  assert.ok(!h.logs.join('\n').includes(malformedSecret));
});

localTest('malformed key types, lengths and control characters do not leak or activate live mode',async h=>{
  for(const key of [null,17,{},[],false,'','   ','x'.repeat(4_097),'SyntheticKey\nWithNewline','SyntheticKey\rWithReturn','SyntheticKey\u0000WithNull','SyntheticKey\tWithTab']) {
    const result=await h.request('/api/connect',{method:'POST',payload:{apiKey:key}});
    assert.equal(result.status,400);
    if(typeof key==='string'&&key.trim())noSecret(result,key);
  }
  const missing=await h.request('/api/connect',{method:'POST',payload:{}});assert.equal(missing.status,400);
  assert.equal((await h.request('/api/status')).json.live,false);assert.equal(h.providerCalls.length,0);
});

localTest('valid boundary key lengths work while a later invalid key leaves the prior session intact',async h=>{
  for(const key of ['a','short','b'.repeat(4_096),KEY_A]) {
    const result=await h.request('/api/connect',{method:'POST',payload:{apiKey:key}});
    assert.equal(result.status,200);if(key.length>1)noSecret(result,key);
  }
  assert.equal(h.providerCalls.length,0);
  assert.equal((await h.request('/api/connect',{method:'POST',payload:{apiKey:'bad key'}})).status,400);
  assert.equal((await h.request('/api/status')).json.live,true);
  const task=await h.request('/api/try-on',{method:'POST',payload:IMAGES});assert.equal(task.status,202);
  assert.equal(h.providerCalls[0].options.headers.Authorization,`Bearer ${KEY_A}`);
});

localTest('reconnecting with a key never resets the one-attempt cap or known task IDs',async h=>{
  assert.equal((await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A}})).status,200);
  assert.equal((await h.request('/api/try-on',{method:'POST',payload:IMAGES})).status,202);
  assert.equal(h.providerCalls.filter(c=>c.options.method==='POST').length,1);
  const reconnected=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_B}});
  assert.deepEqual(reconnected.json,{live:true,remainingTaskCap:0});noSecret(reconnected,KEY_A,KEY_B);
  assert.equal((await h.request('/api/status')).json.remainingTaskCap,0);
  assert.equal((await h.request('/api/try-on',{method:'POST',payload:IMAGES})).status,429);
  assert.equal(h.providerCalls.filter(c=>c.options.method==='POST').length,1);
  assert.equal((await h.request('/api/result?id=synthetic-task-1')).status,200);
  assert.ok(!h.logs.join('\n').includes(KEY_A)&&!h.logs.join('\n').includes(KEY_B));
});

localTest('a rejected provider attempt still consumes the local attempt guard after reconnect',async h=>{
  await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A}});
  const failed=await h.request('/api/try-on',{method:'POST',payload:IMAGES});
  assert.equal(failed.status,400);noSecret(failed,KEY_A);
  const reconnected=await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_B}});
  assert.equal(reconnected.json.remainingTaskCap,0);
  assert.equal((await h.request('/api/try-on',{method:'POST',payload:IMAGES})).status,429);
  assert.equal(h.providerCalls.length,1);
},{provider:()=>({ok:false,json:async()=>({status:401,error:KEY_A})})});

localTest('simultaneous generation requests cannot pass the one-attempt guard twice',async h=>{
  await h.request('/api/connect',{method:'POST',payload:{apiKey:KEY_A}});
  const results=await Promise.all([h.request('/api/try-on',{method:'POST',payload:IMAGES}),h.request('/api/try-on',{method:'POST',payload:IMAGES})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[202,429]);
  assert.equal(h.providerCalls.filter(c=>c.options.method==='POST').length,1);
});
