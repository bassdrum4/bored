import { PRESENCE_ORIGIN } from './presence-endpoint.js';
import { backendReady, freshSession, getSession, hasIdentity, request } from './backend.js';

const GUEST='guest', PREF='bored.presence.guest.visible', KEY='bored.presence.guest.key';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEARTBEAT=60000, AUTH_RENEW=18*60000;
const POLL=45000, POLL_TIMEOUT=15000;
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
  const eligible=backendReady()&&liveSite()&&typeof WebSocket!=='undefined';
  const endpoint=renderSocketUrl(PRESENCE_ORIGIN), pollUrl=renderPollUrl(PRESENCE_ORIGIN);
  let owner=null,epoch=0,visible=null,ws=null,ready=false,paused=false,suspended=false,saving=false;
  let retry=0,beat=0,renew=0,deadline=0,attempt=0,poll=0,pollFail=0,pollMode=false;
  let counts=null,names=[],namesReady=false,reading=false;
  const current=(id,v)=>!suspended&&owner===id&&epoch===v&&viewer()===id;
  const send=(message)=>{
    if(!ws||ws.readyState!==WebSocket.OPEN)return false;
    try{ws.send(typeof message==='string'?message:JSON.stringify(message));return true;}catch{return false;}
  };
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
  function stop(){
    clearTimeout(retry);clearInterval(beat);clearInterval(renew);clearTimeout(deadline);clearTimeout(poll);
    retry=beat=renew=deadline=poll=0;pollFail=0;pollMode=false;
    const old=ws;ws=null;ready=false;counts=null;names=[];namesReady=false;
    if(old)try{old.close();}catch{}
  }
  function showPreference(value){
    visible=value;setting.checked=value===true;setting.disabled=!eligible||saving||value===null;
    privacy.firstChild.textContent=value===false?'Your online status is hidden. You can turn it back on in ':
      owner===GUEST?'You are counted anonymously. You can turn it off in ':
      'Your online status is visible to other participating players. You can turn it off in ';
    if(value!==true)stop();
    render();
  }
  function schedule(id,v){
    if(!current(id,v)||visible!==true||paused||!endpoint||retry)return;
    const delays=[1500,3000,6000,12000,24000,45000,60000];
    const delay=delays[Math.min(attempt++,delays.length-1)];
    retry=setTimeout(()=>{retry=0;connect(id,v);},delay+Math.random()*delay*.4);
  }
  async function authenticate(socket,id,v){
    if(!current(id,v)||ws!==socket||visible!==true)return;
    if(id===GUEST){send({t:'guest',id:guestId()});return;}
    try{
      const s=await freshSession();
      if(!current(id,v)||ws!==socket||visible!==true)return;
      if(s?.user?.id!==id||!s.access_token)throw Error('Session unavailable');
      send({t:'auth',jwt:s.access_token});
    }catch{if(ws===socket)socket.close();}
  }
  function connect(id,v){
    if(!current(id,v)||!eligible||!endpoint||visible!==true||paused||ws||pollMode)return;
    let socket;try{socket=new WebSocket(endpoint);}catch{startPolling(id,v);return;}
    ws=socket;ready=false;render();
    // Render may need to cold start. Don't hammer it with short connect timeouts.
    deadline=setTimeout(()=>{if(ws===socket)socket.close();},90000);
    socket.onopen=()=>{
      if(ws!==socket||!current(id,v))return;
      clearTimeout(deadline);deadline=setTimeout(()=>{if(ws===socket&&!ready)socket.close();},15000);
      void authenticate(socket,id,v);
      beat=setInterval(()=>send('p'),HEARTBEAT);
      if(id!==GUEST)renew=setInterval(()=>void authenticate(socket,id,v),AUTH_RENEW);
    };
    socket.onmessage=e=>{
      if(ws!==socket||!current(id,v))return;
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m?.t==='off'){
        stop();showPreference(false);note.textContent='Online status is off.';return;
      }
      if(m?.t==='ok'){
        clearTimeout(deadline);ready=true;attempt=0;
        if(details.open&&id!==GUEST)send({t:'watch',on:true});
      }else if(m?.t==='c'&&Number.isInteger(m.a)&&Number.isInteger(m.g)&&m.a>=0&&m.g>=0&&m.a+m.g<=1000){
        counts={a:m.a,g:m.g};
      }else if(m?.t==='n'&&id!==GUEST&&details.open&&Array.isArray(m.n)&&m.n.length<=1000){
        names=m.n.filter(n=>typeof n==='string'&&n.length<=160);namesReady=true;
      }
      render();
    };
    socket.onclose=()=>{
      if(ws!==socket)return;
      const wasReady=ready;
      stop();render();
      // A socket that never opened was probably refused by the network, not the
      // server: poll over HTTPS instead of retrying a handshake that cannot win.
      if(wasReady)schedule(id,v);else startPolling(id,v);
    };
    socket.onerror=()=>{}; // onclose performs the only retry
  }
  // A school or office proxy can refuse the WebSocket upgrade while plain HTTPS
  // still works. The same roster answers POST /presence, so a tab whose handshake
  // never succeeded polls every 45 seconds instead of retrying forever.
  async function pollOnce(id,v){
    if(!current(id,v)||ws||!pollUrl||visible!==true||paused)return false;
    let body;
    try{
      if(id===GUEST)body={t:'guest',id:guestId()};
      else{
        const s=await freshSession();
        if(!current(id,v))return true;
        if(s?.user?.id!==id||!s.access_token)return false;
        body={t:'auth',jwt:s.access_token};
      }
      const res=await fetch(pollUrl,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(POLL_TIMEOUT)});
      if(!res.ok)return false;
      const m=await res.json();
      if(!current(id,v))return true;
      if(m?.t==='off'){stop();showPreference(false);note.textContent='Online status is off.';return true;}
      if(m?.t!=='ok'||!Number.isInteger(m.a)||!Number.isInteger(m.g)||m.a<0||m.g<0||m.a+m.g>1000)return false;
      counts={a:m.a,g:m.g};ready=true;
      if(id!==GUEST&&details.open&&Array.isArray(m.n)){names=m.n.filter(n=>typeof n==='string'&&n.length<=160);namesReady=true;}
      render();return true;
    }catch{return false;}
  }
  function startPolling(id,v){
    if(!current(id,v)||!pollUrl||visible!==true||paused||ws)return;
    pollMode=true;
    if(poll)return;
    const run=async()=>{
      poll=0;
      if(!current(id,v)||ws||visible!==true||paused)return;
      const ok=await pollOnce(id,v);
      if(!current(id,v)||ws||visible!==true||paused)return;
      pollFail=ok?0:pollFail+1;
      if(!ok)render();
      const wait=ok?POLL:Math.min(POLL*2**Math.min(pollFail,3),120000);
      poll=setTimeout(()=>void run(),wait);
    };
    void run();
  }
  async function refreshPreference(){
    if(!owner||!eligible||suspended||saving||reading||paused)return;
    const id=owner,v=epoch;
    if(id===GUEST){
      const value=guestVisible();showPreference(value);
      note.textContent=value?'Guests are counted anonymously on this browser.':'Online status is off on this browser.';
      if(value)connect(id,v);return;
    }
    reading=true;
    try{
      const p=await account(id);
      if(!current(id,v)||saving)return;
      showPreference(p.visible);note.textContent=p.visible?'':'Online status is off.';
      if(p.visible)connect(id,v);
    }catch{
      if(current(id,v)&&!saving){showPreference(null);note.textContent='Could not load online status.';}
    }finally{if(current(id,v))reading=false;}
  }
  function identityChanged(){
    const id=viewer();
    if(id===owner&&!suspended)return;
    epoch++;stop();owner=id;visible=null;paused=saving=reading=false;attempt=0;
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
    // Stop publishing immediately and hide all verified sockets for this account.
    if(!desired)send({t:'hide'});
    stop();showPreference(desired);note.textContent='Saving…';
    try{
      const p=await account(id,'set',{visible:desired});
      if(!current(id,v))return;
      if(p.visible!==desired)throw Error('Not saved');
      saving=false;showPreference(desired);note.textContent=desired?'Online status is on.':'Online status is off.';
      if(desired)connect(id,v);
    }catch{
      if(!current(id,v))return;
      saving=false;paused=true;visible=before;setting.checked=before;setting.disabled=false;
      note.textContent='Could not save. Presence paused here; try again.';render();
    }
  });
  details.addEventListener('toggle',()=>{
    names=[];namesReady=false;
    if(ready&&owner!==GUEST)send({t:'watch',on:details.open});
    if(owner!==GUEST&&pollMode)void pollOnce(owner,epoch);
    render();
  });
  link.addEventListener('click',()=>{details.open=false;});
  document.addEventListener('pointerdown',e=>{if(details.open&&!details.contains(e.target))details.open=false;});
  details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus();}});
  window.addEventListener('bored:identity',()=>{
    if(viewer()!==owner){identityChanged();return;}
    // A successful rename/account UI update can refresh the verified name.
    if(ready&&owner!==GUEST&&visible===true&&ws)void authenticate(ws,owner,epoch);
    else if(visible===null)void refreshPreference();
  });
  window.addEventListener('storage',e=>{
    if(owner===GUEST&&(e.key===PREF||e.key===KEY||e.key===null)){epoch++;stop();void refreshPreference();}
  });
  window.addEventListener('online',()=>{
    if(visible===null)void refreshPreference();
    else if(!ws&&!pollMode&&visible===true){clearTimeout(retry);retry=0;connect(owner,epoch);}
  });
  window.addEventListener('pagehide',()=>{suspended=true;epoch++;stop();owner=null;});
  window.addEventListener('pageshow',e=>{if(e.persisted){suspended=false;identityChanged();}});
  identityChanged();
}
if(typeof document!=='undefined')mountRenderPresence();
