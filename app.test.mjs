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
 f.node('#apiKey').value=key;
 const pending=f.node('#connectForm').onsubmit({preventDefault(){}});
 assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,true);
 const connect=requests.find(r=>r.path==='/api/connect');assert.deepEqual(JSON.parse(connect.options.body),{apiKey:key});
 gate.resolve(response({live:true,remainingTaskCap:1}));await pending;
 assert.equal(f.node('#apiKey').value,'');assert.equal(f.node('#connectButton').disabled,false);
 assert.equal(requests.some(r=>r.path==='/api/try-on'),false);
 assert.match(f.node('#connectStatus').textContent,/not been verified with YouCam/);
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
