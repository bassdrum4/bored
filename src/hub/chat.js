import {PRESENCE_ORIGIN} from './presence-endpoint.js';
import {freshSession,hasIdentity,getSession} from './backend.js';
const origin=(()=>{try{const u=new URL(PRESENCE_ORIGIN);return u.protocol==='https:'&&u.hostname.endsWith('.onrender.com')&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:'';}catch{return '';}})();
const $=id=>document.getElementById(id);
const button=$('bored-chat-toggle'),panel=$('bored-chat'),close=$('bored-chat-close'),list=$('bored-chat-list'),form=$('bored-chat-form'),input=$('bored-chat-input'),send=$('bored-chat-send'),status=$('bored-chat-status'),replyBar=$('bored-chat-reply'),adminBar=$('bored-chat-admin');
if(button&&panel&&origin&&location.hostname==='bassdrum4.github.io'&&/^\/bored(?:\/|$)/.test(location.pathname))mount();
function mount(){
  let opened=false,controller=null,cursor='',mode='sse',messages=new Map(),retry=null,failures=0,admin=false,enabled=false,replyTo=null,posting=false,generation=0;
  const blocked=new Set();try{for(const id of JSON.parse(localStorage.getItem('bored.chat.blocked')||'[]'))blocked.add(id);}catch{}
  function notice(text){status.textContent=text;}
  function updateForm(){input.disabled=send.disabled=!opened||!enabled||!hasIdentity()||posting;input.placeholder=hasIdentity()?'Say something…':'Sign in to send messages';}
  async function token(){return hasIdentity()?(await freshSession())?.access_token:null;}
  async function post(body,signal){
    const r=await fetch(origin+'/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal});
    if(!r.ok){let error='Chat is unavailable.';try{error=(await r.json()).error||error;}catch{}throw Error(error);}
    return r;
  }
  function action(label,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);return b;}
  function setReply(m){replyTo=m;replyBar.replaceChildren();replyBar.hidden=!m;if(m){const s=document.createElement('span');s.textContent='Replying to '+m.handle;replyBar.append(s,action('Cancel',()=>setReply(null)));input.focus();}}
  async function command(payload,success){try{const jwt=await token();if(!jwt)throw Error('Sign in first.');const r=await post({...payload,jwt},AbortSignal.timeout(12000));const result=await r.json();if(success)success(result);else notice('Done.');}catch(e){notice(e.message);}}
  function draw(){
    const follow=list.scrollHeight-list.scrollTop-list.clientHeight<90;
    const frag=document.createDocumentFragment(),now=Date.now();
    for(const [id,m] of messages){
      if(m.at<now-86400000){messages.delete(id);continue;}
      if(blocked.has(m.author))continue;
      const row=document.createElement('article');row.className='bored-chat-message';
      const head=document.createElement('div');head.className='bored-chat-meta';
      const name=document.createElement('strong');name.textContent=m.handle;
      const time=document.createElement('time');time.dateTime=new Date(m.at).toISOString();time.textContent=new Date(m.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      head.append(name,time);
      if(m.reply){const q=document.createElement('small');q.textContent='↳ '+m.reply.handle;row.append(q);}
      const body=document.createElement('p');body.textContent=m.text;
      const menu=document.createElement('details');menu.className='bored-chat-menu';const summary=document.createElement('summary');summary.textContent='···';summary.setAttribute('aria-label','Message options');menu.append(summary);
      if(hasIdentity()){menu.append(action('Reply',()=>{menu.open=false;setReply(m);}),action('Report',()=>{menu.open=false;if(confirm('Report this message to Bored moderators?'))void command({mode:'report',id:m.id},()=>notice('Report submitted.'));}));}
      menu.append(action('Block locally',()=>{blocked.add(m.author);try{localStorage.setItem('bored.chat.blocked',JSON.stringify([...blocked].slice(-200)));}catch{}draw();}));
      if(admin){menu.append(action('Delete',()=>void command({mode:'admin',action:'delete',id:m.id})),action('Mute 10 min',()=>void command({mode:'admin',action:'ban',id:m.id,seconds:600})),action('Ban 24h',()=>void command({mode:'admin',action:'ban',id:m.id,seconds:86400})));}
      head.append(menu);row.append(head,body);frag.append(row);
    }
    list.replaceChildren(frag);if(follow)list.scrollTop=list.scrollHeight;
  }
  function renderAdmin(){
    adminBar.hidden=!admin;adminBar.replaceChildren();if(!admin)return;
    adminBar.append(action(enabled?'Disable chat':'Enable chat',()=>void command({mode:'admin',action:'enable',enabled:!enabled},()=>{restart();})),
      action('Reports',()=>void command({mode:'admin',action:'reports'},result=>{
        const section=document.createElement('div');section.className='bored-chat-reports';
        for(const r of result.reports||[]){const item=document.createElement('p');item.textContent=r.handle+': '+r.message+' — '+new Date(r.created_at).toLocaleString();item.append(action('Ban 24h',()=>void command({mode:'admin',action:'ban',user:r.author,seconds:86400})),action('Unban',()=>void command({mode:'admin',action:'unban',user:r.author})));section.append(item);}
        panel.querySelectorAll('.bored-chat-reports').forEach(el=>el.remove());
        if(!section.childNodes.length)section.textContent='No reports.';section.prepend(action('Close reports',()=>section.remove()));list.before(section);
      })));
  }
  function accept(f){
    if(f.t==='idle'||f.t==='renew')return;
    if(f.t!=='chat'||typeof f.cursor!=='string')throw Error('Chat connection interrupted.');
    cursor=f.cursor;enabled=f.enabled===true;
    if(!enabled){messages.clear();notice('Chat is disabled.');cancel();}
    else{
      if(f.reset){messages.clear();for(const m of f.messages||[])messages.set(m.id,m);}
      for(const e of f.events||[]){if(e.type==='message')messages.set(e.message.id,e.message);else if(e.type==='delete')messages.delete(e.id);}
      while(messages.size>200)messages.delete(messages.keys().next().value);
      notice('Public chat · Be kind. No personal information.');
    }
    draw();updateForm();renderAdmin();
  }
  function cancel(){clearTimeout(retry);retry=null;controller?.abort();controller=null;}
  async function connect(){
    if(!opened||controller)return;
    const g=generation,c=new AbortController();controller=c;let timer,renew=false,failed=false;
    const active=()=>opened&&generation===g&&controller===c;
    const arm=ms=>{clearTimeout(timer);timer=setTimeout(()=>c.abort(),ms);};
    try{
      arm(mode==='sse'?30000:40000);
      const r=await post({mode,cursor},c.signal);
      if(!active())return;
      if(mode==='poll'){const f=await r.json();if(!active())return;accept(f);failures=0;}
      else{
        if(!r.body||!r.headers.get('content-type')?.includes('text/event-stream'))throw Error('Streaming unavailable');
        const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(active()){
          const {done,value}=await reader.read();if(done)break;
          if(!active())break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>262144)throw Error('Oversized response');
          let i;while((i=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,i);buffer=buffer.slice(i+2);if(part.startsWith(':')){arm(45000);continue;}if(!part.startsWith('data: '))continue;
            const f=JSON.parse(part.slice(6));if(f.t==='renew'){renew=true;break;}accept(f);failures=0;arm(45000);
          }if(renew)break;
        }
        if(!renew&&active())throw Error('Stream disconnected.');
      }
    }catch(e){if(active()){failed=true;failures++;mode='poll';notice(failures>2?'Chat reconnecting…':e.message);if(failures>2){enabled=false;updateForm();}}}
    finally{clearTimeout(timer);if(controller===c){controller=null;c.abort();if(opened&&generation===g&&(failed||enabled))retry=setTimeout(connect,failed?Math.min(1000*2**failures,30000):0);}}
  }
  async function restart(){
    const g=++generation;cancel();enabled=false;admin=false;updateForm();notice('Connecting…');
    try{const jwt=await token();const r=await post({mode:'status',jwt},AbortSignal.timeout(30000));const s=await r.json();if(!opened||g!==generation)return;
      enabled=s.enabled===true;admin=s.admin===true;renderAdmin();updateForm();
      if(enabled)void connect();else notice('Chat is disabled.');
    }catch(e){if(opened&&g===generation){notice(e.message);renderAdmin();}}
  }
  function setOpen(value){opened=value;panel.hidden=!value;button.setAttribute('aria-expanded',String(value));if(value){mode='sse';failures=0;void restart();}else{generation++;cancel();enabled=false;updateForm();setReply(null);panel.querySelectorAll('.bored-chat-reports').forEach(el=>el.remove());button.focus();}}
  button.hidden=false;button.addEventListener('click',()=>setOpen(!opened));close.addEventListener('click',()=>setOpen(false));
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(posting||!enabled||!hasIdentity())return;
    const text=input.value.trim();if(!text)return;posting=true;updateForm();
    try{const jwt=await token();if(!jwt)throw Error('Sign in first.');await post({mode:'send',jwt,text,reply:replyTo?.id},AbortSignal.timeout(15000));input.value='';setReply(null);}
    catch(err){notice(err.message);}finally{posting=false;updateForm();if(opened)input.focus();}
  });
  $('bored-chat-unblock').addEventListener('click',()=>{blocked.clear();try{localStorage.removeItem('bored.chat.blocked');}catch{}draw();notice('Local blocks cleared.');});
  window.addEventListener('bored:identity',()=>{if(opened){messages.clear();cursor='';setReply(null);void restart();}});
  window.addEventListener('pagehide',()=>{cancel();opened=false;generation++;panel.hidden=true;button.setAttribute('aria-expanded','false');});
}
