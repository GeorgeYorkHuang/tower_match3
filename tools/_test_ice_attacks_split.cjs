'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js'),B=require('../js/config/tower-skills.js').ice;
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','37d32c5:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem,originalRandom=Math.random;
function stable(value){return JSON.stringify(value,(key,v)=>key==='visual'||key==='projectile'?undefined:typeof v==='function'?'[callback]':v);}
function fixture(C,mask,branch,star){
 const c=Object.create(C.prototype),events=[],tower={energy:49};
 const e={id:1,hp:100000,x:0,y:100,dots:[],slow:star?{mult:0.7,ttl:1}:null},enemies=[e,...[[-5,70],[0,50],[20,60],[100,80],[0,350]].map(([x,y],i)=>({id:i+2,hp:100000,x,y,dots:[],slow:{mult:0.7,ttl:1}})),{id:9,hp:0,x:0,y:90,dots:[]}];
 enemies.forEach(o=>{o.hitCount=0;o.frozen=0;});
 const skills=['多重冰锥','碎冰','冰穿刺'];
 const run={gsState:branch>1?{volley:{ice:true}}:{},relic3:()=>star===3,relicNum:id=>star?CONFIG.relicNum(id,star):0,armoryEnergyMax:()=>50,spendAttackEnergy:t=>{events.push(['spend']);t.energy-=1;}};
 c.game={run,enemies,fx:[],playSfx:(...a)=>events.push(['sound',...a])};c.shots=[];c.iceGrounds=[];
 c.lv=(key,name)=>key==='ice'&&skills.some((n,i)=>name===n&&(mask&(1<<i)))?branch+1:0;c.branchLv=(key,name)=>c.lv(key,name)>0?branch:0;
 c.relicVal=id=>star?CONFIG.relicNum(id,star):0;c.tower=()=>tower;c.towerMuzzle=()=>({x:0,y:300});c.range=()=>300;c.ly=()=>({});c.pickTarget=()=>e;c.inTowerRange=(key,x,y)=>y<300;
 c.shotDmg=(...a)=>{events.push(['shotDmg',...a]);return 100;};c.damage=(o,dmg,key)=>{events.push(['damage',o.id,dmg,key]);o.hp-=dmg;};
 c.tryAttackDebuff=(key,o,dmg)=>{events.push(['debuff',key,o.id,dmg]);o.slow={mult:0.7,ttl:1};};
 c.explode=(...a)=>events.push(['explode',...a]);
 for(const name of ['fxFlash','fxParticle','fxRing'])c[name]=(...a)=>events.push([name,...a]);
 return {c,e,tower,events,snapshot:()=>({run,enemies:c.game.enemies,fx:c.game.fx,shots:c.shots,iceGrounds:c.iceGrounds,tower,events})};
}
function execute(seed,fn){let n=0;Math.random=()=>{n++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};try{return {out:fn(),n};}finally{Math.random=originalRandom;}}
let cases=0;
for(const mask of [0,1,2,3,4,5,6,7])for(const branch of [0,1,2,3])for(const star of [0,1,2,3])for(const seed of [12345,999])for(const method of ['_iceMultiShot','hitIce','iceHitFx','attackOnce']){
 function run(C){const f=fixture(C,mask,branch,star),{c,e,events}=f;
  if(method==='attackOnce')c.attackOnce('ice');else c[method](e,100);
  const initial=c.shots.slice();events.push(['initial',initial.length]);
  for(const shot of initial){if(shot.visual)assert.strictEqual(shot.visual.projectile,shot);events.push(['frame',c.stepShot(shot,1)]);}
  for(const shot of c.shots.slice(initial.length,initial.length+12))events.push(['childFrame',c.stepShot(shot,1)]);
  return f.snapshot();
 }
 assert.equal(stable(execute(seed,()=>run(After))),stable(execute(seed,()=>run(Before))),JSON.stringify({mask,branch,star,seed,method}));cases++;
}
// No premature damage, no extra normal ice shot, one energy spend per attack.
const m=fixture(After,1,0,0);m.c.attackOnce('ice');assert.equal(m.c.shots.length,B['多重冰锥'].count);assert.equal(m.events.filter(e=>e[0]==='spend').length,1);assert(!m.events.some(e=>e[0]==='damage'));
const side=m.c.shots[1],other=m.c.game.enemies[1];m.e.hp=0;const prev=m.events.length;side.onHit(other,side.dmg);assert(m.events.slice(prev).some(e=>e[0]==='damage'&&e[1]===other.id));
// Swarm uses independent target directions, emits expected count, and falls back to the supplied target if no candidate.
const swarm=fixture(After,1,3,0);swarm.c._iceMultiShot(swarm.e,100);assert.equal(swarm.c.shots.length,B['多重冰锥'].swarm[3]+3);assert(swarm.c.shots.every(s=>s.scatter&&s.onHit));assert(new Set(swarm.c.shots.map(s=>s.tx+','+s.ty)).size>1);assert(!swarm.events.some(e=>e[0]==='damage'));
const fallback=fixture(After,1,1,0);fallback.c.game.enemies=[];fallback.c._iceMultiShot(fallback.e,100);assert(fallback.c.shots.every(s=>s.tx===fallback.e.x&&s.ty===fallback.e.y));
// Fragments are not piercing projectiles; the ice-pierce skill remains a separate instant effect.
const frag=fixture(After,2,0,0);frag.c.hitIce(frag.e,100);assert.equal(frag.c.shots.length,B['碎冰'].count);
const child=frag.c.shots[1];let hits=0;child.onHit=()=>hits++;frag.c.game.enemies=[{hp:1,x:child.sx,y:child.sy}];frag.c.shots=[child];
for(let j=0;j<2;j++)for(let i=frag.c.shots.length-1;i>=0;i--)if(!frag.c.stepShot(frag.c.shots[i],1))frag.c.shots.splice(i,1);
assert.equal(hits,1);assert.equal(frag.c.shots.length,0);
const a=fixture(After,7,3,3),b=fixture(After,7,3,3),snapshot=stable(b.snapshot());a.c.hitIce(a.e,100);a.c.shots[0].onHit(a.e,100);assert.equal(stable(b.snapshot()),snapshot);
console.log('PASS '+cases+' ice attack/impact scenarios vs fixed 37d32c5: multi/swarm/shard/pierce, branches and relic stars, RNG order, delayed impacts, control effects and isolated callbacks');
