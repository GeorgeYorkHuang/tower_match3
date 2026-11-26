'use strict';
const assert=require('node:assert/strict');
const Boss=require('../js/bosses/index.js');
const Skall=require('../js/bosses/frost-skall.js');
const B=require('../js/config/boss-expansion.js').frost_skall;
const Linkage=require('../js/combat/linkage.js');
const {CombatSystem}=require('../js/combat.js');
const Attacks=require('../js/combat/attacks.js');
function game(){const ly={areaX:25,areaW:700,areaY:72,entryH:68,wallY:1000};const g={menuStage:'frost',state:'fighting',ly,enemies:[],fx:[],run:{wave:60,slotOrder:['fire','ice','electric','poison'],effects:{tower:()=>({level:1})}},combat:{}};g.wave={game:g,ly,_eid:1,plan:[]};assert.equal(Boss.setup(g.wave),true);const e={id:1,x:375,y:400,isBoss:true};g.enemies.push(e);Boss.spawn(g,e,B.id);return g;}
let g=game(),e=g.run.bossEnemy,q=g.run.bossEncounter;
assert.equal(e.hp,B.hp);assert.equal(e.immuneFreeze,true);assert.equal(e.isFinalBoss,true);
Boss.tick(g,10);assert.equal(Boss.attackScale(g,'fire'),1/1.3);Boss.tick(g,3);assert.equal(Boss.attackScale(g,'fire'),1);
e.hp=B.hp*.69;Boss.afterDamage(g,e);assert.equal(q.phase,2);assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,2);Boss.afterDamage(g,e);assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,2);
e.hp=B.hp*.39;Boss.afterDamage(g,e);assert.equal(q.phase,2);assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,4);
e.hp=B.hp*.34;Boss.afterDamage(g,e);assert.equal(q.phase,3);const t0=q.elapsed;Boss.tick(g,15);assert.equal(q.freezeTargets.length,2);assert.equal(new Set(q.freezeTargets).size,2);for(const k of q.freezeTargets)assert.equal(Boss.towerFrozen(g,k),false);
const targets=q.freezeTargets.slice();Boss.tick(g,.999);for(const k of targets)assert.equal(Boss.towerFrozen(g,k),false);Boss.tick(g,.001);for(const k of targets)assert.equal(Boss.towerFrozen(g,k),true);
const key=targets[0],timers={test:11};let existingEffectTime=0;
const combat={game:g,timers,tower:()=>({energy:50}),_weakPeriod(k){return Linkage._weakPeriod(this,k);}};
assert.equal(combat._weakPeriod(key),Infinity);
CombatSystem.prototype._tickPeriodicFor.call(combat,key,(c,dt)=>{c.timers.test+=dt;c.timers.created=1;existingEffectTime+=dt;assert.equal(c._weakPeriod(key),Infinity);},.5);
assert.equal(existingEffectTime,.5);assert.deepEqual(combat.timers,{test:11});assert.equal(combat.timers,timers);
// 普攻调度和直接施放均在读取目标/能量前退出。
assert.doesNotThrow(()=>Attacks.tickTower({game:g},key,.5));assert.doesNotThrow(()=>Attacks.attackOnce({game:g},key));
Boss.tick(g,4);for(const k of targets)assert.equal(Boss.towerFrozen(g,k),false);
const child={bossSummonId:B.id,speed:0};Boss.spawnSummon(g,child);assert.ok(Math.abs(child.speed-(1000-72-68)/40*2.2/1.5)<1e-9);
e.hp=0;assert.equal(Boss.onDeath(g,e),true);assert.equal(Boss.onDeath(g,e),false);for(const k of targets)assert.equal(Boss.towerFrozen(g,k),false);assert.equal(Boss.attackScale(g,key),1);
g=game();e=g.run.bossEnemy;e.hp=B.hp*.3;Boss.afterDamage(g,e);assert.deepEqual(g.run.bossEncounter.shadowsSent,[true,true]);assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,4);Boss.tick(g,16);assert.equal(Object.keys(g.run.bossEncounter.frozenUntil).length,2);Boss.tick(g,50);assert.ok(Number.isFinite(g.run.bossEncounter.elapsed));
console.log('Skall PASS: thresholds, shadow one-shot, suppression, unique targets, warning/freeze expiry, attack and cooldown gates, ongoing effects, final death');
