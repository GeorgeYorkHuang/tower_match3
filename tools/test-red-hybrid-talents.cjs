'use strict';
const assert=require('node:assert/strict'),T=require('../js/talents/model.js'),R=require('../js/talents/runtime.js'),A=require('../js/combat/awakening.js'),S=require('../js/combat/statuses.js');
const keys=['fire','cannon','boomerang','electric','ice','poison'];
function fixture(cards,star=3){
 const meta={relicStars:{},talents:{version:2,slots:Array(6).fill(null)}};
 for(const c of cards){meta.relicStars[c.id]=star;meta.talents.slots[c.nativeSlot]=c.id;}
 const run={slotOrder:keys.slice(),chapter:null,relicNum:()=>0,relic3:()=>false,relicRun:()=>0,relicValue:()=>0};R.initialize(run,meta);
 let enemies=[];const hits=[];const cb={game:{run},delayed:[],enemies:()=>enemies,tower:k=>({key:k,level:1,energy:100}),pickTarget:()=>enemies.find(e=>e.hp>0),shotDmg:()=>100,relicVal:()=>0,lv:()=>0,branchLv:()=>0,dotBoost:()=>({dmg:.1,ttlAdd:0}),fxRing(){},fxFlash(){},fxBeam(){},fxParticle(){},damage(e,dmg,key,kind,name){hits.push({e,dmg,key,kind,name});},applySlow(e,m,t,source){S.applySlow(cb,e,m,t,source);},freezeE(e,t){S.freezeE(cb,e,t);}};
 const enemy=(extra={})=>({hp:10000,maxHp:10000,x:0,y:0,dots:[],armor:.3,...extra});
 return {run,cb,hits,enemy,setEnemies(value){enemies=value;},meta};
}
const all=T.C.cards;assert.equal(all.length,18);assert.equal(all.filter(c=>c.goldActive).length,9);assert.equal(all.filter(c=>c.goldPassive).length,9);assert.equal(all.filter(c=>!c.gold.enabled).length,6);assert(all.every(c=>!c.exclusive));
for(const card of all){for(const star of [1,2,3]){const f=fixture([card],star);assert.equal(f.run.talentState.purple.length,star>=2?card.purpleList.length:0);assert.equal(Object.keys(f.run.talentState.goldActive).length,star===3&&card.goldActive?1:0);assert.equal(Object.keys(f.run.talentState.goldPassive).length,star===3&&card.goldPassive?1:0);assert(!('ready'in f.run.talentState));assert(!('charge'in f.run.talentState));}}
// 每个自动觉醒均可在无燃料情况下命中；首次10秒，正常冷却20秒；空场不吃CD。
for(const card of all.filter(c=>c.goldActive)){
 const f=fixture([card]),e=f.enemy();f.setEnemies([e]);A.tick(f.cb,9.99);assert.equal(f.hits.length,0);A.tick(f.cb,.01);assert(f.hits.length>0,card.id);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,20);
 assert(!f.hits.some(h=>!Number.isFinite(h.dmg)));A.tick(f.cb,1);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,19);
 f.setEnemies([]);A.tick(f.cb,20);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,0);f.setEnemies([e]);A.tick(f.cb,0);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,20);
 e.lastDmgKey=card.tower;R.onDeath(f.cb,e);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,10);R.onDeath(f.cb,e);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,8);e.isSummon=true;R.onDeath(f.cb,e);assert.equal(f.run.talentState.cooldowns[card.tower].remaining,8);
}
const forge=all.filter(c=>c.series==='forge');let f=fixture(forge),e=f.enemy();f.setEnemies([e]);R.beforeDamage(f.cb,e,100,'fire','hit');assert(R.dots(e,'burn').length);assert.equal(e.dots[0].sourceSeries,'forge');R.beforeDamage(f.cb,e,100,'cannon','hit');assert(Math.abs(R.armor(e)-.2)<1e-10);assert.equal(R.damageBonus(f.cb,e,'cannon','hit'),8);
e.paralyzed=1;S.applySlow(f.cb,e,.5,1,'electric');assert(A.fuel(e,'paralysis').length);assert.equal(e._genericSlow.seriesSpeed,.92);
assert.equal(A.consume(e,'armorBreak'),1);assert.equal(A.consume(e,'armorBreak'),0);assert.equal(R.armor(e),.3);assert.equal(A.consume(e,null,true),2);assert.equal(e.paralyzed,0);
f=fixture([all.find(c=>c.id==='ur_gale_poison')]);e=f.enemy({dots:[{type:'burn',ttl:3,stack:2,sourceSeries:'forge',dps:16},{type:'burn',ttl:3,stack:1,sourceSeries:'other',dps:8}]});f.setEnemies([e]);A.cast(f.cb,'poison',f.run.talentState.goldActive.poison,e);assert.equal(f.hits[0].dmg,80);assert.equal(e.dots.length,1);assert.equal(e.dots[0].sourceSeries,'other');
f=fixture([all.find(c=>c.id==='ur_sanctum_cannon')]);assert.deepEqual(Array.from({length:8},()=>R.attack(f.cb,'cannon')),[false,false,false,true,false,false,false,true]);
f=fixture([all.find(c=>c.id==='ur_sanctum_poison')],2);e=f.enemy();S.applyPoison(f.cb,e,100,'poison',99);assert.equal(e.dots[0].maxStack,require('../js/config/tower-skills.js').poison['毒性强化'].stackCap+2);
const before=JSON.stringify(e.dots);R.beforeDamage(f.cb,e,100,'poison','derived');assert.equal(JSON.stringify(e.dots),before);
f=fixture(all.filter(c=>c.series==='sanctum'));f.run.chapter={features:{talents:false}};R.initialize(f.run,f.meta);assert.equal(f.run.talentState.purple.length,0);assert.equal(Object.keys(f.run.talentState.goldActive).length,0);
console.log('PASS 18-card schema, 12 effect cards, dual purples, 9 automatic awakenings, 10/20s timing, empty target, kill CD bounds, summon exclusion, fuel provenance/consumption, free fourth shot, poison cap and disabled chapters');
