'use strict';
const assert=require('assert'),{Run}=require('../js/run.js'),{WaveDirector}=require('../js/wave.js'),R=require('../js/bosses/rosea.js'),B=require('../js/config/bosses.js').altar_rosea;
function game(field='ancient',wave=20){const g={run:new Run({field}),enemies:[],fx:[],menuStage:field,state:'fighting',waveTime:0};g.run.wave=wave;g.wave=new WaveDirector(g,{areaY:140,entryH:50,wallY:967,areaX:0,areaW:750});g.wave.buildPlan();return g;}
const g=game();assert(g.run.bossLock);assert.equal(g.wave.plan.length,6);assert.equal(g.wave.plan[0].bossId,B.id);g.wave.spawnOne();const e=g.run.bossEnemy;assert.equal(e.hp,93100);assert.equal(e.armor,.3);assert.equal(e.attack,198);
R.tick(g,36);assert.equal(e.shield,14100);assert.equal(e.shieldLayers,3);assert.equal(R.absorb(e,1000),0);assert.equal(e.shield,13200);
e.hp=e.maxHp*.5;const n=g.wave.plan.length;R.tick(g,.01);assert.equal(e.phase,2);assert.equal(e.armor,0);assert.equal(e.shield,0);assert.equal(g.wave.plan.length,n+9);assert.equal(g.wave.plan.filter(x=>x.isSummon).length,3);assert.equal(e._bossStun,.5);R.tick(g,.2);assert.equal(g.wave.plan.length,n+9);assert(e._bossStun>0);
for(const field of ['lava','frost','test','abyss'])assert(!game(field).run.bossLock);assert(!game('ancient',19).run.bossLock);
const separate=game();assert.equal(separate.run.bossEnemy,null);assert.equal(separate.wave.plan.length,6);
for(let i=0;i<50;i++)g.wave.tick(.25);assert.equal(g.wave.plan.length,0);assert.equal(g.enemies.filter(x=>x.isSummon).length,3);assert(g.enemies.filter(x=>x.isSummon).every(x=>x.hp===3200));
assert.equal(R.absorb({hp:100},40),40);
console.log('PASS Rosea real wave setup/spawn, shield cap/absorb, half-health transition once, phase adds/summons, stun, field isolation and normal-wave fallback');
const Statuses=require('../js/combat/statuses.js');
const controls={game:g,branchLv:()=>0,lv:()=>0,relicVal:()=>0,dotBoost:()=>({dmg:0.1}),fxFlash(){},fxRing(){}};
e.frozen=0;Statuses.freezeE(controls,e,2);assert.equal(e.frozen,2);e.slow={mult:.7,ttl:2};Statuses.tickBaseStatus(controls,e,.25);assert.equal(e.frozen,1.5);assert.equal(e.slow.ttl,1.5);
// Run the real Main update: locked encounter ignores normal timeout and ends only once after boss death.
require('./_test_combat_feedback_integration.cjs');
const live=global.GameGlobal.game;live.menuStage='ancient';live.newRun(true);live.run.wave=20;live.wave.buildPlan();live.wave.spawnOne();live.wave.plan=[];live.wave.planDoneAt=0;live.pendingRelicPicks=[];live.pickQueue=[];live.waveTime=0;live.stepEnemies=()=>{};let ended=0;live.waveEnd=()=>{ended++;live.state='waveclear';};
live.update(5);assert.equal(ended,0);assert.equal(live.waveTime,0);live.run.bossEnemy.hp=0;live.update(.1);assert.equal(ended,1);assert.equal(live.run.bossLock,false);live.update(.1);assert.equal(ended,1);
console.log('PASS Rosea control duration resistance and real Main lock/timer/death-exit single settlement');
