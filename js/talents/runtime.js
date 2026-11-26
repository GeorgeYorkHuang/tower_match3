'use strict';
const T=require('./model.js');
const EMPTY={attack:0,speed:0,charge:0,damage:0,skill:0,dot:0,duration:0};
function initialize(run,meta){
 const disabled=run.chapter&&!run.chapter.features.talents,a=disabled?null:T.analyze(meta);
 run.talentState={bonuses:a?a.bonuses:{},purple:a?a.purpleList.map(p=>p.key):[],gold:a?a.gold.map(id=>T.get(id).gold.key):[],
  goldActive:a?a.goldActive:{},goldPassive:a?a.goldPassive:{},cooldowns:{},counters:{},targets:new WeakMap(),time:0};
 for(const [key,def]of Object.entries(run.talentState.goldActive))run.talentState.cooldowns[key]={remaining:def.first,initial:true};
}
function bonus(run,key){return run&&run.talentState&&run.talentState.bonuses[key]||EMPTY;}
function built(run,key){return !!run&&(run.slotOrder||[]).includes(key);}
function purple(run,key){const state=run&&run.talentState;const tower=key.split('_')[1];return !!state&&built(run,tower)&&state.purple.includes(key);}
function goldPassive(run,key){return built(run,key)&&run.talentState&&run.talentState.goldPassive[key]||null;}
function goldActive(run,key){return built(run,key)&&run.talentState&&run.talentState.goldActive[key]||null;}
function passive(run,key,name){const p=goldPassive(run,key);return !!p&&p.key===name;}
function statusDuration(run,key,seconds){
 let extra=bonus(run,key).duration||0;
 if(key==='poison'){if(purple(run,'sanctum_poison_0'))extra+=.6;if(purple(run,'gale_poison_0'))extra+=.8;}
 if(key==='fire'&&purple(run,'forge_fire_0'))extra+=.5;
 if(key==='electric'&&(purple(run,'sanctum_electric_0')||purple(run,'forge_electric_0')))extra+=.4;
 if(key==='ice'&&purple(run,'gale_ice_0'))extra+=.6;
 return Math.max(0,seconds+extra);
}
function slowStrength(run,key,value){const b=bonus(run,key).dot||0;let result=b>0?Math.min(.9,value*(1+b)):value;if(key==='ice'&&purple(run,'gale_ice_0'))result=Math.min(.9,result+.08);return result;}
function dots(e,type){return(e.dots||[]).filter(d=>d.type===type&&d.ttl>0&&(d.stack==null||d.stack>0));}
function targetState(run,e){const s=run.talentState;if(!s.targets)s.targets=new WeakMap();let t=s.targets.get(e);if(!t){t={};s.targets.set(e,t);}return t;}
function derived(combat,e,damage,key,name){if(e.hp>0)combat.damage(e,damage,key,'derived',name);}
function beforeDamage(combat,e,damage,key,kind,skill){
 const run=combat.game.run,s=run.talentState;if(!s||kind==='derived')return damage;
 let value=kind==='dot'?damage*(1+bonus(run,key).dot):damage;
 if(kind!=='hit'||skill||!built(run,key))return value;
 const pd=dots(e,'poison'),target=targetState(run,e);
 if(key==='fire'&&purple(run,'sanctum_fire_0'))pd.forEach(d=>d.ttl+=.5);
 if(key==='cannon'&&purple(run,'sanctum_cannon_0'))pd.forEach(d=>d.stack=Math.min(d.maxStack||d.stack,d.stack+1));
 if(key==='boomerang'&&purple(run,'sanctum_boomerang_0')&&!target.poisonExtended&&pd.length){pd.forEach(d=>d.ttl+=.5);target.poisonExtended=true;}
 if(key==='fire'&&purple(run,'forge_fire_1')){
  const d=dots(e,'burn')[0],ttl=statusDuration(run,'fire',2);
  if(d){const per=(d.dps||0)/Math.max(1,d.stack||1);d.stack=Math.min(d.maxStack||2,(d.stack||1)+1);d.dps=Math.max(per,damage*.08)*d.stack;d.ttl=Math.max(d.ttl,ttl);d.sourceSeries='forge';}
  else{e.dots=e.dots||[];e.dots.push({type:'burn',dps:damage*.08,ttl,stack:1,maxStack:2,tickT:.5,tickI:.5,src:'fire',skill:'火种',sourceSeries:'forge'});}
 }
 if(key==='cannon'&&purple(run,'forge_cannon_0')){
  let d=dots(e,'armorBreak')[0];if(d)d.ttl=3;else{e.dots=e.dots||[];e.dots.push({type:'armorBreak',ttl:3,stack:1,reduction:.1,sourceSeries:'forge'});}
 }
 if(passive(run,key,'sanctum_splash')){const o=combat.enemies().find(o=>o!==e&&o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=60);if(o)derived(combat,o,damage*.3,key,'烬火溅射');}
 if(passive(run,key,'sanctum_poisonTransfer')&&pd.length&&(target.poisonTransferAt==null||s.time-target.poisonTransferAt>=3)){
  const o=combat.enemies().find(o=>o!==e&&o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=60);if(o){const d=pd[0],own=dots(o,'poison')[0];if(own){own.stack=Math.min(own.maxStack,own.stack+1);own.ttl=Math.max(own.ttl,d.ttl);}else{o.dots=o.dots||[];o.dots.push({...d,stack:1,tickT:1/(d.freq||1),_curseDealt:0});}d.stack--;if(d.stack<=0)d.ttl=0;target.poisonTransferAt=s.time;}
 }
 return value;
}
function damageBonus(combat,e,key,kind){return key==='cannon'&&kind!=='derived'&&purple(combat.game.run,'forge_cannon_1')&&dots(e,'armorBreak').length?8:0;}
function armor(e){return Math.max(0,(e.armor||0)-dots(e,'armorBreak').reduce((n,d)=>n+(d.reduction||0),0));}
function onParalyze(combat,e){const run=combat.game.run;if(!purple(run,'forge_electric_0')&&!purple(run,'forge_electric_1'))return;let d=dots(e,'paralysis')[0];if(d)d.ttl=Math.max(d.ttl,e.paralyzed);else{e.dots=e.dots||[];e.dots.push({type:'paralysis',ttl:e.paralyzed,stack:1,sourceSeries:'forge'});}}
function freeze(combat,e,previous){if(e.frozen<=previous||!passive(combat.game.run,'ice','sanctum_freezeSplash'))return;for(const o of combat.enemies())if(o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=100)combat.applySlow(o,.3,3,'ice');}
function attack(combat,key){const run=combat.game.run;if(!passive(run,key,'sanctum_freeShot'))return false;const c=run.talentState.counters,n=c[key]||0;c[key]=(n+1)%4;return n===3;}
function tick(combat,e,dt){for(const d of(e.dots||[]))if(d.type==='armorBreak'||d.type==='paralysis')d.ttl=Math.max(0,d.ttl-dt);e.dots=(e.dots||[]).filter(d=>!['armorBreak','paralysis'].includes(d.type)||d.ttl>0);}
function onDeath(combat,e){
 const run=combat.game.run,s=run.talentState;if(!s||combat._talentDerived)return;
 const burn=dots(e,'burn')[0];if(burn&&passive(run,'fire','forge_burnTransfer')){const o=combat.enemies().find(o=>o!==e&&o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=60);if(o){let d=dots(o,'burn')[0];const per=(burn.dps||0)/Math.max(1,burn.stack||1);if(d){const own=(d.dps||0)/Math.max(1,d.stack||1);d.stack=Math.min(d.maxStack||1,(d.stack||1)+1);d.dps=Math.max(own,per)*d.stack;d.ttl=Math.max(d.ttl,burn.ttl);d.sourceSeries='forge';}else{o.dots=o.dots||[];o.dots.push({...burn,stack:1,dps:per,sourceSeries:'forge'});}}}
 if(e.paralyzed>0&&passive(run,'electric','forge_paralysisTransfer'))for(const o of combat.enemies())if(o!==e&&o.hp>0&&Math.hypot(o.x-e.x,o.y-e.y)<=80){o.paralyzed=Math.max(o.paralyzed||0,.5);onParalyze(combat,o);combat.applySlow(o,.5,.5,'electric');}
 if(!e.isSummon){const cd=s.cooldowns[e.lastDmgKey];if(cd&&!cd.initial&&cd.remaining>0)cd.remaining=Math.min(cd.remaining,Math.max(8,cd.remaining*.5));}
}
module.exports={initialize,bonus,built,purple,goldPassive,goldActive,passive,statusDuration,slowStrength,beforeDamage,damageBonus,armor,onParalyze,freeze,attack,tick,onDeath,dots};
