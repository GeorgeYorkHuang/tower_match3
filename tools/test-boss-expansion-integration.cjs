'use strict';
const assert=require('node:assert/strict');
require('./balance/fixtures/moving-battle-fixture.cjs');
const Main=require('../js/game/main.js');
const Boss=require('../js/bosses/index.js');
function create(field,wave){const g=new Main();g.menuStage=field;g.saveData=null;g.save.save=()=>{};g.newRun(false);g.run.wave=wave-1;g.wave.start();while(g.wave.plan.length&&!g.enemies.some(e=>e.isBoss))g.wave.spawnOne();const e=g.enemies.find(e=>e.isBoss);assert(e);return {g,e};}
for(const [field,id] of [['lava','lava_twins'],['frost','frost_twins']]){
 const {g,e}=create(field,40);assert.equal(e.bossId,id);g.combat.damage(e,e.maxHp/(1-e.armor),'fire');
 const q=g.run.bossEncounter;assert.equal(q.phase,2);assert.equal(q.members.length,2);assert.equal(e._bossRetired,true);
 assert.ok(q.members.every(t=>t.hp<t.maxHp)); // 真伤入口分裂溢出已经分摊
 if(q.members.every(t=>t.hp<=0)){assert.equal(q.finished,true);}else{
  g.combat.damage(q.members[0],1e8,'fire');assert.equal(q.finished,false);
  g.combat.damage(q.members[1],1e8,'ice');assert.equal(q.finished,true);
 }
 const gold=g.run.gold;g.update(1/60);assert.equal(g.run.bossLock,false);assert.ok(g.run.wave===40||g.run.wave===41);assert.ok(g.state!=='gameover');
 // 波末可能等待技能选择/检查点，不强制要求立即41波。
 assert.ok(g.run.gold>=gold);assert.equal(g._waveCleared[40],true);
}
for(const [field,id] of [['lava','lava_ignis'],['frost','frost_skall']]){
 const {g,e}=create(field,60);assert.equal(e.bossId,id);
 g.combat.damage(e,e.maxHp*.72/(1-e.armor),'fire');assert.equal(g.run.bossEncounter.phase,3);
 if(field==='lava'){
  const q=g.run.bossEncounter;g.combat.damage(e,e.maxHp*.051/(1-e.armor),'ice');assert.equal(q.interrupts,1);
 }else{assert.deepEqual(g.run.bossEncounter.shadowsSent,[true,true]);}
 g.combat.damage(e,1e9,'electric');assert.equal(g.run.bossEncounter.finished,true);
 g.update(1/60);assert.equal(g.run.finalVictory,true);assert.equal(g.state,'gameover');assert.equal(g.runSummary.victory,true);
 const payout=g.meta.gold;g.update(1/60);g.waveEnd();assert.equal(g.meta.gold,payout);
 assert.equal(g.meta.fieldClears[field],true);
}
console.log('Native Boss integration PASS');


// 暂停与倍速走 Main.update，关闭塔位以隔离自动攻击造成的额外阶段切换。
for(const field of ['lava','frost']){
 const {g,e}=create(field,60);g.run.slotOrder=[];g.wave.plan=[];
 g.combat.damage(e,e.maxHp*.72/(1-e.armor),'fire');
 const q=g.run.bossEncounter, before=q.elapsed;
 g.state='paused';g.update(.25);assert.equal(q.elapsed,before);
 g.state='fighting';g.runSpeed=4;g.update(.25);assert.equal(q.elapsed,before+1);
 if(field==='frost'){q.frozenUntil.fire=q.elapsed+4;q.freezeTargets=['fire'];q.freezeApplyAt=q.elapsed+1;}
 else{q.heatUntil=q.elapsed+4;}
 g.goMenu();assert.equal(g.state,'menu');assert.equal(Boss.towerFrozen(g,'fire'),false);
 if(field==='frost'){assert.deepEqual(q.freezeTargets,[]);assert.deepEqual(q.frozenUntil,{});assert.equal(q.freezeApplyAt,Infinity);}
 else{assert.equal(q.castEnd,Infinity);assert.equal(q.heatUntil,0);}
}
(async()=>{
 const Video=require('../js/ads/rewarded-video.js'), prior=Video.show;
 Video.show=async()=>({ok:true});
 try{
  const {g,e}=create('lava',60);g.run.slotOrder=[];g.wave.plan=[];
  g.combat.damage(e,e.maxHp*.72/(1-e.armor),'fire');
  const q=g.run.bossEncounter;g.run.lineHp=0;g.run.broken=true;g.finishRun(false);
  assert.equal(g.state,'reviveOffer');const hp=e.hp,elapsed=q.elapsed,castEnd=q.castEnd;
  g.update(1);assert.equal(q.elapsed,elapsed);
  const ok=await require('../js/game/flows/ad-actions.js').watch(g,'revive');assert.equal(ok,true);
  assert.equal(g.state,'fighting');assert.equal(e.hp,hp);assert.equal(q.castEnd,castEnd);assert.equal(q.elapsed,elapsed);assert.equal(g.run.broken,false);
  // 复活保护中熔核自爆仍死亡，但不扣墙。
  const core={hp:1,bossSummonId:'lava_ignis',id:123,x:375,y:500,dots:[],type:'tank',waveNo:60};
  const wall=g.run.lineHp;Boss.coreAtWall(g,core);assert.equal(g.run.lineHp,wall);
  g.state='evac';const paused=q.elapsed;g.update(.1);assert.equal(q.elapsed,paused);
  console.log('Native pause/speed/menu/revive/evacuation PASS');
 }finally{Video.show=prior;}
})().catch(e=>{console.error(e);process.exitCode=1;});
