'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');
const baseline = process.env.GETAWAY_ORIGINAL_DATA;
const out = path.join(root, '_build', 'getaway-shootout');
fs.mkdirSync(out, { recursive:true });
function imageStats(file) {
  const py = [
    'from PIL import Image',
    'from collections import Counter',
    'import json,sys,math',
    'im=Image.open(sys.argv[1]).convert("RGB").resize((120,90))',
    'colors=Counter(tuple((v//24) for v in rgb) for rgb in im.getdata())',
    'freq=colors.most_common(1)[0][1]/(120*90)',
    'print(json.dumps(dict(groups=len(colors),dominant=round(freq,4),top=colors.most_common(5))))'
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c',py,file],{encoding:'utf8'}));
}
async function run(name,original=false){
  const site = await serve(path.join(root,'src'));
  let browser;
  try{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',
      headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page=await browser.newPage();
    await page.setViewport({width:960,height:650});
    const errors=[], msgs=[], remote=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')msgs.push(m.text().slice(0,300))});
    await page.setRequestInterception(true);
    page.on('request',req=>{
      if(original && req.url().endsWith('/GetawayShootout.data.unityweb')){
        return req.respond({status:200,contentType:'application/octet-stream',
          body:fs.readFileSync(baseline)});
      }
      if(req.url().startsWith('http') && !req.url().startsWith(site.origin+'/')){
        remote.push(req.url());
        return req.respond({status:204,body:''});
      }
      return req.continue();
    });
    await page.goto(site.origin+'/games/content/getaway-shootout.html');
    await page.waitForFunction(()=>window.__boredSnapshot?.().loaded===true,{timeout:95000});
    const steps=[];
    for(const seconds of [2,8,22]){
      await new Promise(r=>setTimeout(r,seconds===2?2000:seconds===8?6000:14000));
      const shot=path.join(out,name+'-'+seconds+'s.png');
      await page.screenshot({path:shot});
      const img=imageStats(shot);
      const diagnostics=await page.evaluate(()=>({
        status:document.querySelector('#status')?.textContent,
        overlay:document.querySelector('#error')?.className,
        snapshot:window.__boredSnapshot?.(),
        canvas:!!document.querySelector('#gameContainer canvas')
      }));
      steps.push({seconds,img,diagnostics});
    }
    // Go beyond loading: click the large original Play arrow in the 960×650 title
    // and confirm the next screen is not the reported solid-blue dead end.
    await page.mouse.click(475, 558);
    await new Promise(resolve => setTimeout(resolve, 7000));
    const afterPlay = path.join(out, name + '-after-play.png');
    await page.screenshot({path:afterPlay});
    const afterPlayStats = imageStats(afterPlay);
    steps.push({seconds:'after-play',img:afterPlayStats});
    console.log(JSON.stringify({name,steps,errors,msgs:msgs.slice(-10),remote},null,2));
    assert.deepEqual(errors,[],name+' page errors');
    assert.ok(remote.every(url => /^https:\/\/(?:config\.uca\.cloud\.unity3d\.com|cdp\.cloud\.unity3d\.com)\//.test(url)),
      name+' unexpected external requests: '+JSON.stringify(remote));
    return steps;
  }finally{try{await browser?.close()}finally{await site.close()}}
}
(async()=>{
  let original;
  if(baseline)original=await run('original',true);
  const patched=await run('patched',false);
  const last=patched.at(-1).img;
  assert.ok(last.groups>=8 && last.dominant<=0.94,
    'Patched game remained on nearly solid-colour screen after 22s: '+JSON.stringify(last));
  if(original){
    const base=original.at(-1).img;
    console.log('Final baseline vs modified:',JSON.stringify({base,modified:last}));
    assert.ok(last.groups>=Math.max(8,Math.floor(base.groups*.35)),
      'Modified game lacks most of the original menu visual detail');
  }
})().catch(e=>{console.error(e);process.exitCode=1});
