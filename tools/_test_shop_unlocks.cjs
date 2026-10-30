'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {execFileSync}=require('child_process'),{createRequire}=require('module');
const {Meta}=require('../js/meta.js'),config=require('../js/config.js');
const {createShopService}=require('../js/economy/shop.js');
const unlocks=require('../js/skills/unlocks.js');
const root=path.resolve(__dirname,'..'),box={module:{exports:{}},require:createRequire(path.join(root,'js/meta.js')),Date,Math};
vm.runInNewContext(execFileSync('git',['show','1b72edb:js/meta.js'],{cwd:root,encoding:'utf8'}),box);
const Before=box.module.exports.Meta,snapshot=m=>JSON.stringify(m.toJSON());
function rng(seed){let v=seed;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
let cases=0;
for(const key of Object.keys(config.SHOP_CHEST))for(const seed of [1,3,33,333])for(const gold of [0,99999])for(const expired of [false,true]) {
 let now=new Date(2026,9,30,23,59,59).getTime();
 const a=new Before(),b=new Meta(),ra=rng(seed),rb=rng(seed),shop=createShopService({now:()=>now,random:rb});
 for(const m of [a,b]){m.gold=gold;m.shopDaily={date:expired?'2020-01-01':'2026-10-30',chests:{[key]:config.SHOP_CHEST[key].daily-1}};}
 const call=(method,...args)=>{
  const savedNow=Date.now,savedRandom=Math.random;let result;
  try{Date.now=()=>now;Math.random=ra;result=a[method](...args);}finally{Date.now=savedNow;Math.random=savedRandom;}
  assert.strictEqual(JSON.stringify(shop[method](b,...args)),JSON.stringify(result),method);
  assert.strictEqual(snapshot(b),snapshot(a),method+' state');
 };
 call('shopChestLeft',key);call('buyShopChest',key);call('buyShopChest',key);
 call('ensureDailyPicks',now);call('ensureDailyPicks',now);
 now+=2000;call('shopChestLeft',key);call('buyShopChest',key);call('ensureDailyPicks',now);
 cases++;
}
const catalog={...Object.fromEntries(['match4','match5','chain'].map(slot=>[slot,config.MATCH_SKILL[slot].map(s=>s.id)])),global:require('../js/global-skills.js').POOL.map(s=>s.id)};
for(const [slot,ids] of Object.entries(catalog))for(const id of ids)for(const gold of [0,config.SKILL_UNLOCK.price[slot],99999])for(const owned of [false,true]){
 const a=new Before(),b=new Meta();
 for(const m of [a,b]){m.gold=gold;if(owned)m.skillUnlocks[slot]=[id];}
 assert.strictEqual(unlocks.skillUnlocked(b,slot,id),a.skillUnlocked(slot,id));
 assert.strictEqual(JSON.stringify(unlocks.unlockSkill(b,slot,id)),JSON.stringify(a.unlockSkill(slot,id)));
 assert.strictEqual(snapshot(b),snapshot(a));cases++;
}
const a=new Meta(),b=new Meta();a.gold=99999;
const shop=createShopService({now:()=>1700000000000,random:rng(1)});
shop.buyShopChest(a,'blue');assert.strictEqual(b.shopDaily,null);assert.deepStrictEqual(b.shards,{});
unlocks.unlockSkill(a,'match4','cross');assert.strictEqual(unlocks.skillUnlocked(b,'match4','cross'),false);
const poor=new Meta(),before=snapshot(poor);assert.strictEqual(shop.buyShopChest(poor,'blue').reason,'gold');assert.strictEqual(snapshot(poor),before);
const offer={relic:'fire_seed',shards:3,price:300};
for(const gold of [0,299,300,301]) {
 const meta=new Meta();meta.gold=gold;const prior=snapshot(meta);
 const result=meta.buyShardOffer(offer);
 if(gold<300){assert.strictEqual(result.ok,false);assert.strictEqual(snapshot(meta),prior);}
 else {assert.strictEqual(result.ok,true);assert.strictEqual(meta.gold,gold-300);assert.strictEqual(meta.shards.fire_seed,3);}
}
console.log('PASS '+cases+' shop/unlock scenarios equal baseline: midnight reset, limit, seeded rewards, cache, prices, ownership and independent profiles');
