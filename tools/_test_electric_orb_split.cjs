'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js'),B=require('../js/config/tower-skills.js').electric;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','1817bd1:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
function stable(x){return JSON.stringify(x,(key,v)=>['visual','projectile','ref'].includes(key)?undefined:typeof v==='function'?'[callback]':v);}
const skillNames=['过载','活电','连锁','麻痹','电磁场','充能'];
function fixture(C,mask,branch,star,empty=false){
 const c=Object.create(C.prototype),events=[],tower={energy:49,_chargeLayers:14};
 const e={id:1,hp:100000,x:0,y:100,dots:[],paralyzed:branch%2?1:0,overload:{n:2,ttl:1,_burst:branch===3},_ovDbl:branch%2===1,hitCount:0};
 const enemies=empty?[e]:[e,...[[20,100],[40,100],[60,110],[80,110],[100,100],[0,500]].map(([x,y],i)=>({id:i+2,hp:100000,x,y,dots:[],paralyzed:0,hitCount:0})),{id:99,hp:0,x:1,y:100,dots:[]}];
 const run={slotOrder:['electric'],gsState:branch>1?{volley:{electric:true}}:{},relic3:()=>star===3,relicNum:id=>star?CONFIG.relicNum(id,star):0,armoryEnergyMax:()=>50,spendAttackEnergy:t=>{events.push(['spend']);t.energy-=1;}};
 c.game={run,enemies,fx:[],ly:{areaX:-300,areaW:600,areaY:0,areaH:1000,wallY:300},playSfx:(...a)=>events.push(['sound',...a])};c.shots=[];c.atkTimers={electric:0.5};c.kills={};
 c.lv=(key,name)=>key==='electric'&&skillNames.some((n,i)=>n===name&&(mask&(1<<i)))?branch+1:0;c.branchLv=(key,name)=>c.lv(key,name)>0?branch:0;
 c.relicVal=id=>star?CONFIG.relicNum(id,star):0;c.tower=()=>tower;c.towerMuzzle=()=>({x:0,y:300});c.range=()=>300;c.ly=()=>c.game.ly;c.pickTarget=()=>e;c.interval=()=>1;
 c.shotDmg=(...a)=>{events.push(['shotDmg',...a]);return 100;};c.damage=(o,dmg,key)=>{events.push(['damage',o.id,dmg,key]);if(o.hp<=0)return;o.hp-=dmg;if(o.hp<=0&&!o._dying){o._dying=true;c.kills[key]=(c.kills[key]||0)+1;events.push(['death',o.id]);}};
 for(const key of ['Fire','Ice','Poison','Cannon','Boomerang'])c['hit'+key]=(o,dmg)=>events.push(['otherHit',key,o.id,dmg]);
 c.applySlow=(o,mult,ttl)=>{events.push(['slow',o.id,mult,ttl]);o.slow={mult:1-mult,ttl};};
 for(const key of ['fxBeam','fxFlash','fxParticle','fxRing'])c[key]=(...a)=>events.push([key,...a]);
 return {c,e,events,tower,snapshot:()=>({run,enemies,fx:c.game.fx,shots:c.shots,ground:c.groundDots,atk:c.atkTimers,tower,events,kills:c.kills})};
}
function execute(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
let cases=0;
for(const mask of [0,1,2,4,8,16,32,7,31,63])for(const branch of [0,1,2,3])for(const star of [0,1,2,3])for(const seed of [12345,999])for(const method of ['hitElectric','tryAttackDebuff','hit','attackOnce']){
 function go(C){const f=fixture(C,mask,branch,star),{c,e,events}=f;
  if(method==='hitElectric'){c.hitElectric(e,100);c.hitElectric(e,100);}
  else if(method==='tryAttackDebuff')c.tryAttackDebuff('electric',e,100);
  else if(method==='hit')c.hit('electric',e,100);
  else c.attackOnce('electric');
  const initial=c.shots.slice();events.push(['initial',initial.length]);
  for(const shot of initial)events.push(['step',c.stepShot(shot,0.3)]);
  for(const shot of c.shots.slice(initial.length,initial.length+12))events.push(['childStep',c.stepShot(shot,0.3)]);
  return f.snapshot();}
 assert.equal(stable(execute(seed,()=>go(After))),stable(execute(seed,()=>go(Before))),JSON.stringify({mask,branch,star,seed,method}));cases++;
}
let cross=0;
for(const key of Object.keys(CONFIG.TOWERS))for(const empty of [false,true])for(const seed of [12345,999]){
 function go(C){const f=fixture(C,63,3,3,empty);f.c.hit(key,f.e,100);return f.snapshot();}
 assert.equal(stable(execute(seed,()=>go(After))),stable(execute(seed,()=>go(Before))));cross++;
}
// Explicit order: C overcharge burst happens before A consumes stacks, and energy is capped.
const over=fixture(After,1,3,0);over.e.paralyzed=1;over.e.overload._burst=false;over.c.hitElectric(over.e,100);assert.equal(over.e.overload.n,0);assert.equal(over.tower.energy,50);assert(over.events.filter(e=>e[0]==='damage').length>2);
// No repeated chain target; chain cooldown refund remains clamped to zero.
const chain=fixture(After,4,3,0);chain.c.hitElectric(chain.e,100);const damaged=chain.events.filter(e=>e[0]==='damage').map(e=>e[1]);assert.equal(new Set(damaged).size,damaged.length);assert(chain.c.atkTimers.electric>=0);
// Strong paralysis failure branch (at high probability) still grants the original short paralysis.
const strong=fixture(After,8,3,3);const save=Math.random;try{Math.random=()=>0.99;strong.c.tryAttackDebuff('electric',strong.e,100);}finally{Math.random=save;}assert(strong.e.paralyzed>=0.5);
// Separate instances retain independent orb lists, energy, counters and enemy statuses.
const a=fixture(After,63,3,3),b=fixture(After,63,3,3),before=stable(b.snapshot());a.c.hit('electric',a.e,100);assert.equal(stable(b.snapshot()),before);
console.log('PASS '+cases+' electric attack/debuff scenarios + '+cross+' cross-tower field cases vs fixed 1817bd1: overload order, chain decay, paralysis spread, orb steps, RNG order and isolated contexts');
let orbCases=0;
for(const start of [-1,0,0.9,1])for(const dt of [0,0.01,0.2,2])for(const near of [false,true])for(const star of [0,3])for(const seed of [12345,999]){
 function orbGo(C){const f=fixture(C,63,3,star),s={orb:true,key:'electric',t:start,dur:1,x:near?0:10000,y:100,ang:0,speed:100,dmg:100,fx:{t:0,dur:1}};const keep=f.c.stepShot(s,dt);return {keep,s,state:f.snapshot()};}
 assert.equal(stable(execute(seed,()=>orbGo(After))),stable(execute(seed,()=>orbGo(Before))));orbCases++;
}
console.log('PASS '+orbCases+' explicit orb delay/hit/miss/expiry frames vs fixed 1817bd1');
