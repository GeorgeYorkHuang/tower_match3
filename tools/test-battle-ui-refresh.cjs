/** 城墙/章节HUD、连续解锁、封闭宝箱和自由飞行连消弹的回归。 */
'use strict';
const assert=require('assert');
const PLAN=require('../js/config/prologue.js');
const {Meta}=require('../js/meta.js');
const Access=require('../js/field-access.js');
const Flight=require('../js/chain-flight.js');
const {createBattleHud}=require('../js/game/screens/battle-hud.js');
let words=[];
const ctx=new Proxy({fillText(s){words.push(s);}}, {get:(o,k)=>k in o?o[k]:()=>{}});
const hud=createBattleHud({drawImg:()=>true,IMG_SRC:{},fmtNum:String,relicIconSrc:()=>'',AREA_X:0,AREA_Y:100,AREA_W:750,ENTRY_H:68});
for(const [stage,max] of [...PLAN.order.map(id=>[id,PLAN.chapters[id].maxWave]),['ancient',60]]){
 words=[];hud.entryStatus.call({},ctx,{stage,wave:max,battleRelics:[]});
 assert(words.includes(`第 ${max} / ${max} 波`));assert(words.includes('终点'+max));
 if(max<60)assert(!words.some(s=>String(s).includes('60')));
}
const meta=new Meta();
assert.deepEqual(Access.selectable(meta,false),PLAN.order.slice(0,2));
meta.prologue.cleared=PLAN.order.slice();
assert.equal(Access.selectable(meta,false).at(-1),'lava');
assert(Access.reason('lava',meta,false));assert(Access.reason('frost',meta,false));
Access.markCleared(meta,'ancient');assert.equal(Access.selectable(meta,false).at(-1),'frost');
assert.equal(Access.reason('lava',meta,false),'');assert(Access.reason('frost',meta,false));
Access.markCleared(meta,'lava');assert.equal(Access.selectable(meta,false).at(-1),'abyss');
Access.markCleared(meta,'frost');assert.equal(Access.reason('abyss',meta,false),'');
assert.deepEqual(Meta.fromJSON(meta.toJSON()).fieldClears,meta.fieldClears);
function shot(){return {sx:375,sy:1100,x:375,y:1100,t:0,chainFlight:Flight.create(375,1100,375,500,.5)};}
for(const mode of ['empty','dead','move','hit']){
 let enemy={x:375,y:700,hp:100,size:40},enemies=mode==='empty'?[]:[enemy],hits=0;
 const combat={enemies:()=>enemies,resolveShot(){hits++;}};
 const s=shot();s.visual={t:0,dur:3};let alive=true,launchY,afterY;
 for(let n=0;n<200&&alive;n++){
  s.t+=.02;alive=Flight.advance(combat,s,.02);
  if(s._chainLaunched&&launchY===undefined){launchY=s.y;if(mode==='dead')enemy.hp=0;if(mode==='move')enemy.x=700;}
  if(s.t>.8&&afterY===undefined)afterY=s.y;
 }
 assert(!alive,mode+' 必须结束');
 assert.equal(s.visual.t,s.visual.dur,'实体结束时必须同步移除贴图，不能留下静止子弹');
 if(mode==='hit')assert.equal(hits,1);else{assert.equal(hits,0);assert(afterY<launchY,mode+' 没目标也必须继续飞行');}
}
const fixture=require('./moving-battle-fixture.cjs');
try{
 const Main=require('../js/game/main.js'),Chests=require('../js/game/flows/board-chests.js');
 for(const [id,won] of [['ancient',true],['lava',true],['frost',true],['lava',false]]){
  const g=new Main();g.meta=new Meta();g.meta.tutorial.done=true;g.saveData=null;g.menuStage=id;g.newRun(false);g.state='fighting';
  g.run.wave=60;g.run.lineHp=2000;g.run.finalVictory=won;g.run.clearedWaves=won?60:59;
  g.finishRun(true);assert.equal(!!g.meta.fieldClears[id],won,'必须真实通关才保存解锁');
  assert.equal(!!Meta.fromJSON(g.meta.toJSON()).fieldClears[id],won);
 }
 for(const id of PLAN.order){
  const g=new Main();g.meta=new Meta();g.meta.tutorial.done=true;g.menuStage=id;g.saveData=null;g.save.save=()=>true;g.newRun(true);
  for(const wave of [2,5,10,20]){
   g.run.wave=wave;g.fieldChests=[];
   g.onKillReward({type:'elite',hp:0,isBoss:true,waveNo:wave,genLv:1,x:375,y:400});
   if(!g.run.chapter.features.relics)assert.equal(g.fieldChests.length,0);
  }
  if(!g.run.chapter.features.relics){
   g.fieldChests=[{id:99,stage:'waiting'}];g.run.board.grid[0][0]={s:'chest',id:99,c:null};
   Chests.tick(g,1);assert.equal(g.fieldChests.length,0);assert.equal(g.run.board.grid[0][0].s,undefined);
  }
  g.enemies=[];g.run.applyMatch('red','3',3);g.run.effects.tower('fire')._activationDelay=0;g.combat.spawnChainShots({key:'fire',x:375,y:1100});
  assert(g.combat.shots.length,'无敌人仍产生连消弹');
 }
}finally{fixture.restore();}
console.log('PASS chapter HUD 10/20/40/60, sequential access/save, no-target/dead/moving/hit chain shots, locked chapter chests.');
