'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {CombatSystem:After}=require('../js/combat.js'),CONFIG=require('../js/config.js');
const root=path.resolve(__dirname,'..');
const box={module:{exports:{}},require:createRequire(path.join(root,'js/combat.js')),console,Math,Date};
vm.runInNewContext(execFileSync('git',['show','a5e7d69:js/combat.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6}),box);
const Before=box.module.exports.CombatSystem;
const towers=Object.keys(CONFIG.TOWERS),originalRandom=Math.random;
function setup(C,state,order,layout,enemies){
 const c=Object.create(C.prototype);c.game={state,run:{slotOrder:order.slice()},enemies,ly:{...layout}};return c;
}
const layouts=[{slotCount:4,slotSize:100,slotGap:10,slotY:900},{slotCount:6,slotSize:80,slotGap:15,slotY:1100},{slotSize:60,slotGap:8,slotY:1000}];
let cases=0;
for(const state of ['fighting','testfield'])for(const order of [[],towers,towers.slice().reverse()])for(const layout of layouts)for(const key of towers){
 const a=setup(Before,state,order,layout,[]),b=setup(After,state,order,layout,[]);
 assert.deepEqual(b.towerMuzzle(key),a.towerMuzzle(key));assert.equal(b.range(key),a.range(key));
 const mz=a.towerMuzzle(key),r=a.range(key);
 const enemySets=[[],[{id:1,hp:0,x:mz.x,y:mz.y}],
 [{id:1,hp:1,x:mz.x+r,y:mz.y},{id:2,hp:1,x:mz.x-r,y:mz.y}],
 [{id:1,hp:1,x:mz.x+r+0.001,y:mz.y},{id:2,hp:1,x:mz.x,y:mz.y-r}],
 [{id:1,hp:-1,x:mz.x,y:mz.y},{id:2,hp:10,x:mz.x,y:mz.y-10},{id:3,hp:10,x:mz.x,y:mz.y-5}]];
 for(const enemies of enemySets){
  a.game.enemies=enemies;b.game.enemies=enemies;
  const snapshot=JSON.stringify({enemies,a:a.game,b:b.game});
  assert.strictEqual(b.pickTarget(key),a.pickTarget(key));
  assert.equal(JSON.stringify({enemies,a:a.game,b:b.game}),snapshot);cases++;
 }
 for(const x of [mz.x,mz.x+10000])for(const dy of [-r-0.001,-r,0,r,r+0.001])assert.equal(b.inTowerRange(key,x,mz.y+dy),a.inTowerRange(key,x,mz.y+dy));
}
let alternate=0;
for(const random of [0,0.499,0.999999])for(const key of towers)for(const order of [towers,towers.slice().reverse()]){
 const layout=layouts[0],a=setup(Before,'fighting',order,layout,[]),b=setup(After,'fighting',order,layout,[]),mz=a.towerMuzzle(key),r=a.range(key);
 const main={id:'main',hp:1,x:mz.x,y:mz.y-10};
 const candidates=[main,{id:'lowEdge',hp:1,x:mz.x,y:main.y-40},{id:'highEdge',hp:1,x:mz.x+1,y:main.y},{id:'below',hp:1,x:mz.x,y:main.y+0.001},{id:'above',hp:1,x:mz.x,y:main.y-40.001},{id:'dead',hp:0,x:mz.x,y:main.y},{id:'far',hp:1,x:mz.x+r+1,y:main.y}];
 for(const enemies of [[main],candidates,candidates.slice().reverse()]){
  a.game.enemies=enemies;b.game.enemies=enemies;
  const snapshot=JSON.stringify(enemies);let beforeCalls=0,afterCalls=0;
  try{
   Math.random=()=>{beforeCalls++;return random;};const left=a.pickAltTarget(key,main);
   Math.random=()=>{afterCalls++;return random;};const right=b.pickAltTarget(key,main);
   assert.strictEqual(right,left);assert.equal(afterCalls,beforeCalls);assert.equal(afterCalls,enemies.length===1?0:1);
  }finally{Math.random=originalRandom;}
  assert.equal(JSON.stringify(enemies),snapshot);alternate++;
 }
}
// Lock intentional existing differences and ordering independently of the old implementation.
const c=setup(After,'testfield',towers,layouts[0],[]);assert.deepEqual(c.towerMuzzle('fire'),{x:65,y:1103});
const r=c.range('fire');assert.equal(c.inTowerRange('fire',100000,1103),true);
const near={hp:1,x:65+r,y:1103},tie={hp:1,x:65-r,y:1103};c.game.enemies=[near,tie];assert.strictEqual(c.pickTarget('fire'),near);
c.game.enemies=[{hp:1,x:100000,y:1103}];assert.equal(c.pickTarget('fire'),null);
const d=setup(After,'testfield',towers,layouts[0],[]);assert.equal(d.pickTarget('fire'),null);
// Configuration is read at call time, with no copied range table in the new module.
const oldRange=CONFIG.TOWERS.fire.range;
try{CONFIG.TOWERS.fire.range=1;assert.equal(c.range('fire'),60);CONFIG.TOWERS.fire.range=500;assert.equal(c.range('fire'),450);}finally{CONFIG.TOWERS.fire.range=oldRange;}
console.log('PASS '+cases+' target cases + '+alternate+' alternate-target cases vs fixed a5e7d69: 6 towers, layout/state/order, exact enemy identity, range edges, RNG counts, fallback and input immutability');
