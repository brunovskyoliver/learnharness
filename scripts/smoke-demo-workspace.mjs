/** Exercises real sandboxed iframe continuity, graph focus, and footer geometry.
 * All sessions are isolated; chat POSTs are rejected before invoking a model. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const data = await mkdtemp(path.join(os.tmpdir(), 'learning-workspace-'));
const port = Number(process.env.LH_UI_PORT ?? 3104);
const base = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(r => setTimeout(r, ms));
let server, browser;
try {
 const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json', import.meta.url), 'utf8'));
 const plan = fixture.messages.findIndex(m => m.role === 'toolResult' && m.toolName === 'plan_init' && m.details?.tree);
 const check = fixture.messages.findIndex((m,i) => i > plan && m.role === 'assistant' && m.content?.some(p => p.type === 'toolCall' && p.name === 'quiz' && p.arguments.type === 'check'));
 assert.ok(check > 0);
 const spec = {params:{rate:{type:'slider',label:'Learning rate',min:.01,max:.2,step:.01,value:.1}},state:{x:'3'},step:'s.x = s.x * (1-p.rate)',run:{maxSteps:1000},panels:[{type:'chart',title:'Loss',data:{points:'[{x:t,y:s.x}]'},spec:{mark:'point',encoding:{x:{field:'x',type:'quantitative'},y:{field:'y',type:'quantitative'}},data:{name:'points'}}},{type:'plot3d',title:'Surface',traces:'[{type:"surface",z:[[1,0,1],[0,-1,0],[1,0,1]]}]'},{type:'flow',title:'Flow',nodes:'[{id:"a",label:"Input"},{id:"b",label:"Output"}]',edges:'[{from:"a",to:"b"}]'},{type:'readouts',items:[{label:'Step',value:'t'},{label:'Value',value:'s.x'}]}]};
 const html = `<!doctype html><html><body><div id="lh-kit"></div><script type="application/json" id="lh-kit-spec">${JSON.stringify(spec)}</script><script src="/demo-kit/runtime.js"></script></body></html>`;
 const artifact = {id:'steer_workspace',role:'custom',customType:'subagent-steer',content:'Demo delivered.',display:true,details:{jobId:'workspace',kind:'demo',toolCallId:'demo-job',result:{title:'Gradient descent',html,tested:true}},timestamp:Date.now()};
 const legacy = { ...artifact, id:'steer_legacy', details:{...artifact.details,jobId:'legacy',result:{title:'Legacy demo',html:'<html><body><input aria-label="Legacy value" value="3"><script>window.identity=Math.random()</script></body></html>',tested:true}} };
 const messages = fixture.messages.slice(0, check);
 messages.push(artifact,legacy);
 const question = structuredClone(fixture.messages[check]);
 for(const part of question.content) if(part.type==='toolCall' && part.name==='quiz'){part.arguments.demoRef={messageId:artifact.id};part.arguments.question='The path crosses the valley on each update. What would you change first?';part.arguments.details='Try a smaller step in the demo and compare the path.';part.arguments.options=[{label:'Reduce the learning rate',value:'reduce'},{label:'Increase the learning rate',value:'increase'},{label:'Keep the learning rate unchanged',value:'keep'}];part.arguments.correctAnswer='reduce';part.arguments.explanation='A smaller learning rate reduces overshooting across the valley.';}
 question.content.unshift({type:"text",text:"## Why the path changes\n\nThe learning rate sets how far the weights move on each update. Increase it and compare the result with a smaller step.\n\nUse **Gradient descent** beside the question to try a few values."});
 messages.push(question);
 await mkdir(path.join(data,'chats'));
 await writeFile(path.join(data,'chats','workspace-ui.json'),JSON.stringify({...fixture,id:'workspace-ui',title:'Workspace verification',messages}));
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,LH_HOSTED:'0',LH_DATA_DIR:data,LH_AUTH_FILE:path.join(data,'auth.json'),NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [server.stdout,server.stderr])stream.on('data',c=>output=(output+c).slice(-5000));
 let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error(output);try{if((await fetch(base+'/api/chats')).ok){ready=true;break}}catch{}await pause(250)}assert.ok(ready,output);
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>{if(r.method()==='POST' && new URL(r.url()).pathname==='/api/chat')r.abort();else r.continue()});
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/chat/workspace-ui',{waitUntil:'networkidle2'});
 await page.waitForSelector('[data-demo-slot]');
 const live = '[data-demo-live="steer_workspace"]';
 const handle=await page.$(live+' iframe');const frame=await handle.contentFrame();
 await frame.waitForFunction(()=>window.__lhKit && document.querySelectorAll('.k-panel').length===4);
 await frame.evaluate(()=>window.__lhKit.ready);
 await frame.evaluate(()=>{window.identity=Math.random();document.querySelector('input').value='.15';document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));});
 const identity=await frame.evaluate(()=>window.identity);
 await frame.click('.k-buttons button');
 const before=await frame.$eval('.k-readouts',e=>e.textContent);
 assert.match(before,/Step1/);
 assert.equal(await page.$('[data-testid="reading-thinking-field"]'),null);
 await page.waitForSelector('[data-testid="teach-check-reveal"]',{visible:true});
 assert.equal(await page.$eval('[data-testid="lesson-question"]',e=>e.hidden),true,'question starts as a compact summary');
 await page.click('[data-testid="teach-check-reveal"]');
 await page.waitForSelector('[data-testid="lesson-question"]',{visible:true});
 await page.waitForSelector('.lesson-footer [data-testid="stats-model"]',{visible:true});
 assert.ok(await page.$('.lesson-footer [data-testid="stats-thinking"]'),'reasoning is directly available');
 assert.equal(await page.$('[data-testid="session-options"]'),null,'no outer Options popup');
 // The fixture intentionally has no provider credentials. Model/reasoning may
 // be disabled; the independent usage control must still open and claim Escape.
 await page.focus('.lesson-footer [data-testid="stats-summary"]');await page.keyboard.press('Enter');
 await page.waitForSelector('[data-testid="stats-detail"]',{visible:true});
 await page.keyboard.press('Escape');
 await page.waitForSelector('[data-testid="stats-detail"]',{hidden:true});
 assert.equal(await page.$('[data-testid="abort-turn-dialog"]'),null);
 const geometry=await page.evaluate(()=>{const dock=document.querySelector('.lesson-footer').getBoundingClientRect();const question=document.querySelector('[data-testid="lesson-question"]');let s=document.querySelector('[data-testid="lesson-content"]').parentElement;while(s&&!/auto|scroll/.test(getComputedStyle(s).overflowY))s=s.parentElement;return {dockHeight:dock.height,spacer:document.querySelector('[data-testid="dock-spacer"]').offsetHeight,questionInLesson:document.querySelector('[data-testid="lesson-content"]').contains(question),questionInDock:document.querySelector('[data-testid="dock-shell"]').contains(question),dockTop:dock.top,scrollBottom:s.getBoundingClientRect().bottom,body:document.body.scrollWidth,viewport:innerWidth};});
 assert.ok(geometry.scrollBottom>geometry.dockTop,JSON.stringify(geometry));assert.ok(geometry.spacer>=geometry.dockHeight-1);assert.equal(geometry.questionInLesson,false);assert.equal(geometry.questionInDock,true);assert.ok(geometry.body<=geometry.viewport);
 const scrollTop = () => page.evaluate(() => {let s=document.querySelector('[data-testid="lesson-content"]').parentElement;while(s&&!/auto|scroll/.test(getComputedStyle(s).overflowY))s=s.parentElement;return s.scrollTop;});
 // Opening the floating question changes its measured reserve and animates the
 // lesson toward the bottom. Capture the focus anchor after that work settles,
 // rather than sampling an intermediate scroll position before focus arrives.
 const settleLesson = () => page.waitForFunction(() => {
  let s=document.querySelector('[data-testid="lesson-content"]').parentElement;while(s&&!/auto|scroll/.test(getComputedStyle(s).overflowY))s=s.parentElement;
  const shell=document.querySelector('[data-testid="dock-shell"]');
  const value=[s.scrollTop,s.scrollHeight,s.clientHeight,shell.getBoundingClientRect().height].join(',');
  const previous=window.workspaceSettled;
  if(!previous||previous.value!==value||shell.getAnimations().some(a=>a.playState==='running')){window.workspaceSettled={value,since:performance.now()};return false;}
  return performance.now()-previous.since>=160;
 },{timeout:5000});
 for(const index of [0,1,2]){
  await settleLesson();
  const previousTop=await scrollTop();
  if(index===1) await frame.evaluate(async()=>{const plot=document.querySelector('.js-plotly-plot');await window.Plotly.relayout(plot,{'scene.camera':{eye:{x:2,y:1,z:.8}}});});
  await frame.evaluate(i=>document.querySelectorAll('.k-panel-head button')[i].click(),index);
  await page.waitForSelector(live+'[data-focused]');
  await frame.waitForFunction(()=>document.querySelector('#lh-kit').classList.contains('k-focus'));
  if(process.env.LH_UI_SCREENSHOT_DIR && index===0){await mkdir(process.env.LH_UI_SCREENSHOT_DIR,{recursive:true});await page.$eval(live,async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:path.join(process.env.LH_UI_SCREENSHOT_DIR,'graph-focus.png')});}
  assert.equal(await frame.evaluate(()=>window.identity),identity);
  assert.equal(await frame.$eval('input',e=>e.value),'0.15');
  assert.equal(await frame.$eval('.k-readouts',e=>e.textContent),before);
  const shown=await frame.$$eval('.k-panel',es=>es.filter(e=>!e.hidden).length);assert.equal(shown,1);
  if(index===1) assert.deepEqual(await frame.evaluate(()=>document.querySelector('.js-plotly-plot')._fullLayout.scene.camera.eye),{x:2,y:1,z:.8});
  await frame.focus('input');await page.keyboard.press('Escape');
  await page.waitForFunction(sel=>!document.querySelector(sel).hasAttribute('data-focused'),{},live);
  assert.equal(await frame.evaluate(()=>window.identity),identity);
  await page.waitForFunction(top=>{let s=document.querySelector('[data-testid="lesson-content"]').parentElement;while(s&&!/auto|scroll/.test(getComputedStyle(s).overflowY))s=s.parentElement;return Math.abs(s.scrollTop-top)<2;},{timeout:3000},previousTop).catch(async error=>{const state=await page.evaluate(()=>{let s=document.querySelector('[data-testid="lesson-content"]').parentElement;while(s&&!/auto|scroll/.test(getComputedStyle(s).overflowY))s=s.parentElement;return {scrollTop:s.scrollTop,max:s.scrollHeight-s.clientHeight,compact:document.querySelector('[data-testid="dock-shell"]').dataset.compact,footer:document.querySelector('.lesson-footer').getBoundingClientRect().toJSON(),active:document.activeElement?.outerHTML.slice(0,200)};});throw new Error(`Panel ${index} scroll restoration ${previousTop}: ${JSON.stringify(state)}`,{cause:error});});
 }
 await frame.click('.k-primary');
 await pause(250);
 await frame.click('.k-panel-head button');
 await page.waitForSelector(live+'[data-focused]');
 assert.equal(await frame.$eval('.k-primary',e=>e.textContent),'Pause','playback remains running');
 await page.$eval(live,async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
 await page.click('[aria-label="Close expanded demo"]');
 await frame.waitForFunction(()=>!document.querySelector('#lh-kit').classList.contains('k-focus'));
 await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await frame.click('.k-primary');
 await page.click('[data-testid="demo-panel-close"]');await pause(300);assert.equal(await page.$('[data-demo-slot]'),null,'manual close stays closed');
 const summary=await page.$('[data-testid="question-dock-bar"], [data-testid="teach-check-reveal"]');if(summary)await summary.click();
 await page.click('.question-demo-reference button');await page.waitForSelector('[data-demo-slot]');assert.equal(await frame.evaluate(()=>window.identity),identity);
 await page.select('[data-testid="demo-panel-select"]','steer_legacy');
 const old=await (await page.$('[data-demo-live="steer_legacy"] iframe')).contentFrame();const oldIdentity=await old.evaluate(()=>window.identity);
 await old.$eval('input',e=>e.value='42');await page.click('[data-demo-actions] [aria-label="Expand demo"]');await page.$eval('[data-demo-live="steer_legacy"]',async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
 await page.click('[aria-label="Close expanded demo"]');
 assert.equal(await old.evaluate(()=>window.identity),oldIdentity);assert.equal(await old.$eval('input',e=>e.value),'42');
 await page.select('[data-testid="demo-panel-select"]','steer_workspace');
 await page.setViewport({width:390,height:844});await pause(300);
 assert.equal(await frame.evaluate(()=>window.identity),identity);
 assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),'mobile does not overflow');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await frame.click('.k-panel-head button');await page.waitForSelector(live+'[data-focused]');
 assert.equal(await page.$eval(live,e=>e.getAnimations().length),0,'reduced motion');
 await page.$eval(live,async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
 await page.click('[aria-label="Close expanded demo"]');
 await frame.waitForFunction(()=>!document.querySelector('#lh-kit').classList.contains('k-focus'));
 await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));

 const mobileSummary=await page.$('[data-testid="question-dock-bar"], [data-testid="teach-check-reveal"]');if(mobileSummary)await mobileSummary.click();
 await page.waitForSelector('[data-testid="thinking-field"] textarea',{visible:true});
 assert.ok(await page.$eval('[data-testid="lesson-question"]',e=>e.getBoundingClientRect().height<=(window.visualViewport?.height??innerHeight)/2+1),'mobile question is bounded to half the visible screen');
 await page.type('[data-testid="thinking-field"] textarea','My draft survives opening the graph.');
 assert.equal(await page.$eval('[data-testid="thinking-field"] textarea',e=>e.value),'My draft survives opening the graph.','typing retains focus');
 await frame.click('.k-panel-head button');await page.waitForSelector(live+'[data-focused]');
 await page.focus('[aria-label="Close expanded demo"]');await page.keyboard.press('Tab');
 assert.ok(await page.$eval(live,e=>e.contains(document.activeElement)),'modal Tab stays inside');
 await page.keyboard.press('Escape');await page.waitForFunction(sel=>!document.querySelector(sel).hasAttribute('data-focused'),{},live);
 assert.equal(await page.$eval('[data-testid="thinking-field"] textarea',e=>e.value),'My draft survives opening the graph.');
 assert.equal(await page.$('[data-testid="abort-turn-dialog"]'),null);
 await page.setViewport({width:390,height:500});await pause(200);
 assert.ok(await page.$eval('.lesson-footer',e=>e.getBoundingClientRect().bottom<=innerHeight+1),'short viewport keeps footer visible');
 await page.setViewport({width:390,height:844});await pause(100);
 if(process.env.LH_UI_SCREENSHOT_DIR){await mkdir(process.env.LH_UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.LH_UI_SCREENSHOT_DIR,'mobile.png')});await page.setViewport({width:1440,height:1000});await pause(150);await page.screenshot({path:path.join(process.env.LH_UI_SCREENSHOT_DIR,'desktop.png')});}
 assert.deepEqual(errors,[]);console.log('PASS: kit/legacy continuity, three renderer focus modes, parameter and simulation state, Escape, footer geometry, automatic reference, manual close, mobile, reduced motion');
} finally {await browser?.close();server?.kill('SIGTERM');await rm(data,{recursive:true,force:true});}
