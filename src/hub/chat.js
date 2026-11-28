import {PRESENCE_ORIGIN} from './presence-endpoint.js';
import {freshSession,hasIdentity,getSession} from './backend.js';
const origin=(()=>{try{const u=new URL(PRESENCE_ORIGIN);return u.protocol==='https:'&&u.hostname.endsWith('.onrender.com')&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:'';}catch{return '';}})();
const $=id=>document.getElementById(id);
const button=$('bored-chat-toggle'),panel=$('bored-chat'),close=$('bored-chat-close'),list=$('bored-chat-list'),form=$('bored-chat-form'),input=$('bored-chat-input'),send=$('bored-chat-send'),status=$('bored-chat-status'),replyBar=$('bored-chat-reply'),adminBar=$('bored-chat-admin');
if(button&&panel&&origin&&location.hostname==='bassdrum4.github.io'&&/^\/bored(?:\/|$)/.test(location.pathname))mount();
function mount(){
  let opened=false,controller=null,cursor='',mode='sse',messages=new Map(),retry=null,failures=0,admin=false,enabled=false,replyTo=null,posting=false,generation=0;
  let mentionAccount=null,latestMention='',seenMention='';
  function paintMention(unread){button.classList.toggle('has-mention',unread);button.setAttribute('aria-label',unread?'Chat, unread mention':'Chat');}
  function syncMentionAccount(){
    const id=hasIdentity()?getSession()?.user?.id:null;
    if(id===mentionAccount)return;
    mentionAccount=id;latestMention='';seenMention='';
    try{if(id)seenMention=localStorage.getItem('bored.chat.mention.seen.'+id)||'';}catch{}
    paintMention(false);
  }
  function clearMention(){
    if(!mentionAccount||!latestMention)return;
    seenMention=latestMention;
    try{localStorage.setItem('bored.chat.mention.seen.'+mentionAccount,seenMention);}catch{}
    paintMention(false);
  }
  syncMentionAccount();
  window.addEventListener('bored:chat-mention',e=>{
    syncMentionAccount();
    if(!mentionAccount||e.detail?.account!==mentionAccount||typeof e.detail.mention!=='string')return;
    latestMention=e.detail.mention;
    if(opened)clearMention();else paintMention(latestMention!==seenMention);
  });
  window.addEventListener('storage',e=>{
    if(mentionAccount&&e.key==='bored.chat.mention.seen.'+mentionAccount){seenMention=e.newValue||'';paintMention(Boolean(latestMention&&latestMention!==seenMention));}
  });
  let roster=[],choices=[],selected=0,activeMention=null;
  const suggestions=document.createElement('div');
  suggestions.id='bored-chat-mentions';suggestions.className='bored-chat-mentions';suggestions.hidden=true;suggestions.setAttribute('role','listbox');suggestions.setAttribute('aria-label','Mention players');form.append(suggestions);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',suggestions.id);input.setAttribute('aria-expanded','false');
  const normalize=s=>s.normalize('NFKC').toLowerCase();
  function hideSuggestions(){suggestions.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');choices=[];activeMention=null;}
  function paintSuggestions(){
    suggestions.replaceChildren();
    choices.forEach((name,i)=>{
      const option=document.createElement('div');option.id='bored-chat-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected',String(i===selected));option.textContent='@'+name;
      option.addEventListener('pointerdown',e=>e.preventDefault());option.addEventListener('click',()=>chooseMention(i));suggestions.append(option);
    });
    suggestions.hidden=!choices.length;input.setAttribute('aria-expanded',String(!!choices.length));
    if(choices.length){input.setAttribute('aria-activedescendant','bored-chat-option-'+selected);suggestions.children[selected]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function refreshSuggestions(){
    if(input.disabled||document.activeElement!==input){hideSuggestions();return;}
    const end=input.selectionStart??input.value.length,before=input.value.slice(0,end),at=before.lastIndexOf('@');
    if(at<0||/[\p{L}\p{N}_@]/u.test(before.slice(0,at).slice(-1))||/[\n,;!?]/.test(before.slice(at+1))){hideSuggestions();return;}
    const q=normalize(before.slice(at+1));
    choices=[...new Set(roster)].filter(n=>normalize(n).includes(q)).sort((a,b)=>Number(!normalize(a).startsWith(q))-Number(!normalize(b).startsWith(q))||a.localeCompare(b));
    activeMention={at,end};selected=0;paintSuggestions();
  }
  function chooseMention(i){
    if(!activeMention||!choices[i])return;
    const {at,end}=activeMention;
    const replacement='@'+choices[i]+' ';
    if(input.value.length-(end-at)+replacement.length>input.maxLength){hideSuggestions();return;}
    input.setRangeText(replacement,at,end,'end');hideSuggestions();input.focus();
  }
  function setRoster(names){roster=Array.isArray(names)?names.filter(n=>typeof n==='string'&&n.length>0&&n.length<=160):[];if(!suggestions.hidden||document.activeElement===input)refreshSuggestions();}
  window.addEventListener('bored:chat-roster',e=>{if(opened&&e.detail?.account===mentionAccount)setRoster(e.detail.names);});
  for(const event of ['input','click','keyup'])input.addEventListener(event,e=>{if(event!=='keyup'||!['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key))refreshSuggestions();});
  input.addEventListener('blur',()=>hideSuggestions());
  input.addEventListener('keydown',e=>{
    if(suggestions.hidden)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selected=(selected+choices.length+(e.key==='ArrowDown'?1:-1))%choices.length;paintSuggestions();}
    else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();chooseMention(selected);}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hideSuggestions();}
  });
  function renderMessageText(body,text){
    const names=[...new Set([...roster,...Array.from(messages.values(),m=>m.handle)])].sort((a,b)=>b.length-a.length);
    let start=0;
    for(let i=0;i<text.length;i++){
      if(text[i]!=='@'||/[\p{L}\p{N}_@]/u.test(text.slice(0,i).slice(-1)))continue;
      const rest=text.slice(i+1);
      const name=names.find(n=>normalize(rest.slice(0,n.length))===normalize(n)&&!/[\p{L}\p{N}_]/u.test(rest.slice(n.length,n.length+1)));
      const length=name?.length||rest.match(/^[\p{L}\p{N}_-]+/u)?.[0].length||0;
      if(!length)continue;
      body.append(document.createTextNode(text.slice(start,i)));
      const span=document.createElement('span');span.className='bored-chat-mention';span.textContent=text.slice(i,i+1+length);body.append(span);i+=length;start=i+1;
    }
    body.append(document.createTextNode(text.slice(start)));
  }
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
      const row=document.createElement('article');row.className='bored-chat-message';
      const head=document.createElement('div');head.className='bored-chat-meta';
      const name=document.createElement('strong');name.textContent=m.handle;
      const time=document.createElement('time');time.dateTime=new Date(m.at).toISOString();time.textContent=new Date(m.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      head.append(name,time);
      if(m.reply){const q=document.createElement('small');q.textContent='↳ '+m.reply.handle;row.append(q);}
      const body=document.createElement('p');renderMessageText(body,m.text);
      const menu=document.createElement('details');menu.className='bored-chat-menu';const summary=document.createElement('summary');summary.textContent='···';summary.setAttribute('aria-label','Message options');menu.append(summary);
      if(hasIdentity()){menu.append(action('Reply',()=>{menu.open=false;setReply(m);}),action('Report',()=>{menu.open=false;if(confirm('Report this message to Bored moderators?'))void command({mode:'report',id:m.id},()=>notice('Report submitted.'));}));}
      if(admin){menu.append(action('Delete',()=>void command({mode:'admin',action:'delete',id:m.id})),action('Mute 10 min',()=>void command({mode:'admin',action:'ban',id:m.id,seconds:600})),action('Ban 24h',()=>void command({mode:'admin',action:'ban',id:m.id,seconds:86400})));}
      if(hasIdentity()||admin)head.append(menu);row.append(head,body);frag.append(row);
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
      notice('');
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
      enabled=s.enabled===true;admin=s.admin===true;if(Array.isArray(s.names))setRoster(s.names);renderAdmin();updateForm();
      if(enabled)void connect();else notice('Chat is disabled.');
    }catch(e){if(opened&&g===generation){notice(e.message);renderAdmin();}}
  }
  function setOpen(value){opened=value;panel.hidden=!value;window.dispatchEvent(new CustomEvent('bored:chat-open',{detail:value}));if(!value){hideSuggestions();roster=[];}button.setAttribute('aria-expanded',String(value));if(value){clearMention();mode='sse';failures=0;void restart();}else{generation++;cancel();enabled=false;updateForm();setReply(null);panel.querySelectorAll('.bored-chat-reports').forEach(el=>el.remove());button.focus();}}
  button.hidden=false;button.addEventListener('click',()=>setOpen(!opened));close.addEventListener('click',()=>setOpen(false));
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(posting||!enabled||!hasIdentity())return;
    const text=input.value.trim();if(!text)return;posting=true;updateForm();
    try{const jwt=await token();if(!jwt)throw Error('Sign in first.');await post({mode:'send',jwt,text,reply:replyTo?.id},AbortSignal.timeout(15000));input.value='';hideSuggestions();setReply(null);}
    catch(err){notice(err.message);}finally{posting=false;updateForm();if(opened)input.focus();}
  });
  window.addEventListener('bored:identity',()=>{syncMentionAccount();setRoster([]);hideSuggestions();if(opened){messages.clear();cursor='';setReply(null);void restart();}});
  window.addEventListener('pagehide',()=>{cancel();opened=false;generation++;panel.hidden=true;button.setAttribute('aria-expanded','false');});
}
