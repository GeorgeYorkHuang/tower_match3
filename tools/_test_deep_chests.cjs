'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module');const {execFileSync}=require('child_process');
const config=require('../js/config.js'),{Meta}=require('../js/meta.js');
const {createDeepChestService}=require('../js/relics/deep-chests.js');
const root=path.resolve(__dirname,'..');
const box={module:{exports:{}},require:createRequire(path.join(root,'js/meta.js')),Date,Math};
vm.runInNewContext(execFileSync('git',['show','1b72edb:js/meta.js'],{cwd:root,encoding:'utf8'}),box);
const OldMeta=box.module.exports.Meta;
const snapshot=m=>JSON.stringify(m.toJSON());
function rng(seed){let n=seed;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
let cases=0;
for(const tier of config.DEPTH_CHEST.tiers)for(const seed of [1,2,3,5,9,99,333]) {
 let now=1700000000000;
 const a=new OldMeta(),b=new Meta(),oldRng=rng(seed),newRng=rng(seed);
 const service=createDeepChestService({now:()=>now,random:newRng});
 const call=(name,...args)=>{
  const savedNow=Date.now,savedRandom=Math.random;let left;
  try{Date.now=()=>now;Math.random=oldRng;left=a[name](...args);}finally{Date.now=savedNow;Math.random=savedRandom;}
  const right=service[name](b,...args);
  assert.strictEqual(JSON.stringify(right),JSON.stringify(left),tier.key+' '+name);
  assert.strictEqual(snapshot(b),snapshot(a),tier.key+' '+name+' state');
 };
 call('tierByWave',tier.max);call('grantDeepChest',tier);
 call('chestReady',a.deepChests[0]);call('openDeepChest',0);
 now+=tier.openSec*1000-1;call('chestReady',a.deepChests[0]);call('openDeepChest',0);
 now++;call('chestReady',a.deepChests[0]);call('openDeepChest',0);call('openDeepChest',0);
 assert.strictEqual(b.deepChests.length,0);
 cases++;
}
for(const diamonds of [0,1,4,100])for(const remainingMs of [1,60000,60001,3600000,3600001]) {
 const now=1700000000000,a=new OldMeta(),b=new Meta();
 for(const m of [a,b]){m.diamond=diamonds;m.deepChests=[{tier:'gold',gotAt:now,openAt:now+remainingMs}];}
 const savedNow=Date.now;let result;
 try{Date.now=()=>now;result=a.speedOpen(0);}finally{Date.now=savedNow;}
 assert.strictEqual(createDeepChestService({now:()=>now}).speedOpen(b,0),result);
 assert.strictEqual(snapshot(b),snapshot(a));cases++;
}
const a=new Meta(),b=new Meta(),service=createDeepChestService({now:()=>100});
for(let i=0;i<config.DEPTH_CHEST.slots;i++)assert.strictEqual(service.grantDeepChest(a,config.DEPTH_CHEST.tiers[0]),true);
const full=snapshot(a);assert.strictEqual(service.grantDeepChest(a,config.DEPTH_CHEST.tiers[0]),false);assert.strictEqual(snapshot(a),full);
assert.strictEqual(b.deepChests.length,0);
assert.strictEqual(service.speedOpen(a,999),false);assert.strictEqual(service.openDeepChest(a,999),null);
console.log('PASS '+cases+' chest scenarios match baseline: 5 tiers, seeded rewards, timer boundaries, speed costs; full slots and profile isolation');
