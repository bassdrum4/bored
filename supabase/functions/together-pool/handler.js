import { applyPoolShot, normalizePoolMove } from '../../../src/games/pool-engine.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function readBody(req){
 const reader=req.body?.getReader();if(!reader)throw new Error('A shot is required.');
 let text='',bytes=0;const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096)throw new Error('Request too large.');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel();}
}
export function createPoolHandler({authorize,readMatch,commitShot}){
 return async req=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({message:'Use POST.'},405);
  try{
   const auth=req.headers.get('Authorization');if(!/^Bearer \S+$/.test(auth||''))return reply({message:'Sign in first.'},401);
   const user=await authorize(auth);if(!user?.id||user.is_anonymous)return reply({message:'Sign in first.'},401);
   const body=await readBody(req);
   if(!body||Object.keys(body).some(k=>!['match_id','version','request_id','move'].includes(k))||!uuid(body.match_id)||!uuid(body.request_id)||!Number.isInteger(body.version)||body.version<0)throw new Error('Invalid shot request.');
   body.match_id=body.match_id.toLowerCase();body.request_id=body.request_id.toLowerCase();
   const move=normalizePoolMove(body.move),match=await readMatch(auth,body.match_id);
   if(match.game!=='8ball'||match.rules_version!==1||![match.p1,match.p2].includes(user.id))return reply({message:'Match unavailable.'},403);
   const previous=match.moves?.find(m=>m.request_id===body.request_id);
   if(previous){
    if(previous.actor!==user.id||JSON.stringify(normalizePoolMove(previous.move))!==JSON.stringify(move))return reply({message:'Move ID already used.'},409);
    return reply(match);
   }
   if(match.status!=='active'||match.turn_user!==user.id)return reply({message:'It is not your turn.'},409);
   if(match.version!==body.version)return reply({message:'The table changed. Refresh and try again.'},409);
   const transition=applyPoolShot(match.state,move,match.p1===user.id?1:2);
   return reply(await commitShot({actor:user.id,match_id:match.id,expected_version:body.version,request_id:body.request_id,move,state:transition.state,next_seat:transition.nextSeat,winner_seat:transition.winner,reason:transition.reason}));
  }catch(error){
   const status=error.status||(/changed|turn|already used/.test(error.message)?409:422);
   return reply({message:status>=500?'Pool is temporarily unavailable. Please try again.':error.message},status);
  }
 };
}
