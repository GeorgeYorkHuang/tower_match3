'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),B=require('../js/config/tower-skills.js').fire;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','fc502b4:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
const skillNames=['火柱','烈焰墙','火雨'];
function fixture(C,skills,branch,star,weak,enemyMode,ready=true){
 const c=Object.create(C.prototype),events=[],tower={energy:weak?0:50};
 const enemies=enemyMode==='empty'?[]:[{id:1,hp:100000,x:0,y:200,dots:[]},{id:2,hp:100000,x:20,y:210,dots:[]},{id:3,hp:100000,x:0,y:260,dots:[]},{id:4,hp:0,x:0,y:200,dots:[]}];
 if(enemyMode==='out')enemies.forEach(e=>e.y+=1000);
 c.game={run:{relic3:()=>star,_burnallTtl:0},enemies,fx:[]};c.timers={firePillar:ready?B['火柱'].period*(weak?1.5:1)-0.01:0,fireWall:ready?B['烈焰墙'].period*(weak?1.5:1)-0.01:0,fireRain:ready?B['火雨'].period*(weak?1.5:1)-0.01:0};
 c.lv=(key,name)=>skills.includes(name)?branch+1:0;c.branchLv=()=>branch;c.tower=()=>tower;c._weakPeriod=()=>tower.energy<=0?1.5:1;
 c.power=100;c.shotDmg=(...a)=>{events.push(['shotDmg',...a,c.power]);return c.power;};
 c.castEnergy=(...a)=>{events.push(['cast',...a]);tower.energy=Math.max(0,tower.energy-1);};
 c.inTowerRange=(key,x,y)=>y<=240;
 c.damage=(e,dmg,key)=>{events.push(['damage',e.id,dmg,key]);e.hp-=dmg;};
 c.explode=(...a)=>events.push(['explode',...a]);c.applyBurn=(e,dmg,key)=>{events.push(['burn',e.id,dmg,key]);e.dots.push({type:'burn'});};
 for(const name of ['fxFlash','fxParticle','fxRing'])c[name]=(...a)=>events.push([name,...a]);
 return {c,events,tower,snapshot:()=>({timers:c.timers,pillars:c.pillarWaves,walls:c.fireWalls,rain:c.rainWaves,ground:c.groundDots,run:c.game.run,enemies:c.game.enemies,fx:c.game.fx,events,tower})};
}
function seeded(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
let cases=0;
for(const skills of [[],...skillNames.map(x=>[x]),skillNames])for(const branch of [0,1,2,3])for(const star of [false,true])for(const weak of [false,true])for(const mode of ['alive','empty','out'])for(const seed of [12345,999]){
 function go(C){const f=fixture(C,skills,branch,star,weak,mode);for(const [i,dt] of [0.005,0.01,0.1,0.5,0.9,2,4].entries()){f.c.tickFire(dt);if(i===1)f.c.power=200;}return f.snapshot();}
 assert.equal(JSON.stringify(seeded(seed,()=>go(After))),JSON.stringify(seeded(seed,()=>go(Before))),JSON.stringify({skills,branch,star,weak,mode,seed}));cases++;
}
let queued=0;
// Existing queues: death/movement after cast, removal of skills and re-casting while old wall is active.
for(const enabled of [false,true])for(const dt of [0.001,0.2,0.6,10])for(const star of [false,true]){
 function go(C){const f=fixture(C,enabled?skillNames:[],3,star,false,'alive',false),e=f.c.game.enemies[0];
  f.c.pillarWaves=[{t:0.2,x:0,y:200,r:120,dmg:77,ember:3,e},{t:1,x:0,y:200,r:120,dmg:88,ember:0,e}];
  f.c.fireWalls=[{x:0,y:200,w:200,h:100,ttl:0.3,cLv:3,tick:0},{x:0,y:200,w:200,h:100,ttl:3,cLv:1,tick:0.1}];
  f.c.rainWaves=[{t:0.2,px:0,py:200,r:120,dmg:66,skyfire:false},{t:0.2,px:0,py:200,r:120,dmg:99,skyfire:true}];
  e.hp=0;e.y=800;f.c.tickFire(dt);return f.snapshot();}
 assert.equal(JSON.stringify(seeded(12345,()=>go(After))),JSON.stringify(seeded(12345,()=>go(Before))));queued++;
}
// Cast frame wall TTL stays intact; normal rain and pillar use cast snapshot, ember/skyfire keep current-damage semantics.
const wall=fixture(After,['烈焰墙'],0,false,false,'alive');wall.c.tickFire(0.02);assert.equal(wall.c.fireWalls[0].ttl,B['烈焰墙'].duration);wall.c.tickFire(0.1);assert.equal(wall.c.fireWalls[0].ttl,B['烈焰墙'].duration-0.1);
const pillar=fixture(After,['火柱'],1,true,false,'alive');pillar.c.tickFire(0.02);const stored=pillar.c.pillarWaves[0].dmg;pillar.c.power=1000;pillar.c.tickFire(0.7);assert(pillar.events.some(e=>e[0]==='explode'&&e[4]===stored));assert.equal(pillar.c.pillarWaves.length,0);assert.equal(pillar.c.groundDots[0].dps,1000*B['火柱'].emberDamagePerBranch);
const rain=fixture(After,['火雨'],0,false,false,'alive');rain.c.tickFire(0.02);assert.equal(rain.c.rainWaves.length,B['火雨'].baseWaves);const snapshotDamage=rain.c.rainWaves[0].dmg;rain.c.power=1000;rain.c.tickFire(0.7);assert(rain.events.some(e=>e[0]==='damage'&&e[2]===snapshotDamage));
const noTarget=fixture(After,skillNames,0,true,false,'empty');noTarget.c.tickFire(0.02);assert.equal(noTarget.events.filter(e=>e[0]==='cast').length,3);assert.equal(noTarget.c.game.run._burnallTtl,3);
const a=fixture(After,skillNames,3,true,false,'alive'),b=fixture(After,skillNames,3,true,false,'alive'),snapshot=JSON.stringify(b.snapshot());a.c.tickFire(0.02);assert.equal(JSON.stringify(b.snapshot()),snapshot);
console.log('PASS '+cases+' multi-frame fire periodic scenarios + '+queued+' existing-queue cases vs fixed fc502b4: timing, costs, snapshots, delay, wall lifetime, RNG/effects and independent contexts');
