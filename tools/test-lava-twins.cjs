'use strict';
const assert=require('node:assert/strict');
const Boss=require('../js/bosses/index.js');
const CONFIG=require('../js/config.js');
function game(){const ly={areaX:25,areaW:700,areaY:72,entryH:68,wallY:1000};let grants=0;
const g={menuStage:'lava',state:'fighting',ly,enemies:[],fx:[],run:{wave:40,slotOrder:['fire','ice','poison','electric','boomerang','cannon'],effects:{tower:()=>({level:1})}},combat:{towerMuzzle:()=>({x:375,y:1100})},meta:{grantDeepChest:()=>{grants++;return true;}},save:{save(){}},toast(){}};
g.wave={game:g,ly,_eid:1,plan:[],pushEnemy(hp,y){g.enemies.push({id:++this._eid,hp,maxHp:hp,x:375,y,isBoss:true,type:'boss',waveNo:40});}};g.grants=()=>grants;assert.equal(Boss.setup(g.wave),true);const e={id:1,hp:1,x:375,y:400,isBoss:true,type:'boss',waveNo:40};g.enemies.push(e);Boss.spawn(g,e,'lava_twins');return g;}
let g=game(),e=g.enemies[0];assert.equal(e.hp,84000);assert.equal(g.run.bossLock,true);
Boss.tick(g,10);for(const k of g.run.slotOrder)assert.ok(Math.abs(Boss.attackScale(g,k)-.92)<1e-9);Boss.tick(g,3);assert.equal(Boss.attackScale(g,'fire'),1);
const phase=Boss.transition(g,e,40000);assert.equal(phase.damage,33600);assert.equal(phase.overflow,6400);
const twins=Boss.split(g,e);assert.equal(twins.length,2);assert.equal(e._bossRetired,true);assert.equal(Boss.split(g,e).length,0);
assert.equal(twins[0].hp,25200);for(const t of twins)t.hp-=phase.overflow/2;assert.equal(twins[0].hp,22000);
Boss.tick(g,30);assert.equal(g.run.bossEncounter.resonanceStacks,3);for(const t of twins){assert.ok(Math.abs(t.armor-.325)<1e-9);assert.equal(t.hp,22000);assert.equal(t.attack,411);}
Boss.tick(g,20);assert.equal(g.run.bossEncounter.resonanceStacks,3);twins[0].hp=0;assert.equal(Boss.onDeath(g,twins[0]),false);assert.equal(Boss.defeated(g),false);
Boss.tick(g,8);twins[1].hp=0;assert.equal(Boss.onDeath(g,twins[1]),true);assert.equal(Boss.defeated(g),true);assert.equal(g.grants(),1);assert.equal(Boss.onDeath(g,twins[1]),false);assert.equal(g.grants(),1);
g=game();e=g.enemies[0];const pair=Boss.split(g,e);pair[0].hp=0;Boss.onDeath(g,pair[0]);pair[1].hp=10000;Boss.tick(g,8.01);assert.equal(pair[1].hp,13780);Boss.tick(g,1);assert.equal(pair[1].hp,13780);pair[1].hp=0;assert.equal(Boss.onDeath(g,pair[1]),true);assert.equal(g.grants(),0);
console.log('Carlos lifecycle: suppression, overflow, split, armor cap, no regen, sync reward, timeout PASS');
