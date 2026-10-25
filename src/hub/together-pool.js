import { POOL, BALL_COLORS, applyPoolShot, initialPoolState, defaultCuePlacement, validCuePlacement } from '../games/pool-engine.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function drawPoolTable(canvas,balls,{aim=null,placement=null}={}){
 const ctx=canvas.getContext('2d'),portrait=canvas.height>canvas.width,scale=canvas.width/(portrait?130:240);
 if(portrait)ctx.setTransform(0,-scale,scale,0,10*scale,230*scale);else ctx.setTransform(scale,0,0,scale,10*scale,10*scale);
 ctx.fillStyle='#253b30';ctx.fillRect(-10,-10,240,130);ctx.fillStyle='#52765f';ctx.fillRect(0,0,220,110);
 ctx.strokeStyle='#bbc8ad';ctx.lineWidth=.5;ctx.strokeRect(0,0,220,110);
 for(const [x,y] of [[0,0],[220,0],[0,110],[220,110],[110,-1.1],[110,111.1]]){ctx.beginPath();ctx.arc(x,y,5.6,0,Math.PI*2);ctx.fillStyle='#17271f';ctx.fill();}
 const cue=placement||balls.find(b=>b.id===0);
 if(cue&&aim!==null){ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(cue.x+Math.cos(aim)*50,cue.y+Math.sin(aim)*50);ctx.setLineDash([2,2]);ctx.lineWidth=.5;ctx.strokeStyle='#f5f2ea';ctx.stroke();ctx.setLineDash([]);}
 for(const b of balls){if(b.id===0&&placement)continue;drawBall(b);}
 if(placement)drawBall({id:0,...placement});
 function drawBall(b){
  const r=POOL.radius;ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);ctx.fillStyle=BALL_COLORS[b.id];ctx.fill();
  if(b.id>8){ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);ctx.clip();ctx.fillStyle='#f5f2ea';ctx.fillRect(b.x-r,b.y-r,r*2,r*.55);ctx.fillRect(b.x-r,b.y+r*.45,r*2,r*.55);ctx.restore();}
  if(b.id){ctx.beginPath();ctx.arc(b.x,b.y,1.6,0,Math.PI*2);ctx.fillStyle='#f5f2ea';ctx.fill();ctx.fillStyle='#191713';ctx.font='2.3px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.id),b.x,b.y+.1);}
 }
}
export function poolPreview(state){const c=el('canvas',undefined,'bt-mini-pool');c.width=240;c.height=130;c.setAttribute('aria-hidden','true');drawPoolTable(c,state.balls);return c;}
export function animatePoolShot(canvas,frames){
 return new Promise(resolve=>{
  const start=performance.now(),duration=Math.min(3600,Math.max(650,frames.length/30*1000));
  let frame=0,timer=0,done=false;
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);resolve();};
  const visibility=()=>{if(document.hidden)finish();};
  const tick=now=>{
   cancelAnimationFrame(frame);clearTimeout(timer);
   if(done)return;if(!canvas.isConnected||document.hidden){finish();return;}
   const progress=Math.max(0,Math.min(1,(now-start)/duration));
   const balls=frames[Math.min(frames.length-1,Math.floor(progress*frames.length))];
   try{if(!balls){finish();return;}drawPoolTable(canvas,balls);}catch{finish();return;}
   if(progress>=1){finish();return;}
   frame=requestAnimationFrame(tick);
   // Background frames and embedded pages can suspend RAF even while a request
   // has already committed. A timer guarantees the move never waits on painting.
   timer=setTimeout(()=>tick(performance.now()),100);
  };
  document.addEventListener('visibilitychange',visibility);tick(start);
 });
}
export function renderPoolGame(host,{match,owner,review,submit,replay}){
 const moves=match.moves||[],index=review??moves.length;
 const state=review===null||index===moves.length?match.state:index===0?initialPoolState():moves[index-1].state_after;
 if(!state?.balls){host.append(el('p','This shot replay is unavailable.'));return;}
 const canPlay=match.status==='active'&&match.turn_user===owner&&(review===null||index===moves.length);
 const canvas=el('canvas',undefined,'bt-pool-table');canvas.width=960;canvas.height=520;canvas.tabIndex=0;
 canvas.setAttribute('role','img');canvas.setAttribute('aria-label','8-ball pool table. Select an aim angle and power below, or tap the table to aim.');
 let angle=0,power=65,placement=state.ballInHand?defaultCuePlacement(state.balls):null,placing=!!placement;
 const paint=()=>drawPoolTable(canvas,state.balls,{aim:canPlay?angle*Math.PI/1800:null,placement:canPlay?placement:null});
 const fit=()=>{const portrait=matchMedia('(max-width:600px)').matches;canvas.width=portrait?520:960;canvas.height=portrait?960:520;paint();};
 host.append(canvas);fit();
 if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(!canvas.isConnected){observer.disconnect();return;}const portrait=matchMedia('(max-width:600px)').matches;if((canvas.height>canvas.width)!==portrait)fit();});observer.observe(canvas);}
 const group=state.groups[match.p1===owner?0:1];
 const score=el('div',undefined,'bt-pool-score');
 for(const [seat,handle] of [[1,match.p1_handle],[2,match.p2_handle]]){
  const g=state.groups[seat-1],left=state.balls.filter(b=>g&&((g==='solid'&&b.id>0&&b.id<8)||(g==='stripe'&&b.id>8))).length;
  score.append(el('span',handle+' · '+(g?(g==='solid'?'Solids':'Stripes')+' · '+left+' left':'Open table')));
 }host.append(score);
 if(state.lastShot){const shot=state.lastShot;host.append(el('p',(shot.foul?'Foul · ':'')+(shot.reason||'')+(shot.potted.length?' · Potted '+shot.potted.map(id=>id===0?'cue':id).join(', '):''),'bt-caption'));}
 if(index>0){const previous=index===1?initialPoolState():moves[index-2].state_after,shot=moves[index-1];
  if(previous&&shot){const b=el('button','Replay shot','action');b.type='button';b.onclick=()=>replay(async()=>{const result=applyPoolShot(previous,shot.move,shot.actor===match.p1?1:2,{trace:true});await animatePoolShot(canvas,result.frames);paint();});host.append(b);}
 }
 if(!canPlay){host.append(el('p',review!==null&&index<moves.length?'Reviewing shot '+index+'. Move the review slider to the latest shot to continue.':'The table is saved. Come back when it is your turn.','bt-caption'));return;}
 const controls=el('div',undefined,'bt-pool-controls'),note=el('p',undefined,'bt-caption');
 const angleLabel=el('label','Aim (degrees)'),angleInput=el('input');angleInput.type='number';angleInput.min='0';angleInput.max='359.9';angleInput.step='0.1';angleInput.value='0';angleInput.required=true;angleInput.id='bt-pool-angle';angleLabel.htmlFor=angleInput.id;angleLabel.append(angleInput);
 const powerLabel=el('label','Power · 65%'),powerInput=el('input');powerInput.type='range';powerInput.min='1';powerInput.max='100';powerInput.value='65';powerInput.id='bt-pool-power';powerLabel.htmlFor=powerInput.id;powerLabel.append(powerInput);
 angleInput.oninput=()=>{const value=Number(angleInput.value);if(Number.isFinite(value)&&value>=0&&value<=359.9){angle=Math.round(value*10);paint();}};
 powerInput.oninput=()=>{power=Number(powerInput.value);powerLabel.firstChild.textContent='Power · '+power+'%';};
 const place=el('button','Place cue ball','action');place.type='button';place.hidden=!state.ballInHand;
 const updateNote=()=>{place.setAttribute('aria-pressed',String(placing));note.textContent=placing?'Ball in hand: tap clear felt to place the cue ball, then choose Aim shot.':(placement?'Cue ball placed. ':'')+'Tap the table to aim, or enter an angle. '+(group?'Clear your '+(group==='solid'?'solids':'stripes')+', then the 8.':'Pot a ball to claim solids or stripes.');};
 const aim=el('button','Aim shot','action');aim.type='button';aim.hidden=!state.ballInHand;
 place.onclick=()=>{placing=true;updateNote();};aim.onclick=()=>{placing=false;updateNote();};
 canvas.onpointerdown=event=>{
  const rect=canvas.getBoundingClientRect(),portrait=canvas.height>canvas.width;
  const x=portrait?230-(event.clientY-rect.top)/rect.height*240:(event.clientX-rect.left)/rect.width*240-10;
  const y=portrait?(event.clientX-rect.left)/rect.width*130-10:(event.clientY-rect.top)/rect.height*130-10;
  if(placing){if(validCuePlacement(state.balls,x,y)){placement={x,y};note.textContent='Cue ball placed. Choose Aim shot or set an angle.';paint();}else note.textContent='Choose clear felt away from pockets, cushions and other balls.';}
  else{const cue=placement||state.balls.find(b=>b.id===0);if(cue){angle=Math.round((Math.atan2(y-cue.y,x-cue.x)*1800/Math.PI+3600)%3600);if(angle===3600)angle=0;angleInput.value=String(angle/10);paint();}}
 };
 const shoot=el('button','Shoot','action bt-primary');shoot.type='button';shoot.id='bt-pool-shoot';
 shoot.onclick=()=>{if(angleInput.reportValidity())submit({angle,power,...(placement?{cue:placement}:{})},canvas);};
 controls.append(angleLabel,powerLabel,place,aim,shoot);host.append(controls,note);updateNote();
}
