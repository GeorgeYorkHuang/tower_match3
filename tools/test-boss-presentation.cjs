/** Boss告警位置、一次性震动、18px生命条与章节Boss隔离回归。 */
'use strict';
const assert=require('assert');
const fixture=require('./moving-battle-fixture.cjs');
const Main=require('../js/game/main.js');
const PLAN=require('../js/config/prologue.js');
const Bosses=require('../js/config/bosses.js');
const Notice=require('../js/game/fx/boss-announcement.js');
const Health=require('../js/game/screens/boss-health.js');
const snapshot=JSON.stringify(Bosses);
try{
 for(const field of [PLAN.order[1],PLAN.order[2],'ancient']){
  const g=new Main();g.menuStage=field;g.saveData=null;g.save.save=()=>false;g.newRun(false);g.run.wave=19;g.startNextWave();
  assert.equal(g.bossHint.major,true);assert.equal(g.bossHint.name,Bosses.altar_rosea.name);
  g.wave.spawnOne();assert(g.run.bossEnemy);
  const hp=g.run.bossEnemy.hp,fx=g.run.bossEntranceShake;
  assert(fx);Notice.enter(g,g.run.bossEnemy);assert.equal(g.run.bossEntranceShake,fx);
  g.animClock=fx.at+100;const delta=Notice.shake(g);assert(Math.abs(delta.x)+Math.abs(delta.y)>0);
  assert(Math.abs(delta.x)<=9&&Math.abs(delta.y)<=9);assert.equal(g.run.bossEnemy.hp,hp);
  g.animClock=fx.at+650;assert.deepEqual(Notice.shake(g),{x:0,y:0});
  assert(!g.fx.some(item=>item.type==='floatText'&&item.text.includes('小BOSS登场')));
  g.newRun(false);assert.deepEqual(Notice.shake(g),{x:0,y:0});
 }
 const texts=[],gradients=[],positions=[];
 const ctx=new Proxy({
  fillText(value,x,y){texts.push({value:String(value),x,y});},
  moveTo(x,y){positions.push({x,y});},
  createLinearGradient(x,y,a,b){gradients.push({y,b});return {addColorStop(){}};}
 },{get:(o,k)=>k in o?o[k]:()=>{}});
 for(const now of [100,600,1100]){
  const start=texts.length;Notice.draw(ctx,{wave:20,name:'缠根司祭·萝赛',major:true,until:4000},967,now);
  assert(texts.slice(start).some(t=>t.value.includes('萝赛')),'不再半秒隐藏Boss名字');
 }
 assert(texts.every(t=>t.y>=967&&t.y<1089));
 Health.draw(ctx,{bossName:'缠根司祭·萝赛',hp:4500,maxHp:9000,phase:1,shield:200,_shieldPerLayer:400},208);
 assert(gradients.some(g=>g.b-g.y===18),'生命填充高度必须由9px改为18px');
 assert(texts.some(t=>t.value==='4500 / 9000'));assert(texts.some(t=>t.value==='藤甲护盾 200'));
 assert.equal(JSON.stringify(Bosses),snapshot);
 console.log('PASS tower-row warnings, persistent W20 name, one-shot 650ms shake/reset, 18px HP/shield UI, unchanged Boss stats.');
}finally{fixture.restore();}
