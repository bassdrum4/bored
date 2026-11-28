import { showRecordToast } from './record-toast.js';
import { PRESENCE_ORIGIN } from './presence-endpoint.js';
import { backendReady, freshSession, getSession, hasIdentity, request } from './backend.js';

const GUEST='guest', PREF='bored.presence.guest.visible', KEY='bored.presence.guest.key';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONNECT_TIMEOUT=30000, STREAM_IDLE=45000, POLL_TIMEOUT=40000;
let ephemeralKey='', ephemeralPref=null;

export function renderSocketUrl(origin) {
  try {
    const u=new URL(origin);
    if(u.protocol!=='https:' || !u.hostname.endsWith('.onrender.com') || u.username || u.password ||
       u.port || u.pathname!=='/' || u.search || u.hash) return '';
    return 'wss://'+u.hostname+'/ws';
  }catch{return '';}
}
// The same service answers a blocked socket over plain HTTPS.
export function renderPollUrl(origin) {
  return renderSocketUrl(origin) ? origin.replace(/\/+$/,'')+'/presence' : '';
}
export function renderEventUrl(origin){return renderSocketUrl(origin)?origin.replace(/\/+$/,'')+'/presence/events':'';}
function liveSite(){
  try{return location.protocol==='https:' && location.hostname==='bassdrum4.github.io' && /^\/bored(?:\/|$)/.test(location.pathname);}catch{return false;}
}
function guestVisible(){if(ephemeralPref!==null)return ephemeralPref;try{return localStorage.getItem(PREF)!=='off';}catch{return true;}}
function guestId(){
  let id=ephemeralKey;
  try{id=localStorage.getItem(KEY)||id;}catch{}
  if(!UUID.test(id||''))id=crypto.randomUUID();
  ephemeralKey=id;
  try{if(localStorage.getItem(KEY)!==id)localStorage.setItem(KEY,id);}catch{}
  return id;
}
function viewer(){return hasIdentity()?getSession()?.user?.id||GUEST:GUEST;}
export function boringLabel(n){return n+(n===1?' boring person':' boring people');}

export function mountRenderPresence(){
  const $=id=>document.getElementById(id);
  const details=$('online-presence'), summary=$('online-summary'), list=$('online-names'),
    status=$('online-status'), setting=$('presence-enabled'), note=$('presence-setting-status'),
    privacy=$('presence-privacy-note'), link=$('presence-settings-link');
  if(!details||!summary||!list||!status||!setting||!note||!privacy||!link)return;
  const eligible=backendReady()&&liveSite()&&typeof fetch==='function';
  const endpoint=renderEventUrl(PRESENCE_ORIGIN);
  let owner=null,epoch=0,visible=null,ready=false,paused=false,suspended=false,saving=false;
  let observerId='';
  let retry=0,pollFail=0,pollMode=false,controller=null,sid='',cursor='',lastCredentials=null;
  let counts=null,names=[],namesReady=false,reading=false,chatOpen=false;
  const current=(id,v)=>!suspended&&owner===id&&epoch===v&&viewer()===id;
  async function account(id,action='get',args={}){
    const s=await freshSession();
    if(s?.user?.id!==id||viewer()!==id)throw Error('Account changed');
    const result=await request('/rest/v1/rpc/bored_presence_account',{method:'POST',body:{action,args},token:s.access_token});
    if(viewer()!==id||result?.id!==id||typeof result.visible!=='boolean')throw Error('Invalid preference');
    return result;
  }
  function render(){
    list.replaceChildren();
    if(!counts||!ready){
      summary.textContent=visible===false?'Appear offline':'Online';
      status.textContent=visible===false?'You are hidden. Turn online status back on in Settings to see the list.':
        paused?'Online status paused.':!endpoint?'Presence server not connected yet.':
        pollFail>=3?'Online status is unavailable.':'Connecting…';
      return;
    }
    summary.textContent=(counts.a+counts.g)+' online';
    status.textContent=counts.a+counts.g?'':'Nobody is online right now.';
    function row(label,cls=''){const li=document.createElement('li');li.textContent=label;li.className=cls;list.appendChild(li);}
    if(owner!==GUEST&&namesReady){for(const name of names)row(name);}
    else if(counts.a>0)row(counts.a+(counts.a===1?' signed-in player':' signed-in players'));
    if(counts.g>0)row(boringLabel(counts.g),'online-guests');
  }
  function notify(mode){
    if(!endpoint||!sid||!lastCredentials)return;
    const body=JSON.stringify({...lastCredentials,sid,mode});
    void fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,cache:'no-store'}).catch(()=>{});
  }
  function cancel(){
    clearTimeout(retry);retry=0;
    const old=controller;controller=null;old?.abort();
  }
  function stop(){
    cancel();notify('leave');
    sid='';cursor='';lastCredentials=null;pollFail=0;pollMode=false;
    ready=false;counts=null;names=[];namesReady=false;
  }
  function showPreference(value){
    visible=value;setting.checked=value===true;setting.disabled=!eligible||saving||value===null;
    privacy.firstChild.textContent=value===false?'Your online status is hidden. You can turn it back on in ':
      owner===GUEST?'You are counted anonymously. You can turn it off in ':
      'Your online status is visible to other participating players. You can turn it off in ';
    if(value===null)stop();
    render();
  }
  async function credentials(id,v){
    if(visible===false)return {t:'observer',id:observerId||(observerId=crypto.randomUUID())};
    if(id===GUEST)return {t:'guest',id:guestId()};
    const s=await freshSession();
    if(!current(id,v)||s?.user?.id!==id||!s.access_token)throw Error('Session unavailable');
    return {t:'auth',jwt:s.access_token};
  }
  function accept(m,id,v){
    if(!current(id,v))return;
    if(m?.t==='off'){stop();showPreference(false);note.textContent='Online status is off.';void connect(id,v);return;}
    if(m?.t==='renew'||m?.t==='idle')return;
    if(m?.t!=='ok'||!Number.isInteger(m.a)||!Number.isInteger(m.g)||m.a<0||m.g<0||m.a+m.g>1000||typeof m.cursor!=='string')throw Error('Invalid presence frame');
    cursor=m.cursor;pollFail=0;
    if(m.record)showRecordToast(m.record);
    if(visible===false)return;
    counts={a:m.a,g:m.g};ready=true;
    if(id!==GUEST&&typeof m.mention==='string')window.dispatchEvent(new CustomEvent('bored:chat-mention',{detail:{account:id,mention:m.mention}}));
    if(id!==GUEST&&Array.isArray(m.n)){if(details.open){names=m.n.filter(n=>typeof n==='string'&&n.length<=160);namesReady=true;}if(chatOpen)window.dispatchEvent(new CustomEvent('bored:chat-roster',{detail:{account:id,names:m.n}}));}
    render();
  }
  async function connect(id,v){
    if(!current(id,v)||!eligible||!endpoint||visible===null||paused||controller)return;
    if(!sid)sid=crypto.randomUUID();
    const ctl=new AbortController();controller=ctl;
    const alive=()=>controller===ctl&&current(id,v)&&visible!==null&&!paused;
    let timeout=0,valid=false,renew=false,failed=false;
    const arm=ms=>{clearTimeout(timeout);timeout=setTimeout(()=>ctl.abort(),ms);};
    try{
      const auth=await credentials(id,v);
      if(!alive())return;
      lastCredentials=auth;
      arm(pollMode?POLL_TIMEOUT:CONNECT_TIMEOUT);
      const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...auth,sid,mode:pollMode?'poll':'sse',watch:visible===true&&id!==GUEST&&(details.open||chatOpen),cursor}),cache:'no-store',signal:ctl.signal});
      if(!alive())return;
      if(!res.ok)throw Error('Presence unavailable');
      if(pollMode){
        const m=await res.json();if(!alive())return;accept(m,id,v);valid=true;pollFail=0;
      }else{
        // Authenticated fetch streaming keeps JWTs out of URLs and works without EventSource headers.
        if(!res.headers.get('content-type')?.includes('text/event-stream')||!res.body)throw Error('Streaming unavailable');
        const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(alive()){
          const {value,done}=await reader.read();
          if(done)break;
          if(!alive())break;
          buffer+=decoder.decode(value,{stream:true});
          if(buffer.length>262144)throw Error('Oversized stream frame');
          let i;
          while((i=buffer.indexOf('\n\n'))>=0){
            const frame=buffer.slice(0,i);buffer=buffer.slice(i+2);
            if(frame.startsWith(':')){if(valid)arm(STREAM_IDLE);continue;}
            if(!frame.startsWith('data: '))continue;
            const m=JSON.parse(frame.slice(6));
            if(m?.t==='renew'){renew=true;break;}
            accept(m,id,v);valid=true;arm(STREAM_IDLE);
          }
          if(renew)break;
        }
        if(!renew&&alive())throw Error('Stream closed');
      }
    }catch{
      if(alive()){failed=true;pollFail++;if(!pollMode)pollMode=true;if(pollFail>=3){ready=false;counts=null;names=[];namesReady=false;cursor='';}render();}
    }finally{
      clearTimeout(timeout);
      if(controller===ctl){
        controller=null;ctl.abort();
        if(current(id,v)&&visible!==null&&!paused){
          const wait=failed?(pollFail===1?250:Math.min(1000*2**Math.min(pollFail,6),60000)):0;
          retry=setTimeout(()=>{retry=0;void connect(id,v);},wait+Math.random()*Math.min(wait*.3,1000));
        }
      }
    }
  }
  function reconnect(){
    if(visible===null||paused||!owner)return;
    cancel();cursor='';void connect(owner,epoch);
  }
  async function refreshPreference(){
    if(!owner||!eligible||suspended||saving||reading||paused)return;
    const id=owner,v=epoch;
    if(id===GUEST){
      const value=guestVisible();showPreference(value);
      note.textContent=value?'Guests are counted anonymously on this browser.':'Online status is off on this browser.';
      void connect(id,v);return;
    }
    reading=true;
    try{
      const p=await account(id);
      if(!current(id,v)||saving)return;
      showPreference(p.visible);note.textContent=p.visible?'':'Online status is off.';
      void connect(id,v);
    }catch{
      if(current(id,v)&&!saving){showPreference(null);note.textContent='Could not load online status.';}
    }finally{if(current(id,v))reading=false;}
  }
  function identityChanged(){
    const id=viewer();
    if(id===owner&&!suspended)return;
    epoch++;stop();owner=id;visible=null;paused=saving=reading=false;
    details.hidden=!eligible;details.open=false;
    setting.checked=false;setting.disabled=true;
    note.textContent=eligible?'Loading online status…':'Online status is available on the live site.';
    if(eligible&&!suspended)void refreshPreference();
  }
  setting.addEventListener('change',async()=>{
    if(!owner||!eligible||saving||visible===null)return;
    const id=owner,desired=setting.checked,before=visible;
    if(id===GUEST){
      try{localStorage.setItem(PREF,desired?'on':'off');ephemeralPref=null;}catch{ephemeralPref=desired;}
      epoch++;stop();paused=false;void refreshPreference();return;
    }
    epoch++;const v=epoch;
    saving=true;reading=false;paused=false;
    // Stop publishing immediately and invalidate verified sessions after saving.
    const hideCredentials=lastCredentials,hideSid=sid;
    stop();showPreference(desired);note.textContent='Saving…';
    try{
      const p=await account(id,'set',{visible:desired});
      if(!current(id,v))return;
      if(p.visible!==desired)throw Error('Not saved');
      saving=false;showPreference(desired);note.textContent=desired?'Online status is on.':'Online status is off.';
      if(desired)void connect(id,v);
      else{
        void connect(id,v);
        // Persist privacy first, then invalidate all active server sessions for this account.
        const auth=hideCredentials?.t==='auth'?hideCredentials:await freshSession().then(s=>s?.access_token?{t:'auth',jwt:s.access_token}:null).catch(()=>null);
        if(!auth)return;
        if(current(id,v))void fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...auth,sid:hideSid||crypto.randomUUID(),mode:'hide'}),keepalive:true,cache:'no-store'}).catch(()=>{});
      }
    }catch{
      if(!current(id,v))return;
      saving=false;paused=true;visible=before;setting.checked=before;setting.disabled=false;
      note.textContent='Could not save. Presence paused here; try again.';render();
    }
  });
  window.addEventListener('bored:chat-open',e=>{const next=e.detail===true;if(next===chatOpen)return;chatOpen=next;if(owner!==GUEST&&!details.open)reconnect();});
  details.addEventListener('toggle',()=>{
    names=[];namesReady=false;
    if(owner!==GUEST)reconnect();
    render();
  });
  link.addEventListener('click',()=>{details.open=false;});
  document.addEventListener('pointerdown',e=>{if(details.open&&!details.contains(e.target))details.open=false;});
  details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus();}});
  window.addEventListener('bored:identity',()=>{
    if(viewer()!==owner){identityChanged();return;}
    // Reconnect after a same-account identity change.
    if(ready&&owner!==GUEST&&visible===true)reconnect();
    else if(visible===null)void refreshPreference();
  });
  window.addEventListener('storage',e=>{
    if(owner===GUEST&&(e.key===PREF||e.key===KEY||e.key===null)){epoch++;stop();void refreshPreference();}
  });
  window.addEventListener('online',()=>{
    if(visible===null)void refreshPreference();
    else if(visible!==null)reconnect();
  });
  window.addEventListener('pagehide',()=>{suspended=true;epoch++;stop();owner=null;});
  window.addEventListener('pageshow',e=>{if(e.persisted){suspended=false;identityChanged();}});
  identityChanged();
}
if(typeof document!=='undefined')mountRenderPresence();
