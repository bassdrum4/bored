'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const {serve} = require('./serve.cjs');

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
 console.log('BROWSER LOGS '+JSON.stringify(messages.slice(-25)));
 console.log('FAILED REQUESTS '+JSON.stringify(badRequests.slice(-25)));
 assert.ok(await page.evaluate(()=>!document.querySelector('#player').hidden),'player should be visible');
});
