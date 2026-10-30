'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js'),B=require('../js/config/tower-skills.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','05e4f30:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
function stable(value){return JSON.stringify(value,(key,v)=>key==='visual'||key==='projectile'?undefined:typeof v==='function'?'[callback]':v);}
function fixture(C,big,multi,branch,star){
 const c=Object.create(C.prototype),events=[],tower={energy:49};
 const e={id:1,hp:100000,x:0,y:100,dots:[]},near={id:2,hp:100000,x:50,y:100,dots:[]},edge={id:3,hp:100000,x:100,y:100,dots:[]},far={id:4,hp:100000,x:1000,y:100,dots:[]},dead={id:5,hp:0,x:10,y:100,dots:[]};
 const run={_forgeCount:4,_fireTripleNext:star===3&&branch%2===1,gsState:branch>1?{volley:{fire:true}}:{},relic3:()=>star===3,relicNum:id=>star?CONFIG.relicNum(id,star):0,armoryEnergyMax:()=>50,spendAttackEnergy:t=>{events.push(['spend']);t.energy-=1;}};
 c.game={run,enemies:[e,near,edge,far,dead],fx:[],playSfx:(...a)=>events.push(['sound',...a])};c.shots=[];
 c.lv=(key,name)=>key==='fire'&&((name==='大火球'&&big)||(name==='多重火球'&&multi))?1+branch:0;
 c.branchLv=(key,name)=>c.lv(key,name)>0?branch:0;c.relicVal=id=>star?CONFIG.relicNum(id,star):0;c.tower=()=>tower;c.towerMuzzle=()=>({x:0,y:300});c.range=()=>300;c.ly=()=>({});c.pickTarget=()=>e;c.inTowerRange=()=>true;
 c.shotDmg=(...a)=>{events.push(['shotDmg',...a]);return 100;};c.damage=(o,dmg,key)=>{events.push(['damage',o.id,dmg,key]);o.hp-=dmg;};
 c.tryAttackDebuff=(key,o,dmg)=>events.push(['debuff',key,o.id,dmg]);c.applyBurn=(o,dmg,key)=>{events.push(['burn',o.id,dmg,key]);o.dots.push({type:'burn'});};
 for(const name of ['fxFlash','fxParticle','fxRing'])c[name]=(...a)=>events.push([name,...a]);
 return {c,e,tower,events,snapshot:()=>({run,enemies:c.game.enemies,fx:c.game.fx,shots:c.shots,pillars:c.pillarWaves,tower,events})};
}
function execute(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
const methods=['_attackFireOnHit','_fireAttackOnAttack','hitFire','_fireMultiShot','_fireAttackHit','_fireSingleBlast','_fireImpact','attackOnce'];
let cases=0;
for(const big of [false,true])for(const multi of [false,true])for(const branch of [0,1,2,3])for(const star of [0,1,2,3])for(const seed of [12345,999])for(const method of methods){
 function run(C){const f=fixture(C,big,multi,branch,star),{c,e,events}=f;
  if(method==='attackOnce')c.attackOnce('fire');else if(method==='_fireAttackOnAttack')c[method]();else c[method](e,100,0.3);
  const primary=c.shots.slice();
  events.push(['initial',primary.length]);
  for(const shot of primary){if(shot.visual){assert.strictEqual(shot.visual.projectile,shot);assert.strictEqual(shot.visual, c.game.fx.find(v=>v.projectile===shot));}events.push(['frame',c.stepShot(shot,1)]);}
  // Run newly spawned fragment/bonus callbacks too, bounded to avoid recursively firing forever.
  for(const shot of c.shots.slice(primary.length,primary.length+12))events.push(['childFrame',c.stepShot(shot,1)]);
  return f.snapshot();
 }
 assert.equal(stable(execute(seed,()=>run(After))),stable(execute(seed,()=>run(Before))),JSON.stringify({big,multi,branch,star,seed,method}));cases++;
}
// The multi-shot replacement and per-attack hook stay independent of projectile count.
const f=fixture(After,false,true,0,0);f.c.attackOnce('fire');assert.equal(f.c.shots.length,B.fire['多重火球'].count);assert.equal(f.events.filter(e=>e[0]==='spend').length,1);assert.equal(f.c.game.run._forgeCount,5);
// A primary target dying between launches must not cancel a side projectile with another live target.
const side=f.c.shots[1],other=f.c.game.enemies[1];f.e.hp=0;const count=f.events.length;side.onHit(other,side.dmg);assert(f.events.slice(count).some(e=>e[0]==='damage'&&e[1]===other.id));
// Three hits set the next-triple flag; following hit launches 3 real, linked projectiles.
const rain=fixture(After,false,false,0,3);rain.c._attackFireOnHit(rain.e,100);rain.c._attackFireOnHit(rain.e,100);rain.c._attackFireOnHit(rain.e,100);assert.equal(rain.c.game.run._fireTripleNext,true);rain.c._attackFireOnHit(rain.e,100);assert.equal(rain.c.shots.length,3);assert(rain.c.shots.every(s=>s.scatter&&s.onHit&&s.visual.projectile===s));
// Split children consume on first collision via the unchanged shared stepShot/update contract.
const split=fixture(After,false,true,3,0);split.c._fireImpact(split.e,100,0);assert.equal(split.c.shots.length,B.fire['多重火球'].scatterSplit[3]);
const child=split.c.shots[2];let childHits=0;child.onHit=()=>childHits++;split.c.game.enemies=[{id:9,hp:1,x:child.sx,y:child.sy}];split.c.shots=[child];
for(let j=0;j<2;j++)for(let i=split.c.shots.length-1;i>=0;i--)if(!split.c.stepShot(split.c.shots[i],1))split.c.shots.splice(i,1);
assert.equal(childHits,1);assert.equal(split.c.shots.length,0);
const a=fixture(After,true,true,3,3),b=fixture(After,true,true,3,3),before=stable(b.snapshot());a.c._fireMultiShot(a.e,100);a.c.shots[0].onHit(a.e,100);assert.equal(stable(b.snapshot()),before);
console.log('PASS '+cases+' fire attack/impact scenarios vs fixed 7b14718: 7 migrated methods + attackOnce, branches/relic stars, RNG order, linked visuals, deferred child callbacks, independent targets and non-piercing split shots');
