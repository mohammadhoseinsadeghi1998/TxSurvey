// Node 22+; no npm dependencies. Set CHROME to a Chromium/Chrome executable.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const profile=mkdtempSync(path.join(tmpdir(),'survey-test-'));
const chrome=process.env.CHROME||'/opt/playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const http=spawn('python',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=9223',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let ws,seq=0;const pending=new Map();let checks=0;const errors=[];
async function cdp(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method+' '+JSON.stringify(params)));},10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function js(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function check(expression,label){assert.equal(await js(expression),true,label);checks++;console.log('PASS:',label);}
const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
const fill=(s,v)=>js(`(()=>{let e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function ready(){for(let i=0;i<50;i++){if(await js('!!document.querySelector("#next")'))return;await delay(100);}throw Error('Page not ready');}
try{
 let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9223/json')).json();break;}catch{await delay(100);}}
 if(!tabs)throw Error('Chrome unavailable; set CHROME');
 ws=new WebSocket(tabs[0].webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);});
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:'http://127.0.0.1:8765/'});await ready();
 await check('document.documentElement.dir==="rtl" && page===-1','RTL introduction');
 await click('#next');await click('#next');await check('page===0 && !!document.querySelector("#error").textContent','Required validation');
 await click('[name=channel][value="0"]');await click('[name=tenure][value="1"]');await click('#remember');await cdp('Page.reload');await ready();
 await check('page===0 && state.answers.tenure===1 && document.querySelector("#remember").checked','Draft restores after reload');await click('#next');
 await check('document.querySelectorAll("[data-topic]").length===61','61 topics rendered');
 await js('document.querySelector("details").open=true');await click('[data-topic]');await click('#next');await check('page===1','Topic note and text required');
 await fill('[data-text^="note-"]','توضیح آزمایشی');await fill('#duplicates','موردی ندارم');
 await fill('#search','۱۱۵۱');await check('document.querySelectorAll("[data-topic-row]:not([hidden])").length>0','Persian digit search');await fill('#search','zzzzzz');await check('!document.querySelector("#noResults").hidden','Search empty state');await fill('#search','');
 await click('#none');await check('state.none && state.topics.length===0','No challenge clears topic selection');await click('[data-topic]');await check('!state.none && !document.querySelector("#none").checked','Topic selection clears no-challenge');
 await click('#next');await fill('#fields','موردی ندارم');await click('[name=layout][value="0"]');await check('!document.querySelector("#follow-layout").hidden','Conditional layout visible');await fill('#layout_detail','متن حذف‌شونده');await click('[name=layout][value="2"]');await check('document.querySelector("#follow-layout").hidden && !("layout_detail" in state.answers)','Hidden detail removed');
 await click('[name=typing][value="4"]');await click('#next');await check('page===2','Other solution detail required');await fill('#typing_detail','پیشنهاد آزمایشی');await click('#next');
 await click('[name=wrapup][value="2"]');await click('#next');await check('page===3','Disagreement detail required');await fill('#wrapup_detail','جایگزین آزمایشی');await click('#next');
 await click('[name=interview][value="0"]');await click('#next');await check('page===4','Interview name required');await fill('#interview_detail','کاربر آزمایشی');await click('#next');
 await fill('#closing','<img src=x onerror=alert(1)>');await click('#next');
 await check('page===6 && document.querySelector("#progress").value===100 && !document.querySelector(".answer img")','Review progress and escaped text');
 await click('[data-go="2"]');await check('page===2 && document.querySelector("#fields").value==="موردی ندارم"','Review edit retains answers');await js('go(6)');
 await click('#submit');await check('!sending && !submitted && !!document.querySelector("#error").textContent','Explicit confirmation required');await click('#confirm');await click('#submit');await check('!submitted && document.querySelector("#error").textContent.includes("تنظیم")','Unconfigured endpoint blocked');
 await js('CONFIG.endpoint="https://script.google.com/macros/s/TEST/exec";window.fetch=async()=>{throw Error("offline")};true;');await click('#submit');await delay(100);await check('!submitted && !sending && document.querySelector("#submit").textContent.includes("دوباره")','Network failure retains retry');
 await js('window.fetch=async()=>({ok:true,json:async()=>({ok:true,id:"wrong"})})');await click('#submit');await delay(100);await check('!submitted','Wrong acknowledgement rejected');
 mkdirSync(path.join(root,'tests/screenshots'),{recursive:true});
 let shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(root,'tests/screenshots/desktop-review.png'),Buffer.from(shot.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 for(let i=0;i<=6;i++){await js(`go(${i})`);await check('document.documentElement.scrollWidth<=window.innerWidth',`No horizontal overflow: mobile section ${i}`);}
 shot=await cdp('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(root,'tests/screenshots/mobile-review.png'),Buffer.from(shot.data,'base64'));
 await click('#confirm');await js('window.fetch=async(url,opts)=>{window.sent=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,id:state.id})}}');await click('#submit');await delay(100);
 await check('submitted && !!document.querySelector(".success") && localStorage.getItem(KEY)===null','Confirmed success clears saved draft');
 await check('sent.topics.length===1 && !Object.hasOwn(sent.answers,"layout_detail")','Payload omits inactive detail');
 assert.equal(errors.length,0,'No uncaught browser errors');console.log(`PASS: ${checks} browser checks; no uncaught exceptions. Sending mocked, not Google live.`);
}finally{ws?.close();browser.kill();http.kill();await delay(200);rmSync(profile,{recursive:true,force:true});}
