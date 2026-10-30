'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','5e6046f:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem;
function combat(C,enemies=[]){
 const c=Object.create(C.prototype),events=[];c.game={enemies,fx:[],run:{}};c.shots=[];c.hit=(key,e,dmg)=>events.push(['hit',key,e.id,dmg]);return {c,events};
}
let geometry=0;
for(const line of [[0,0,200,0],[100,100,100,-100],[100,200,-50,0],[10,10,10,10]])for(const t of [-0.2,0,0.1,0.5,1,1.5])for(const prev of [undefined,0,0.3,0.8])for(const hitR of [undefined,5]){
 const [sx,sy,tx,ty]=line;
 const enemies=[{id:'dead',hp:0,x:sx,y:sy},{id:'early',hp:10,x:sx+(tx-sx)*0.2,y:sy+(ty-sy)*0.2},{id:'late',hp:10,x:sx+(tx-sx)*0.8,y:sy+(ty-sy)*0.8},{id:'far',hp:10,x:10000,y:10000}];
 for(const reverse of [false,true]){
  const list=reverse?enemies.slice().reverse():enemies,a=combat(Before,list),b=combat(After,list);
  const s={sx,sy,tx,ty,t,dur:1,hitR,_collisionP:prev,ignoreTarget:reverse?enemies[1]:undefined},u={...s};
  const frozen=JSON.stringify(list);
  assert.strictEqual(b.c.scatterCheck(u),a.c.scatterCheck(s));assert.deepEqual(u,s);assert.equal(JSON.stringify(list),frozen);geometry++;
 }
}
let arcs=0;
for(const coords of [[0,0,200,0],[0,0,0,200],[10,20,10,20],[150,200,-80,-90]])for(const p of [-0.1,0,0.25,0.5,0.9,1,1.1]){
 const [sx,sy,tx,ty]=coords,s={sx,sy,tx,ty};assert.deepEqual(combat(After).c.sweepPos(s,p),combat(Before).c.sweepPos(s,p));assert.deepEqual(s,{sx,sy,tx,ty});arcs++;
}
let impacts=0;
for(const state of ['alive','dead','missing','absent'])for(const custom of [false,true]){
 const e={id:'e',hp:state==='dead'?0:10},list=state==='missing'?[]:[e],a=combat(Before,list),b=combat(After,list);
 const make=events=>({key:'fire',target:state==='absent'?undefined:e,dmg:25,onHit:custom?(...args)=>events.push(['custom',...args.map(v=>v&&typeof v==='object'?v.id:v)]):undefined});
 const ar=a.c.resolveShot(make(a.events)),br=b.c.resolveShot(make(b.events));assert.equal(br,ar);assert.deepEqual(b.events,a.events);
 assert.equal(b.events.length,state==='alive'?1:0);if(state==='alive')assert.equal(b.events[0][0],custom?'custom':'hit');impacts++;
}
for(const C of [Before,After]){
 const {c}=combat(C),shot={t:0,dur:1},visual={type:'shot'};assert.strictEqual(c.addProjectile(shot,visual),shot);
 assert.strictEqual(c.shots[0],shot);assert.strictEqual(c.game.fx[0],visual);assert.strictEqual(shot.visual,visual);assert.strictEqual(visual.projectile,shot);
}
let frames=0;
for(const kind of ['normal','custom','scatter','sweep'])for(const t of [-0.5,0,0.8])for(const dt of [0.1,0.4,1.2]){
 function go(C){
  const enemies=[{id:1,hp:10,x:50,y:0},{id:2,hp:10,x:150,y:0}],{c,events}=combat(C,enemies);
  c.sweepDamage=s=>events.push(['sweep',s.t]);
  const s={key:'ice',target:enemies[0],sx:0,sy:0,tx:200,ty:0,t,dur:1,dmg:20,scatter:kind==='scatter',sweep:kind==='sweep'};
  if(kind==='custom'||kind==='scatter')s.onHit=(e,dmg)=>events.push(['custom',e.id,dmg]);
  const result=c.stepShot(s,dt);return JSON.stringify({result,s,events});
 }
 assert.equal(go(After),go(Before));frames++;
}
// A large time step must sweep through a near target and consume the fragment only once.
const near={id:1,hp:10,x:50,y:0},far={id:2,hp:10,x:150,y:0},a=combat(After,[far,near]);
let hits=0;const fragment={scatter:true,sx:0,sy:0,tx:200,ty:0,t:0,dur:1,dmg:1,onHit:e=>{hits++;assert.strictEqual(e,near);}};
a.c.shots=[fragment];
function frame(c,dt){for(let i=c.shots.length-1;i>=0;i--)if(!c.stepShot(c.shots[i],dt)){c.shots[i].finished=true;c.shots.splice(i,1);}}
frame(a.c,1);frame(a.c,1);assert.equal(hits,1);assert.equal(a.c.shots.length,0);assert.equal(fragment.finished,true);
// Resolving the primary projectile does not cancel another projectile with its own target.
const b=combat(After,[near,far]);b.c.shots=[{key:'fire',target:near,t:0,dur:0.5,dmg:10},{key:'fire',target:far,t:0,dur:1,dmg:10}];
frame(b.c,0.5);near.hp=0;assert.equal(b.c.shots.length,1);frame(b.c,0.5);assert.deepEqual(b.events,[['hit','fire',1,10],['hit','fire',2,10]]);
const untouched=combat(After,[]);assert.equal(untouched.c.shots.length,0);assert.equal(untouched.c.game.fx.length,0);
console.log('PASS '+geometry+' scatter cases + '+arcs+' arcs + '+impacts+' impacts + '+frames+' frame cases vs fixed 5e6046f; linked visuals, non-piercing fragments and independent projectiles');
