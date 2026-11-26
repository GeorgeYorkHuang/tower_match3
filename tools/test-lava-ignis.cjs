'use strict';
const assert=require('node:assert/strict');
const Boss=require('../js/bosses/index.js');
const Ignis=require('../js/bosses/lava-ignis.js');
const B=require('../js/config/boss-expansion.js').lava_ignis;
function game(){const ly={areaX:25,areaW:700,areaY:72,entryH:68,wallY:1000};const g={menuStage:'lava',state:'fighting',ly,enemies:[],fx:[],run:{wave:60,lineHp:2000,lineMaxHp:2000},combat:{onKill(e){e.killed=(e.killed||0)+1;}}};g.wave={game:g,ly,_eid:1,plan:[]};assert.equal(Boss.setup(g.wave),true);const e={id:1,x:375,y:400,isBoss:true};g.enemies.push(e);Boss.spawn(g,e,B.id);return g;}
let g=game(),e=g.run.bossEnemy;assert.equal(e.isFinalBoss,true);assert.equal(e.immuneFreeze,true);assert.equal(e.bossStandoffY,828);
Boss.tick(g,12);assert.equal(Boss.attackScale(g,'fire'),.8);Boss.tick(g,4);assert.equal(Boss.attackScale(g,'fire'),1);
e.hp=e.maxHp*.34;Boss.afterDamage(g,e);const q=g.run.bossEncounter;assert.equal(q.phase,3);assert.equal(g.wave.plan.length,1+B.adds.flat().length);const deadline=q.castEnd;
e.hp-=e.maxHp*.025;Boss.afterDamage(g,e);assert.equal(q.castEnd,deadline);e.hp-=e.maxHp*.025;Boss.afterDamage(g,e);assert.equal(q.interrupts,1);assert.equal(q.castEnd,Infinity);
Boss.tick(g,8);assert.ok(Number.isFinite(q.castEnd));assert.equal(q.castDamage,0);Boss.tick(g,8);assert.equal(g.run.lineHp,1500);
assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,5);Boss.tick(g,30);assert.ok(g.wave.plan.filter(p=>p.bossSummonId===B.id).length<=B.summonLimit);
g=game();e=g.run.bossEnemy;e.hp=e.maxHp*.3;Boss.afterDamage(g,e);g.run.adReviveProtection=10;Boss.tick(g,8);assert.equal(g.run.lineHp,2000);
const core={hp:1280,bossSummonId:B.id};g.run.adReviveProtection=0;assert.equal(Boss.coreAtWall(g,core),true);assert.equal(g.run.lineHp,1980);assert.equal(core.hp,0);assert.equal(core.killed,1);assert.equal(Boss.coreAtWall(g,core),false);assert.equal(g.run.lineHp,1980);
const deadCore={hp:0,bossSummonId:B.id};assert.equal(Boss.coreAtWall(g,deadCore),false);e.hp=0;Boss.afterDamage(g,e);assert.equal(Boss.onDeath(g,e),true);assert.equal(Boss.onDeath(g,e),false);assert.equal(Boss.defeated(g),true);assert.equal(Boss.attackScale(g,'fire'),1);
g=game();e=g.run.bossEnemy;e.hp=e.maxHp*.3;Boss.afterDamage(g,e);Boss.tick(g,40);assert.equal(g.run.lineHp,0);assert.equal(g.run.broken,true);
g=game();Boss.tick(g,100);assert.equal(g.run.bossEncounter.phase,1);assert.equal(g.wave.plan.filter(p=>p.bossSummonId===B.id).length,0);
console.log('Ignis lifecycle PASS: phase crossing, suppression, interrupt, countdown, spawn cap, wall/core damage, protection, death gate');
