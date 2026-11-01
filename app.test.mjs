import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const response=data=>({ok:true,json:async()=>data});
async function fixture(fetch){
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,value:'',style:{},textContent:'',disabled:false,checked:false,removeAttribute(name){delete this[name];},reset(){node('#person').value='';node('#garment').value='';node('#consent').checked=false;}});return nodes.get(selector);};
 let timers=0;
 const storageWrites=[];
 const storage={getItem(){return null;},removeItem(){},setItem(...args){storageWrites.push(args);throw Error('Persistence is forbidden in this fixture.');}};
 const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},fetch,URL,Blob,localStorage:storage,sessionStorage:storage,setTimeout(){timers++;return timers;},clearTimeout(){}});
 vm.runInContext(readFileSync(new URL('./app.js',import.meta.url),'utf8'),context);
 await new Promise(r=>setImmediate(r));
 node('#person').value='https://example.com/person.jpg';node('#garment').value='https://example.com/outfit.jpg';node('#consent').checked=true;
 return {node,storageWrites,get timers(){return timers;}};
}

test('clearing while status loads prevents a later generation request',async()=>{
 const config=deferred();let statusCalls=0,posts=0;
 const f=await fixture(async path=>{if(path==='/api/status')return ++statusCalls===1?response({live:true}):config.promise;posts++;return response({taskId:'task'});});
 const pending=f.node('#form').onsubmit({preventDefault(){}});
 f.node('#clear').onclick();config.resolve(response({live:true}));await pending;
 assert.equal(posts,0);assert.equal(f.node('#original').src,undefined);assert.match(f.node('#status').textContent,/Photos cleared/);
});

test('clearing an in-flight task cannot restore photos or schedule polling',async()=>{
 const task=deferred();let posts=0;
 const f=await fixture(async path=>path==='/api/status'?response({live:true}):(posts++,task.promise));
 const pending=f.node('#form').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(posts,1);
 f.node('#clear').onclick();task.resolve(response({taskId:'task'}));await pending;
 assert.equal(f.node('#original').src,undefined);assert.equal(f.timers,0);assert.match(f.node('#status').textContent,/Photos cleared/);
});

test('offline walkthrough restores controls after an interrupted request',async()=>{
 const task=deferred();
 const f=await fixture(async path=>path==='/api/status'?response({live:true}):task.promise);
 const pending=f.node('#form').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 f.node('#demo').onclick();task.resolve(response({taskId:'task'}));await pending;
 assert.equal(f.node('#generate').disabled,false);assert.equal(f.node('#illustration').hidden,false);assert.equal(f.timers,0);assert.match(f.node('#status').textContent,/previously started task/);
});

test('local connect clears the password before awaiting a request and never starts generation',async()=>{
 const key='SyntheticKeyForBrowserTest_1234567890';const gate=deferred();const requests=[];let statusCalls=0;
 const f=await fixture(async(path,options)=>{requests.push({path,options});if(path==='/api/status')return response({live:++statusCalls>1,localConnectEnabled:true,remainingTaskCap:1});if(path==='/api/connect')return gate.promise;throw Error('No generation or provider request is allowed.');});
 f.node('#apiKey').value=` \t${key}\r\n `;
 const pending=f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,true);
 await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.equal(requests.filter(r=>r.path==='/api/connect').length,1);
 const connect=requests.find(r=>r.path==='/api/connect');assert.deepEqual(JSON.parse(connect.options.body),{apiKey:key});
 gate.resolve(response({live:true,remainingTaskCap:1}));await pending;
 assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,false);
 assert.equal(requests.some(r=>r.path==='/api/try-on'),false);
 assert.match(f.node('#connectStatus').textContent,/not been verified with YouCam/);
 assert.match(f.node('#status').textContent,/Local key loaded/);
 assert.ok(!f.node('#connectStatus').textContent.includes(key));assert.equal(f.storageWrites.length,0);
});

test('failed local connect keeps the password cleared and uses a key-free error message',async()=>{
 const key='SyntheticKeyForFailureTest_1234567890';const gate=deferred();
 const f=await fixture(async path=>path==='/api/status'?response({live:false,localConnectEnabled:true,remainingTaskCap:1}):gate.promise);
 f.node('#apiKey').value=key;const pending=f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.equal(f.node('#apiKey').value,'');gate.resolve({ok:false,json:async()=>({error:key})});await pending;
 assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,false);
 assert.ok(!f.node('#connectStatus').textContent.includes(key));assert.match(f.node('#connectStatus').textContent,/No generation was started/);
 assert.equal(f.storageWrites.length,0);
});

test('invalid local key input is cleared without sending it anywhere',async()=>{
 const requests=[];const f=await fixture(async path=>{requests.push(path);return response({live:false,localConnectEnabled:true,remainingTaskCap:1});});
 f.node('#apiKey').value='short';await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.equal(f.node('#apiKey').value,'');assert.equal(requests.includes('/api/connect'),false);assert.equal(requests.includes('/api/try-on'),false);
 assert.ok(!f.node('#connectStatus').textContent.includes('short'));assert.equal(f.storageWrites.length,0);
});

test('blank and invalid local input give distinct safe feedback without requests',async()=>{
 const calls=[];const f=await fixture(async path=>{calls.push(path);return response({live:false,localConnectEnabled:true,remainingTaskCap:1});});
 f.node('#apiKey').value=' \t\r\n ';await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.match(f.node('#connectStatus').textContent,/Paste your YouCam API key/);
 f.node('#apiKey').value='Synthetic\u0000InvalidKey123';await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.match(f.node('#connectStatus').textContent,/format is invalid/);
 assert.equal(calls.filter(p=>p!=='/api/status').length,0);assert.equal(f.node('#apiKey').value,'');assert.equal(f.storageWrites.length,0);
});

test('connect errors expose only HTTP status and whitelisted static categories',async()=>{
 const key='SyntheticSecretMustNeverAppear123';let reply;
 const calls=[];const f=await fixture(async path=>{calls.push(path);return path==='/api/status'?response({live:false,localConnectEnabled:true,remainingTaskCap:1}):reply;});
 for(const [code,error,expected] of [
  [403,'Cross-site request blocked.',/cross-site guard/],
  [400,'Local connection could not be completed. Check the key and try again. No provider request was made.',/input format or request size/],
  [500,key,/local server rejected/]
 ]){
  reply={ok:false,status:code,json:async()=>({error})};f.node('#apiKey').value=key;await f.node('#connectForm').onsubmit({preventDefault(){}});
  const text=f.node('#connectStatus').textContent;assert.match(text,new RegExp(`HTTP ${code}`));assert.match(text,expected);assert.ok(!text.includes(key));assert.equal(f.node('#apiKey').value,'');
 }
 assert.equal(calls.some(p=>p==='/api/try-on'),false);assert.equal(f.storageWrites.length,0);
});

test('network failure has safe feedback and cannot echo the rejected secret',async()=>{
 const key='SyntheticNetworkFailureSecret123';
 const f=await fixture(async path=>{if(path==='/api/status')return response({live:false,localConnectEnabled:true,remainingTaskCap:1});throw Error(key);});
 f.node('#apiKey').value=key;await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.match(f.node('#connectStatus').textContent,/Could not reach the local connection endpoint/);
 assert.ok(!f.node('#connectStatus').textContent.includes(key));assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,false);assert.equal(f.storageWrites.length,0);
});

test('failed status refresh after accepted connection cannot show readiness or success',async()=>{
 let statusCalls=0,jsonReads=0;const calls=[];
 const f=await fixture(async path=>{calls.push(path);if(path==='/api/connect')return response({live:true,remainingTaskCap:1});if(++statusCalls===1)return response({live:false,localConnectEnabled:true,remainingTaskCap:1});return {ok:false,status:403,json:async()=>{jsonReads++;return {live:true};}};});
 f.node('#apiKey').value='SyntheticStatusFailureKey12345';await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.match(f.node('#mode').textContent,/STATUS UNAVAILABLE/);assert.match(f.node('#connectStatus').textContent,/readiness could not be confirmed/);
 assert.ok(!f.node('#connectStatus').textContent.includes('Key loaded'));assert.equal(jsonReads,0);assert.equal(calls.some(p=>p==='/api/try-on'),false);assert.equal(f.storageWrites.length,0);
});

test('already-live initial status is accurate and delayed initial refresh preserves newer activity',async()=>{
 const calls=[];const ready={live:true,localConnectEnabled:true,remainingTaskCap:1};
 const f=await fixture(async path=>{calls.push(path);return response(ready);});
 assert.match(f.node('#status').textContent,/Local key loaded in server RAM/);assert.match(f.node('#status').textContent,/Opening this page starts no generation/);
 assert.match(f.node('#mode').textContent,/READY FOR MANUAL TEST/);assert.deepEqual(calls,['/api/status']);
 const initial=deferred();const delayed=await fixture(async()=>initial.promise);
 delayed.node('#demo').onclick();const activity=delayed.node('#status').textContent;
 initial.resolve(response(ready));await new Promise(r=>setImmediate(r));
 assert.equal(delayed.node('#status').textContent,activity);assert.match(activity,/Illustration only/);
});

test('local Bearer grammar rejects masked and non-ASCII input while allowing valid opaque periods and padding',async()=>{
 const calls=[];const f=await fixture(async(path,options)=>{calls.push({path,options});return response({live:true,localConnectEnabled:true,remainingTaskCap:0});});
 for(const invalid of ['Synthetic****Masked12345','Synthetic…Truncated12345','SyntheticéNonASCII12345','Synthetic=InternalPadding12345','Bearer SyntheticPrefixedKey12345']){
  f.node('#apiKey').value=invalid;await f.node('#connectForm').onsubmit({preventDefault(){}});
  assert.match(f.node('#connectStatus').textContent,/format is invalid/);assert.ok(!f.node('#connectStatus').textContent.includes(invalid));assert.equal(f.node('#apiKey').value,'');
 }
 assert.equal(calls.some(c=>c.path==='/api/connect'),false);
 const valid='Synthetic.Token...-._~+/12345==';f.node('#apiKey').value=` ${valid}\n`;await f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.deepEqual(JSON.parse(calls.find(c=>c.path==='/api/connect').options.body),{apiKey:valid});
 assert.equal(calls.some(c=>c.path==='/api/try-on'),false);assert.equal(f.storageWrites.length,0);
});

test('zero-cap UI requires explicit read-only verification and suppresses duplicate checks and generation',async()=>{
 const calls=[];const gate=deferred();const f=await fixture(async(path,options)=>{calls.push({path,options});if(path==='/api/verify-key')return gate.promise;return response({live:true,localConnectEnabled:true,remainingTaskCap:0});});
 assert.equal(f.node('#generate').disabled,true);assert.equal(f.node('#verifyKey').disabled,false);assert.deepEqual(calls.map(c=>c.path),['/api/status']);
 f.node('#demo').onclick();assert.equal(f.node('#generate').disabled,true);f.node('#clear').onclick();assert.equal(f.node('#generate').disabled,true);
 const pending=f.node('#verifyKey').onclick();assert.equal(f.node('#verifyKey').disabled,true);await f.node('#verifyKey').onclick();assert.equal(calls.filter(c=>c.path==='/api/verify-key').length,1);
 gate.resolve(response({authenticated:true,remainingTaskCap:0}));await pending;assert.match(f.node('#verifyStatus').textContent,/Key authenticated by the read-only/);
 await f.node('#form').onsubmit({preventDefault(){}});assert.equal(calls.some(c=>c.path==='/api/try-on'),false);assert.equal(f.node('#generate').disabled,true);assert.equal(f.storageWrites.length,0);
});

test('verification UI never echoes unknown response content',async()=>{
 const secret='SyntheticUnexpectedVerificationToken12345';const f=await fixture(async path=>path==='/api/status'?response({live:true,localConnectEnabled:true,remainingTaskCap:0}):{ok:false,status:500,json:async()=>({error:secret})});
 await f.node('#verifyKey').onclick();assert.match(f.node('#verifyStatus').textContent,/HTTP 500/);assert.ok(!f.node('#verifyStatus').textContent.includes(secret));assert.equal(f.node('#verifyKey').disabled,true);
});

test('reloaded pages restore safe verification states and block duplicate checks at zero cap',async()=>{
 for(const state of ['pending','authenticated','failed']){
  const calls=[];const untrusted='SyntheticStatusMessageMustNeverAppear';
  const f=await fixture(async path=>{calls.push(path);return response({live:true,localConnectEnabled:true,remainingTaskCap:0,verification:{state,message:untrusted}});});
  assert.equal(f.node('#verifyKey').disabled,true);await f.node('#verifyKey').onclick();assert.deepEqual(calls,['/api/status']);
  assert.equal(f.node('#generate').disabled,true);assert.ok(!f.node('#verifyStatus').textContent.includes(untrusted));assert.ok(f.node('#verifyStatus').textContent.length>0);
  assert.match(f.node('#connectStatus').textContent,/generation is disabled/);assert.ok(!f.node('#connectStatus').textContent.includes('one generation'));
  if(state==='authenticated'){assert.match(f.node('#verifyStatus').textContent,/Key authenticated/);assert.match(f.node('#status').textContent,/authentication was confirmed/);}
 }
});
