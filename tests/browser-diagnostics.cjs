// Local browser fixtures only. Do not log request headers, query parameters,
// bodies or browser storage. CI uploads these bounded artifacts on failure.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const logs = new WeakMap();
function watch(page) {
  if (logs.has(page)) return;
  const list = [];
  logs.set(page,list);
  const add = entry => { list.push(String(entry).slice(0,1000)); if(list.length>100) list.shift(); };
  page.on('pageerror', e => add('page error: '+e.message));
  page.on('console', m => add('console '+m.type()+': '+m.text()));
  page.on('requestfailed', r => {
    let url; try { const u=new URL(r.url());url=u.origin+u.pathname; } catch { url='(non-http)'; }
    add('request failed: '+r.method()+' '+url+' '+r.failure()?.errorText);
  });
}
async function capture(page,label) {
  if (!process.env.CI || !page || page.isClosed()) return;
  try {
    const dir = path.join(process.cwd(),'test-artifacts');
    await fs.mkdir(dir,{recursive:true});
    const name = path.join(dir,label.replace(/[^a-z0-9-]/gi,'-')+'-'+randomUUID());
    await fs.writeFile(name+'.log',(logs.get(page)||[]).join('\n'));
    await page.screenshot({path:name+'.png',timeout:3000}).catch(()=>{});
    const dom = await page.evaluate(()=>[...document.querySelectorAll('main,nav,[role="status"],dialog,#player')].slice(0,12).map(e=>({id:e.id,hidden:e.hidden,text:e.innerText.slice(0,1000)}))).catch(()=>[]);
    await fs.writeFile(name+'.json',JSON.stringify(dom,null,2));
  } catch { /* diagnostics must not mask the original failure */ }
}
module.exports={watch,capture};
