'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const {serve} = require('./serve.cjs');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
test('diagnose the actual Getaway Shootout Bored hash route and iframe startup', {timeout:145000},async t=>{
 const srv=await serve(path.join(ROOT,'src'));
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 t.after(async()=>{try{await browser.close()}finally{await srv.close()}});
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:790});
 const messages=[],badRequests=[];
 page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')messages.push('console '+m.text().slice(0,300))});
 page.on('pageerror',e=>messages.push('PAGE ERROR '+e.stack));
 page.on('requestfailed',req=>badRequests.push([req.url(),req.failure()?.errorText]));
 await page.setRequestInterception(true);
 page.on('request', req=>{
   const url=req.url();
   if(!/^https?:/.test(url)||url.startsWith(srv.origin+'/'))return req.continue();
   // Bored's normal external fonts, auth and analytics do not affect Unity, and
   // the original Unity export itself tries remote analytics.
   return req.respond({status:204,headers:{'access-control-allow-origin':'*'},body:''});
 });
 const url=srv.origin+'/index.html?utm_source=chatgpt.com#getaway-shootout';
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.current==='getaway-shootout',{timeout:20000});
 const hostLoader=await page.evaluate(()=>{
   const overlay=document.querySelector('#getaway-loading');
   return {shown:!overlay.hidden, inPlayer:overlay.parentElement?.id==='player',
     title:overlay.querySelector('h2')?.textContent,
     progress:overlay.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')};
 });
 console.log('BORED HOST LOADER INITIAL '+JSON.stringify(hostLoader));
 assert.ok(hostLoader.shown && hostLoader.inPlayer && hostLoader.title==='Getaway Shootout',
   'Bored must show an obvious external loading screen before the game is ready');
 let frame=await (await page.$('#frame')).contentFrame();
 const screenshots=path.join(ROOT,'_build/getaway-hub-route');fs.mkdirSync(screenshots,{recursive:true});
 for(const [name, delay] of [['start',3000],['later',9000],['settled',14000]]){
   await new Promise(r=>setTimeout(r,delay));
   frame=await (await page.$('#frame')).contentFrame();
   const diag=await page.evaluate(()=>{
     const p=document.querySelector('#player'),f=document.querySelector('#frame');
     let inner={};
     try{
      const w=f.contentWindow,d=f.contentDocument;
      inner={url:w.location.href,baseURI:d.baseURI,title:d.title,ready:d.readyState,
       snapshot:w.__boredSnapshot?.(),status:d.querySelector('#status')?.textContent,
       statusHidden:d.querySelector('#status')?.hidden,err:d.querySelector('#error')?.className,
       canvasCount:d.querySelectorAll('canvas').length,
       loader:!!w.UnityLoader,blobCount:d.querySelectorAll('script[src^="blob:"]').length,
       container:d.querySelector('#gameContainer')?.getBoundingClientRect().toJSON()};
     }catch(e){inner={error:String(e)}}
     return {hash:location.hash,current:window.current,playing:!p.hidden,frameURL:f.src,srcdocLength:f.srcdoc?.length,inner};
   });
   await page.screenshot({path:path.join(screenshots,name+'.png')});
   console.log(name+' DIAGNOSTICS '+JSON.stringify(diag));
 }
 const finalShot = path.join(screenshots,'settled.png');
 const stats = JSON.parse(execFileSync('python3',['-c',[
   'import json,sys',
   'from PIL import Image',
   'from collections import Counter',
   'im=Image.open(sys.argv[1]).convert("RGB").resize((100,75))',
   'colors=Counter(tuple(v//24 for v in p) for p in im.getdata())',
   'print(json.dumps({"groups":len(colors),"topFraction":colors.most_common(1)[0][1]/7500}))'
 ].join('\n'),finalShot],{encoding:'utf8'}));
 console.log('FINAL SCREEN PIXELS '+JSON.stringify(stats));
 assert.ok(stats.groups>30 && stats.topFraction<0.78,
   'Getaway Shootout still displays a mostly uniform blue screen: '+JSON.stringify(stats));
 const state=await page.evaluate(()=>{
   const f=document.querySelector('#frame');
   const loading=document.querySelector('#getaway-loading');
   return {source:f.getAttribute('src'),srcdoc:f.getAttribute('srcdoc'),
     loaded:f.contentWindow.__boredSnapshot?.().loaded===true,
     loaderHidden:loading.hidden,
     loaderPercent:loading.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),
     loaderOnlyInHost:!f.contentDocument?.querySelector('#getaway-loading')};
 });
 assert.ok(state.source?.includes('/games/content/getaway-shootout.html'),
   'Unity game must load as its own iframe document');
 assert.equal(state.srcdoc,null,'Unity game must not run in srcdoc');
 assert.ok(state.loaded,'Unity runtime must load in the hub');
 assert.equal(state.loaderHidden,true,'host loading overlay must disappear once Unity is ready');
 assert.equal(state.loaderPercent,'100','host progress indicator must reach 100%');
 assert.equal(state.loaderOnlyInHost,true,'loading UI must be in Bored, not the Unity game');
 console.log('BROWSER LOGS '+JSON.stringify(messages.slice(-25)));
 console.log('FAILED REQUESTS '+JSON.stringify(badRequests.slice(-25)));
 assert.ok(await page.evaluate(()=>!document.querySelector('#player').hidden),'player should be visible');
});
