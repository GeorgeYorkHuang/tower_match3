'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),B=require('../js/config/tower-skills.js').cannon;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','1ce9fe7:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random,names=['炮火支援','地雷阵','炮台'];
function fixture(C,mask,level,axis,relic,weak,mode){
 const c=Object.create(C.prototype),events=[],tower={energy:weak?0:50};
 const enemies=mode==='empty'?[]:[{id:1,x:250,y:400,hp:mode==='low'?40:1e6},{id:2,x:300,y:430,hp:1e6},{id:3,x:700,y:450,hp:1e6},{id:9,x:250,y:440,hp:0}];
 if(mode==='out')enemies.forEach(e=>e.y=2000);
 c.game={run:{relic3:id=>relic&&id!=='can_minefield',armoryEnergyMax:()=>50},enemies,fx:[],ly:{areaY:0,entryH:20,wallY:500}};
 c.shots=[];c.delayed=[];c.mines=[];c.turrets=[];c.timers={support:B['炮火支援'].period*(weak?1.5:1)-0.01,mine:B['地雷阵'].period*(weak?1.5:1)-0.01,turret:Math.max(B['炮台'].minPeriod,B['炮台'].period-B['炮台'].periodReductionPerBranch*(axis==='B'?level:0))*(weak?1.5:1)-0.01};
 c.lv=(key,name)=>key==='cannon'&&(mask&(1<<names.indexOf(name)))?level+1:0;c.branchLv=(key,name,a)=>c.lv(key,name)&&a===axis?level:0;
 c.tower=()=>tower;c._weakPeriod=()=>tower.energy<=0?1.5:1;c.ly=()=>c.game.ly;c.range=()=>400;c.towerMuzzle=()=>({x:375,y:550});c.inTowerRange=(key,x,y)=>Math.abs(550-y)<=400;
 c.power=100;c.shotDmg=(...args)=>{events.push(['shotDmg',...args,c.power]);return c.power;};c.castEnergy=(...args)=>{events.push(['cast',...args]);tower.energy=Math.max(0,tower.energy-1);};
 c.damage=(e,dmg,key)=>{events.push(['damage',e.id,dmg,key]);if(e.hp>0)e.hp-=dmg;};
 c.explode=(x,y,r,dmg,key,...args)=>{events.push(['explode',x,y,r,dmg,key,...args]);enemies.forEach(e=>{if(e.hp>0&&Math.hypot(e.x-x,e.y-y)<=r)c.damage(e,dmg,key);});};
 for(const name of ['fxFlash','fxParticle','fxRing','fxBeam'])c[name]=(...args)=>events.push([name,...args]);
 return {c,tower,events,snapshot:()=>({enemies,tower,events,fx:c.game.fx,timers:c.timers,mines:c.mines,turrets:c.turrets,delayed:c.delayed,shots:c.shots,ground:c.groundDots})};
}
function seeded(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return JSON.stringify({out:fn(),rng:n},(k,v)=>typeof v==='function'?'[callback]':v);}finally{Math.random=originalRandom;}}
let count=0;
for(const mask of [0,1,2,4,7])for(const level of [0,1,2,3])for(const axis of ['A','B','C'])for(const relic of [false,true])for(const weak of [false,true])for(const mode of ['alive','empty','out','low'])for(const seed of [1,12345]){
 function go(C){const f=fixture(C,mask,level,axis,relic,weak,mode),{c}=f;
  for(const [i,dt] of [0.005,0.01,0.2,0.3,0.8,1,2,4,20].entries()){
   c.updateDelayed(dt);c.updateMines(dt);c.updateTurrets(dt);c.tickCannon(dt);
   // Exercise generated shard closures against the same live target after entity advancement.
   for(const s of c.shots){const target=c.game.enemies.find(e=>e.hp>0);if(target&&s.onHit)s.onHit(target,s.dmg);}c.shots=[];
   if(i===1)c.power=500;
  }return f.snapshot();}
 assert.equal(seeded(seed,()=>go(After)),seeded(seed,()=>go(Before)),JSON.stringify({mask,level,axis,relic,weak,mode,seed}));count++;
}
function mine(x,extra={}){return {x,y:400,r:100,dmg:100,ttl:20,armed:0,chain:0,...extra};}
// Specific lifecycle fixtures use old and new implementations, including resonance without live array ambiguity.
let entities=0;
for(const scenario of ['flight','arming','expiry','resonance','shards','turret-expiry','turret-shot','turret-empty'])for(const dt of [0.01,0.3,1,21]){
 function go(C){const f=fixture(C,7,3,'C',true,false,'alive'),{c}=f;
  c.game.run.relic3=id=>scenario==='resonance'?id==='can_minefield':true;
  if(scenario==='flight')c.mines=[mine(250,{fly:{sx:250,sy:500,tx:250,ty:400,t:0}})];
  if(scenario==='arming')c.mines=[mine(250,{armed:0.3})];
  if(scenario==='expiry')c.mines=[mine(600,{ttl:0.1})];
  if(scenario==='resonance'){c.game.enemies=[{id:1,x:190,y:400,hp:1e6}];c.mines=[mine(250),mine(330,{armed:10}),mine(410,{armed:10})];}
  if(scenario==='shards')c.mines=[mine(250,{chain:3})];
  if(scenario.startsWith('turret')){c.turrets=[{x:100,y:300,ttl:scenario==='turret-expiry'?0.1:30,atkT:0.99,atkI:1,dmg:70,r:100},{x:120,y:300,ttl:30,atkT:0,atkI:1,dmg:70,r:100}];c.game.fx=[{type:'turret',x:100,y:300,t:2}];if(scenario==='turret-empty')c.game.enemies=[];}
  c.updateMines(dt);c.updateTurrets(dt);for(const s of c.shots)if(s.onHit&&c.game.enemies[0])s.onHit(c.game.enemies[0],s.dmg);return f.snapshot();}
 assert.equal(seeded(999,()=>go(After)),seeded(999,()=>go(Before)),scenario+' '+dt);entities++;
}
const flight=fixture(After,0,0,'A',false,false,'alive');flight.c.mines=[mine(250,{fly:{sx:250,sy:500,tx:250,ty:400,t:0}})];flight.c.updateMines(0.2);assert.equal(flight.c.mines.length,1);assert.equal(flight.c.mines[0].armed,0.3);assert(!flight.events.some(e=>e[0]==='explode'));flight.c.updateMines(0.31);assert.equal(flight.c.mines.length,0);
const empty=fixture(After,7,0,'A',false,false,'empty');empty.c.tickCannon(0.02);assert.equal(empty.c.delayed.length,0);assert.equal(empty.c.turrets.length,0);assert(empty.c.mines.length>0);assert.equal(empty.events.filter(e=>e[0]==='cast').length,3);
const snapshot=fixture(After,4,0,'A',false,false,'alive');snapshot.c.tickCannon(0.02);const dmg=snapshot.c.turrets[0].dmg;snapshot.c.power=900;snapshot.c.updateTurrets(1.01);assert(snapshot.events.some(e=>e[0]==='damage'&&e[2]===dmg));
const a=fixture(After,7,3,'C',true,false,'alive'),b=fixture(After,7,3,'C',true,false,'alive'),before=JSON.stringify(b.snapshot());a.c.tickCannon(0.02);assert.equal(JSON.stringify(b.snapshot()),before);
// Support impacts retain launch-time damage and cannot settle before the landing timestamp.
const support=fixture(After,1,0,'A',false,false,'alive');support.c.tickCannon(0.02);const launchDamage=support.c.delayed[0].dmg;support.c.power=900;support.c.updateDelayed(1.29);assert(!support.events.some(e=>e[0]==='explode'));support.c.updateDelayed(0.02);assert.equal(support.events.find(e=>e[0]==='explode')[4],launchDamage);
const refund=fixture(After,0,0,'A',true,false,'alive');refund.tower.energy=49;refund.c.turrets=[{ttl:0.1}];refund.c.updateTurrets(0.2);assert.equal(refund.tower.energy,50);assert.equal(refund.c.turrets.length,0);
a.c.reset();assert.equal(a.c.mines.length,0);assert.equal(a.c.turrets.length,0);assert.equal(a.c.delayed.length,0);assert.equal(a.c.shots.length,0);assert(!a.c.game.fx.some(f=>f.type==='mine'||f.type==='turret'));
console.log('PASS '+count+' cannon periodic multi-frame scenarios + '+entities+' entity lifecycles vs fixed 1ce9fe7; timers, energy, snapshots, callbacks, delay/RNG/effects and isolated contexts');
