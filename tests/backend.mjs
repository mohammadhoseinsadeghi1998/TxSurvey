import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ctx=vm.createContext({console});
vm.runInContext(read('topics.js')+'\n'+read('schema.js'),ctx);
const data=vm.runInContext('JSON.stringify({TOPICS,SECTIONS})',ctx);
const server=vm.createContext({console});
vm.runInContext(read('google-apps-script/Code.gs')+'\n'+read('google-apps-script/Main.gs'),server);
assert.equal(vm.runInContext('JSON.stringify({TOPICS,SECTIONS})',server),data,'Frontend/backend schemas match');
const {TOPICS,SECTIONS}=JSON.parse(data);
assert.equal(TOPICS.length,11);assert.equal(TOPICS.flatMap(g=>g.topics).length,61);
assert.equal(new Set(TOPICS.flatMap(g=>g.topics.map(t=>t.id))).size,61);
let p={version:1,id:'12345678-1234-4234-8234-123456789abc',answers:{},topics:[],notes:{},none:true};
for(const s of SECTIONS) for(const q of s.questions){if(q.type==='topics')continue;p.answers[q.id]=q.options?0:'موردی ندارم';if(q.follow?.when.includes(0))p.answers[q.id+'_detail']='توضیح آزمایشی';}
function validate(payload){server.p=structuredClone(payload);return vm.runInContext('validatePayload(p)',server);}
validate(p);p.answers.closing='';validate(p);
let checks=5;
function reject(change){let copy=structuredClone(p);change(copy);assert.throws(()=>validate(copy));checks++;}
reject(p=>p.answers.channel=99);reject(p=>p.answers.interview_detail='');reject(p=>p.topics=['invalid']);reject(p=>p.none=false);reject(p=>p.answers.fields='');reject(p=>p.answers.closing='a'.repeat(5001));reject(p=>p.id='bad');
for(const s of SECTIONS)for(const q of s.questions)if(q.options)for(let i=0;i<q.options.length;i++){const c=structuredClone(p);c.answers[q.id]=i;if(q.follow?.when.includes(i)){c.answers[q.id+'_detail']='جزئیات';validate(c);c.answers[q.id+'_detail']='';assert.throws(()=>validate(c));}else validate(c);checks++;}
p.none=false;p.topics=[TOPICS[0].topics[0].id,TOPICS[1].topics[0].id];p.notes={[TOPICS[0].id]:'توضیح اول',[TOPICS[1].id]:'توضیح دوم'};validate(p);
reject(p=>delete p.notes[TOPICS[0].id]);reject(p=>p.topics.push(p.topics[0]));reject(p=>p.none=true);
assert.equal(vm.runInContext('safeCell("=IMPORTXML(1)")',server),"'=IMPORTXML(1)");checks++;
// Apps Script service doubles: exercise write, duplicate prevention and failure responses.
const rows=[];let released=0;
const sheet={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),setFrozenRows(){},setRightToLeft(){},getRange:(r,c,n,w)=>({getValues:()=>[rows[r-1].slice(c-1,c-1+w)],createTextFinder:id=>({matchEntireCell:()=>({findNext:()=>rows.slice(1).find(row=>row[0]===id)||null})})})};
Object.assign(server,{LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType:()=>JSON.parse(t)})}});
server.e={postData:{contents:JSON.stringify(p)}};
assert.equal(vm.runInContext('doPost(e)',server).ok,true);assert.equal(rows.length,2);assert.equal(rows[0].length,rows[1].length);
assert.equal(vm.runInContext('doPost(e)',server).duplicate,true);assert.equal(rows.length,2);assert.equal(released,2);
assert.equal(vm.runInContext('doPost(null)',server).ok,false);checks+=7;
console.log(`PASS: ${checks} validation/schema/backend checks (Apps Script services mocked).`);
