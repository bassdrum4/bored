// Version 1 asynchronous 8-ball. Physics derived from 8ball.html's zero-spin
// CPU simulator: same table, rack, friction, cushions, collision and pocket model.
// Pure and deterministic; shared by server validation, shot animation and tests.
export const POOL = Object.freeze({ width:220, height:110, radius:3.05, step:1/300, maxPower:780, stopSpeed:9 });
export const BALL_COLORS = ['#f6f2ea','#e7b53c','#3268b0','#b74032','#74518c','#ce752d','#387f53','#803b37','#191b20','#e7b53c','#3268b0','#b74032','#74518c','#ce752d','#387f53','#803b37'];
const {width:PW,height:PH,radius:R,step:DT,maxPower:MAXPOWER,stopSpeed:STOPV}=POOL;
const pockets=[{x:0,y:0,r:5.6},{x:PW,y:0,r:5.6},{x:0,y:PH,r:5.6},{x:PW,y:PH,r:5.6},{x:PW/2,y:-1.1,r:5.1},{x:PW/2,y:PH+1.1,r:5.1}];
export const poolGroup=id=>id===0?'cue':id===8?'eight':id<8?'solid':'stripe';
export function initialPoolState(){
 const balls=[{id:0,x:PW*.24,y:PH/2}];
 const rows=[[1],[2,15],[9,8,3],[11,4,12,5],[10,13,6,14,7]];
 rows.forEach((row,ri)=>row.forEach((id,ci)=>balls.push({id,x:PW*.72+ri*R*1.74,y:PH/2+(ci-(row.length-1)/2)*R*2.02})));
 return {balls,groups:[null,null],breakShot:true,ballInHand:false,shotCount:0,lastShot:null};
}
export function normalizePoolMove(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['angle','power','cue'].includes(k)))throw new Error('Send only aim, power and optional cue placement.');
 if(!Number.isInteger(input.angle)||input.angle<0||input.angle>3599)throw new Error('Aim must be between 0 and 359.9 degrees.');
 if(!Number.isInteger(input.power)||input.power<1||input.power>100)throw new Error('Power must be between 1 and 100.');
 const move={angle:input.angle,power:input.power};
 if(input.cue!==undefined){
  const c=input.cue;
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='x,y'||!Number.isFinite(c.x)||!Number.isFinite(c.y)||Math.abs(c.x)>PW||Math.abs(c.y)>PH)throw new Error('Invalid cue-ball placement.');
  move.cue={x:Math.round(c.x*1000)/1000,y:Math.round(c.y*1000)/1000};
 }
 return move;
}
export function validCuePlacement(balls,x,y){
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=R+.4&&x<=PW-R-.4&&y>=R+.4&&y<=PH-R-.4&&
  balls.every(b=>b.id===0||Math.hypot(b.x-x,b.y-y)>=R*2.05);
}
export function defaultCuePlacement(balls){
 for(let x=PW*.25;x<PW-R;x+=R*2.1)for(let y=PH/2,offset=0;offset<PH/2;offset+=R*2.1){
  for(const yy of [y+offset,y-offset])if(validCuePlacement(balls,x,yy))return {x,y:yy};
 }
 throw new Error('No cue-ball placement available.');
}
function stepBall(b,potted){
 b.x+=b.vx*DT;b.y+=b.vy*DT;
 const speed=Math.hypot(b.vx,b.vy);
 if(speed>0){const ns=speed*Math.max(0,1-DT);b.vx*=ns/speed;b.vy*=ns/speed;}
 const pot=()=>{b.alive=false;b.vx=b.vy=0;potted.push(b.id);};
 if(pockets.some(p=>Math.hypot(b.x-p.x,b.y-p.y)<p.r*.94)){pot();return;}
 const gapX=b.x<4.7||b.x>PW-4.7||Math.abs(b.x-PW/2)<3.9;
 const gapY=b.y<4.7||b.y>PH-4.7;
 if(b.y<R){if(b.y<=-.5&&gapX){pot();return;}if(!gapX){b.y=R;if(b.vy<0){b.vy=-b.vy*.72;b.vx*=.96;}}}
 if(b.y>PH-R){if(b.y>=PH+.5&&gapX){pot();return;}if(!gapX){b.y=PH-R;if(b.vy>0){b.vy=-b.vy*.72;b.vx*=.96;}}}
 if(b.x<R){if(b.x<=-.5&&gapY){pot();return;}if(!gapY){b.x=R;if(b.vx<0){b.vx=-b.vx*.72;b.vy*=.96;}}}
 if(b.x>PW-R){if(b.x>=PW+.5&&gapY){pot();return;}if(!gapY){b.x=PW-R;if(b.vx>0){b.vx=-b.vx*.72;b.vy*=.96;}}}
}
export function simulatePoolShot(layout,angle,power,{trace=false}={}){
 const bs=layout.map(b=>({id:b.id,x:b.x,y:b.y,vx:0,vy:0,alive:true}));
 const cue=bs.find(b=>b.id===0);if(!cue)throw new Error('Place the cue ball first.');
 cue.vx=Math.cos(angle)*MAXPOWER*power;cue.vy=Math.sin(angle)*MAXPOWER*power;
 const potted=[],frames=[];let firstHit=null;
 const capture=()=>frames.push(bs.filter(b=>b.alive).map(b=>({id:b.id,x:b.x,y:b.y})));
 if(trace)capture();
 for(let n=0;n<2600;n++){
  let moving=false;
  for(const b of bs){if(!b.alive)continue;stepBall(b,potted);if(Math.hypot(b.vx,b.vy)>STOPV)moving=true;}
  for(let i=0;i<bs.length;i++){
   const a=bs[i];if(!a.alive)continue;
   for(let j=i+1;j<bs.length;j++){
    const b=bs[j];if(!b.alive)continue;
    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=R*2)continue;
    if(d<.0001){dx=1;dy=0;d=1;}
    const nx=dx/d,ny=dy/d,overlap=R*2-d;
    a.x-=nx*overlap/2;a.y-=ny*overlap/2;b.x+=nx*overlap/2;b.y+=ny*overlap/2;
    const rel=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
    if(rel>0){const imp=rel*(1+.94)/2;a.vx-=nx*imp;a.vy-=ny*imp;b.vx+=nx*imp;b.vy+=ny*imp;if(firstHit===null&&(a.id===0||b.id===0))firstHit=a.id===0?b.id:a.id;}
   }
  }
  if(trace&&n%10===0)capture();
  if(!moving)break;
 }
 const after=bs.filter(b=>b.alive).map(b=>({id:b.id,x:b.x,y:b.y}));
 if(trace)capture();
 return {potted,firstHit,after,frames};
}
export function applyPoolShot(state,input,seat,{trace=false}={}){
 if(![1,2].includes(seat))throw new Error('Invalid player.');
 const move=normalizePoolMove(input), balls=state.balls.map(b=>({...b}));
 if(state.ballInHand){
  if(!move.cue||!validCuePlacement(balls,move.cue.x,move.cue.y))throw new Error('Place the cue ball on clear felt, away from other balls.');
  const cue=balls.find(b=>b.id===0);if(cue)Object.assign(cue,move.cue);else balls.unshift({id:0,...move.cue});
 }else if(move.cue)throw new Error('You can place the cue ball only after a foul.');
 const shot=simulatePoolShot(balls,move.angle*Math.PI/1800,move.power/100,{trace});
 const own=state.groups[seat-1], scratch=shot.potted.includes(0), pot8=shot.potted.includes(8);
 const ownBefore=balls.filter(b=>b.id!==0&&b.id!==8&&(!own||poolGroup(b.id)===own)).length;
 let foul=scratch,reason=scratch?'Scratch':'';
 if(shot.firstHit===null){foul=true;reason='No ball contacted';}
 else if(!own&&shot.firstHit===8){foul=true;reason='Hit the 8 first';}
 else if(own&&((shot.firstHit===8&&ownBefore>0)||(shot.firstHit!==8&&poolGroup(shot.firstHit)!==own))){foul=true;reason='Wrong ball first';}
 const summary={potted:shot.potted,firstHit:shot.firstHit,foul,reason};
 if(pot8&&state.breakShot){const reset=initialPoolState();reset.shotCount=state.shotCount+1;reset.lastShot={...summary,reason:'8 on the break — re-racked'};return {state:reset,nextSeat:seat,winner:null,reason:reset.lastShot.reason,frames:shot.frames};}
 const next={balls:shot.after,groups:[...state.groups],breakShot:false,ballInHand:foul,shotCount:state.shotCount+1,lastShot:summary};
 const objPots=shot.potted.filter(id=>id!==0&&id!==8);
 if(pot8){
  const remaining=next.balls.filter(b=>b.id!==0&&b.id!==8&&poolGroup(b.id)===own).length;
  const won=!!own&&remaining===0&&!foul;
  return {state:next,nextSeat:won?seat:3-seat,winner:won?seat:3-seat,reason:won?'8 ball cleared':'8 ball potted early or with a foul',frames:shot.frames};
 }
 if(!own&&!foul&&objPots.length){const group=poolGroup(objPots[0]);next.groups[seat-1]=group;next.groups[2-seat]=group==='solid'?'stripe':'solid';}
 if(foul)next.balls=next.balls.filter(b=>b.id!==0);
 const keep=!foul&&objPots.some(id=>poolGroup(id)===next.groups[seat-1]);
 return {state:next,nextSeat:keep?seat:3-seat,winner:null,reason:foul?reason:keep?'Ball potted — shoot again':'Opponent to shoot',frames:shot.frames};
}
