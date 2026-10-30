'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),B=require('../js/config/tower-skills.js').electric;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','c790ce5:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
const names=['极光电击','雷暴'];
function fixture(C,skills,branch,relics,weak,mode,ready=true){
 const c=Object.create(C.prototype),events=[],tower={energy:weak?0:50};
 const enemies=mode==='empty'?[]:Array.from({length:13},(_,i)=>({id:i+1,x:i*20,y:200+i*10,hp:mode==='low'?50:100000+i*100,dots:[],paralyzed:i%2?1:0}));
 if(mode==='out')enemies.forEach(e=>e.y+=2000);enemies.push({id:99,x:0,y:500,hp:0,dots:[]});
 c.game={run:{relic3:id=>relics==='all'||relics===id,_elecPulseTtl:0.25},enemies,fx:[]};
 c.timers={arc:ready?B['极光电击'].period*(weak?1.5:1)-0.01:0,storm:ready?(B['雷暴'].period-B['雷暴'].periodReductionPerBranch*branch)*(weak?1.5:1)-0.01:0};
 c.lv=(key,name)=>skills.includes(name)?branch+1:0;c.branchLv=()=>branch;c._weakPeriod=()=>tower.energy<=0?1.5:1;c.towerMuzzle=()=>({x:0,y:500});c.range=()=>300;c.inTowerRange=(key,x,y)=>Math.abs(500-y)<=300;
 c.power=100;c.shotDmg=(...a)=>{events.push(['shotDmg',...a,c.power]);return c.power;};c.castEnergy=(...a)=>{events.push(['cast',...a]);tower.energy=Math.max(0,tower.energy-1);};
 c.damage=(e,dmg,key)=>{events.push(['damage',e.id,dmg,key]);if(e.hp>0)e.hp-=dmg;};c.applySlow=(e,mult,ttl)=>{events.push(['slow',e.id,mult,ttl]);e.slow={mult:1-mult,ttl};};
 for(const name of ['fxFlash','fxParticle','fxRing','fxBeam'])c[name]=(...a)=>events.push([name,...a]);
 return {c,events,tower,snapshot:()=>({timers:c.timers,run:c.game.run,enemies:c.game.enemies,fx:c.game.fx,events,tower})};
}
function rng(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
let cases=0;
for(const skills of [[],[names[0]],[names[1]],names])for(const branch of [0,1,2,3])for(const relic of ['none','all','elec_super','elec_chain','elec_domain','elec_storm'])for(const weak of [false,true])for(const mode of ['alive','empty','out','low'])for(const seed of [12345,999]){
 function go(C){const f=fixture(C,skills,branch,relic,weak,mode);for(const [i,dt] of [0.005,0.01,0.2,0.5,2,20].entries()){f.c.tickElectric(dt);if(i===1)f.c.power=500;}return f.snapshot();}
 assert.equal(JSON.stringify(rng(seed,()=>go(After))),JSON.stringify(rng(seed,()=>go(Before))),JSON.stringify({skills,branch,relic,weak,mode,seed}));cases++;
}
// Forks stay unique, including secondary re-forks; no duplicate target damage within one arc cast.
const arc=fixture(After,[names[0]],3,'all',false,'alive');arc.c.tickElectric(0.02);const ids=arc.events.filter(e=>e[0]==='damage').map(e=>e[1]);assert.equal(new Set(ids).size,ids.length);
// Main arc preserves the existing vertical-distance rule, even for a horizontally distant enemy.
const vertical=fixture(After,[names[0]],0,'none',false,'alive');vertical.c.game.enemies=[{id:1,x:10000,y:499,hp:1000},{id:2,x:0,y:200,hp:1000}];vertical.c.tickElectric(0.02);assert.equal(vertical.events.find(e=>e[0]==='damage')[1],1);
// Storm damage is immediate; only its visual is batched. Preserve this timing difference.
const storm=fixture(After,[names[1]],3,'none',false,'alive');storm.c.tickElectric(0.02);assert(storm.events.some(e=>e[0]==='damage'));const fx=storm.c.game.fx.filter(f=>f.kind==='storm');assert(fx.some(f=>f.delay>0));assert(fx.every(f=>f.t===0));
// Highest-HP selection for domain excludes dead enemies; empty target still consumes the cast.
const domain=fixture(After,[names[1]],0,'elec_domain',false,'alive');domain.c.tickElectric(0.02);const selected=domain.c.game.fx.filter(f=>f.kind==='storm').map(f=>f.y);assert.deepEqual(selected,[300,310,320]);
const empty=fixture(After,names,0,'none',false,'empty');empty.c.tickElectric(0.02);assert.equal(empty.events.filter(e=>e[0]==='cast').length,2);assert(!empty.events.some(e=>e[0]==='damage'));
const pulse=fixture(After,[],0,'none',false,'empty');pulse.c.tickElectric(0.5);assert.equal(pulse.c.game.run._elecPulseTtl,-0.25);
const a=fixture(After,names,3,'all',false,'alive'),b=fixture(After,names,3,'all',false,'alive'),before=JSON.stringify(b.snapshot());a.c.tickElectric(0.02);assert.equal(JSON.stringify(b.snapshot()),before);
console.log('PASS '+cases+' multi-frame electric periodic scenarios vs fixed c790ce5: forks/re-forks, storm selection/batches, pulse timer, costs, RNG/effects, deaths and isolated contexts');
