/** 前两章独立曲线：全波次出生预算、平台、技能上限、Boss与第三章/正式关卡隔离。 */
'use strict';
const assert=require('assert');
const fixture=require('./moving-battle-fixture.cjs');
const Main=require('../js/game/main.js');
const CONFIG=require('../js/config.js');
const PLAN=require('../js/config/prologue.js');
const Curve=require('../js/prologue/enemy-curve.js');
const Balance=require('../js/prologue/balance.js');
const Bosses=require('../js/config/bosses.js');
const snapshot=JSON.stringify({towers:CONFIG.TOWERS,bosses:Bosses,third:PLAN.chapters[PLAN.order[2]]});
function world(id,wave){const g=new Main();g.menuStage=id;g.saveData=null;g.save.save=()=>true;g.newRun(false);g.state='fighting';g.run.wave=wave;g.wave.buildPlan();return g;}
try{
 let waves=0,spawned=0;
 for(const id of PLAN.order.slice(0,2)){
  const chapter=PLAN.chapters[id];
  for(let wave=1;wave<=chapter.maxWave;wave++){
   const g=world(id,wave),scriptBoss=g.run.bossLock;
   const plan=g.wave.plan.slice(),expected=g.wave.enemyTotalHp;
   while(g.wave.plan.length)g.wave.spawnOne();
   assert(g.enemies.length);spawned+=g.enemies.length;waves++;
   if(!scriptBoss){
    assert.equal(g.enemies.reduce((n,e)=>n+e.maxHp,0),expected);
    assert.equal(g.run.endWave(true).enemyHp,expected);
   }
   for(const e of g.enemies){
    if(e.bossId){assert.equal(e.maxHp,9000);assert.equal(e.armor,.08);continue;}
    const stat=Curve.stats(chapter,wave,e.isBoss?'boss':e.type);
    assert.equal(e.hp,stat.hp);assert.equal(e.maxHp,stat.hp);assert.equal(e.armor,stat.armor);
    const hp=e.hp;Balance.spawnScale(g,e);assert.equal(e.hp,hp,'不能重复缩放');
   }
   assert(plan.length<=Math.ceil(CONFIG.ENEMY.countForWave(wave)*chapter.enemyMultipliers.count)||scriptBoss);
  }
 }
 for(const type of ['normal','runner','tank','elite','boss']){
  const chapter=PLAN.chapters[PLAN.order[1]];
  assert.deepEqual(Curve.stats(chapter,15,type),Curve.stats(chapter,19,type));
 }
 assert.equal(Curve.stats(PLAN.chapters[PLAN.order[0]],10,'boss').hp,1100);
 const g=world(PLAN.order[1],20),b=Balance.profile(g,Bosses.altar_rosea);
 assert.equal(b.hp,9000);assert.equal(b.shieldPerLayer,400);assert.equal(b.shieldPeriod,18);assert.equal(b.armor,.08);
 while(g.wave.plan.length)g.wave.spawnOne();
 const boss=g.run.bossEnemy;boss.shieldClock=0;
 require('../js/bosses/rosea.js').tick(g,18);assert.equal(boss.shield,400);
 boss.hp=boss.maxHp*.49;require('../js/bosses/rosea.js').tick(g,.01);
 const additions=g.wave.plan.slice();assert(additions.length);
 while(g.wave.plan.length)g.wave.spawnOne();
 for(const enemy of g.enemies.filter(e=>!e.bossId))assert.equal(enemy.maxHp,Curve.stats(g.run.chapter,20,enemy.type).hp);
 const first=world(PLAN.order[0],1);first.run.applyMatch('red','3',3);first.run.gainExp(1e6);
 assert.equal(first.run.expLevel,0);assert.equal(first.run.effects.tower('fire').level,1);
 const second=world(PLAN.order[1],1);
 for(const color of ['red','blue','green'])second.run.applyMatch(color,'3',3);
 second.run.gainExp(1e6);assert.equal(second.run.effects.settleAuto().activated,9);
 assert(second.run.slotOrder.every(k=>second.run.effects.tower(k).level===4));
 assert.equal(Curve.stats(PLAN.chapters[PLAN.order[2]],10,'normal'),null);
 const normal=world('ancient',20);assert.equal(Balance.profile(normal,Bosses.altar_rosea),Bosses.altar_rosea);
 assert.equal(JSON.stringify({towers:CONFIG.TOWERS,bosses:Bosses,third:PLAN.chapters[PLAN.order[2]]}),snapshot);
 console.log(`PASS ${waves} chapter waves/${spawned} spawned enemies, exact HP budgets, W15 plateau, 1/4 level caps, Rosea shield/adds, no repeated scaling or global config changes.`);
}finally{fixture.restore();}
