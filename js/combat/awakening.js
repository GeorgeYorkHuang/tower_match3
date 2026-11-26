'use strict';
const R=require('../talents/runtime.js');
const FORGE_TYPES=['burn','paralysis','armorBreak'];
function fuel(e,type){return(e.dots||[]).filter(d=>d.sourceSeries==='forge'&&FORGE_TYPES.includes(d.type)&&(!type||d.type===type)&&d.ttl>0&&(d.stack||1)>0);}
function consume(e,type,all=false){
 const list=fuel(e,type);let n=0;
 for(const d of list){const count=all?d.stack||1:1;n+=count;
  if(d.type==='burn'){const old=d.stack||1;d.stack=Math.max(0,old-count);d.dps=(d.dps||0)*d.stack/old;if(!d.stack)d.ttl=0;}
  else{d.ttl=0;d.stack=0;if(d.type==='paralysis'){e.paralyzed=0;if(e._genericSlow&&e._genericSlow.sourceSeries==='forge')e._genericSlow=null;require('./statuses.js').refreshSlow(e);}}
  if(!all)break;
 }
 e.dots=(e.dots||[]).filter(d=>d.ttl>0);return n;
}
function poisonLayers(e){return R.dots(e,'poison').reduce((n,d)=>n+(d.stack||0),0);}
function strike(combat,e,base,key,multiplier,name,bonus=0,ignoreArmor=false,derived=false){
 if(!e||e.hp<=0||!combat.enemies().includes(e))return false;
 const execute=!e.isBoss&&!e.isSummon&&e.hp<e.maxHp*.3?30:0;
 combat.damage(e,base*multiplier,key,{kind:derived?'derived':'awakening',sourceKey:key,bonus:bonus+execute,armorIgnore:ignoreArmor?1:0},name);
 if(combat.fxFlash)combat.fxFlash(e.x,e.y,'#f4d889',.2);return true;
}
function area(combat,e,radius){return combat.enemies().filter(o=>o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=radius);}
function ring(combat,e,radius,color='#edce7d'){if(combat.fxRing)combat.fxRing(e.x,e.y,color,radius,.5,3);}
function trail(combat,point,base){
 const start=combat.windClock||0,duration=3+(R.purple(combat.game.run,'gale_boomerang_0')?1:0);
 combat.pendingWindTrails=combat.pendingWindTrails||[];
 combat.pendingWindTrails.push({x:point.x,y:point.y,r:28,ttl:duration,dps:base*.1,slow:.2,born:start,expires:start+duration,nextTick:start+.2});
}
function cast(combat,key,def,target){
 const base=combat.shotDmg(key,true,true),name=def.name;let hit=false;
 const deal=(e,m,bonus=0,ignore=false,indirect=false)=>{const ok=strike(combat,e,base,key,m,name,bonus,ignore,indirect);hit=hit||ok;return ok;};
 switch(def.key){
 case 'sanctum_fire':for(const e of area(combat,target,100))deal(e,2,poisonLayers(e)>0?25:0);ring(combat,target,100,'#f4ad72');break;
 case 'sanctum_cannon':{const poisoned=poisonLayers(target)>0,near=area(combat,target,60);deal(target,3.5,0,true);if(poisoned)for(const e of near)if(e!==target)deal(e,.5,0,false,true);ring(combat,target,60);break;}
 case 'sanctum_boomerang':{
  const center={x:target.x,y:target.y};
  const pulse=cb=>{for(const e of area(cb,center,100))strike(cb,e,base,key,.9,name,poisonLayers(e)>0?10:0);ring(cb,center,100,'#cda8f5');};
  for(const e of area(combat,center,100))deal(e,.9,poisonLayers(e)>0?10:0);
  combat.delayed=combat.delayed||[];for(const delay of [.15,.3])combat.delayed.push({t:0,delay,fn:pulse});ring(combat,center,100,'#cda8f5');break;
 }
 case 'sanctum_electric':{
  const touched=new Set();let e=target;
  for(let i=0;i<3&&e;i++){touched.add(e);deal(e,1.6,e.paralyzed>0?50:0);const prev=e;e=combat.enemies().filter(o=>o.hp>0&&!touched.has(o)&&Math.hypot(o.x-prev.x,o.y-prev.y)<=180).sort((a,b)=>Math.hypot(a.x-prev.x,a.y-prev.y)-Math.hypot(b.x-prev.x,b.y-prev.y))[0];if(e&&combat.fxBeam)combat.fxBeam(prev.x,prev.y,e.x,e.y,'#f8df7b',.3,3);}break;
 }
 case 'sanctum_ice':for(const e of area(combat,target,90)){const dur=poisonLayers(e)>0?1.3:1;deal(e,1.2);if(e.hp>0)combat.freezeE(e,dur);}ring(combat,target,90,'#b8e7fa');break;
 case 'sanctum_poison':{const layers=Math.min(6,poisonLayers(target));if(layers){for(const d of R.dots(target,'poison')){d.stack=0;d.ttl=0;}}deal(target,.4*Math.max(1,layers));ring(combat,target,65,'#a6d99b');break;}
 case 'gale_boomerang':{
  const center={x:target.x,y:target.y};
  for(let i=0;i<2;i++){
   const pulse=cb=>{const e=target.hp>0&&cb.enemies().includes(target)?target:area(cb,center,70)[0];if(e){const harvest=consume(e);strike(cb,e,base,key,1.2,name,harvest?20:0);}trail(cb,{x:center.x+(i?25:-25),y:center.y+24},base);ring(cb,center,70,'#b8dbf3');};
   if(i===0){const harvest=consume(target);deal(target,1.2,harvest?20:0);trail(combat,{x:center.x-25,y:center.y+24},base);ring(combat,center,70,'#b8dbf3');}
   else{combat.delayed=combat.delayed||[];combat.delayed.push({t:0,delay:.25,fn:pulse});}
  }break;
 }
 case 'gale_ice':for(const e of area(combat,target,90)){const harvest=consume(e,'armorBreak');deal(e,1.2,harvest?50:0);if(e.hp>0)combat.freezeE(e,harvest?1.5:1);}ring(combat,target,90,'#9fe0ff');break;
 case 'gale_poison':{const count=consume(target,null,true);deal(target,.4*Math.max(1,Math.min(6,count)));ring(combat,target,65,'#a1dcbe');break;}
 }
 return hit;
}
function tick(combat,dt){
 const run=combat.game.run,s=run.talentState;if(!s)return;
 s.time=(s.time||0)+Math.max(0,dt);
 for(const [key,def]of Object.entries(s.goldActive||{})){
  if(!R.goldActive(run,key))continue;
  const cd=s.cooldowns[key]||(s.cooldowns[key]={remaining:10,initial:true});cd.remaining=Math.max(0,cd.remaining-dt);if(cd.remaining<1e-8)cd.remaining=0;
  cd.retry=Math.max(0,(cd.retry||0)-dt);
  const tower=combat.tower(key);if(cd.retry>0||cd.remaining>0||!tower||tower.level<=0||tower._activationDelay>0||require('../bosses/index.js').towerFrozen(combat.game,key))continue;
  const target=combat.pickTarget(key);if(!target)continue;
  // 先预置冷却，使同步击杀可正确减半；未命中则不消耗CD。
  cd.remaining=def.cooldown;cd.initial=false;
  if(!cast(combat,key,def,target)){cd.remaining=0;cd.retry=2;}
 }
}
module.exports={fuel,consume,poisonLayers,strike,cast,tick};
