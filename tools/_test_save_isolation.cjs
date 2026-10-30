'use strict';
const assert=require('assert');
const {Meta}=require('../js/meta.js'),{SaveManager}=require('../js/save.js');
const config=require('../js/config.js');
const source=new Meta();
Object.assign(source,{
 relics:{gold:2},relicLevels:{gold:1},chestTimer:{endAt:123},dailyPicks:{date:'test',picks:[{relic:'fire_seed',rar:'ssr',shards:2,price:100}]},
 runCodex:{fire_seed:1},relicStars:{fire_seed:2},shards:{fire_seed:8},deepChests:[{tier:'wood',gotAt:1,openAt:2}],
 milestones:{10:1},dailyFirst:{date:'test',counts:{ancient:1}},matchSkills:{...config.MATCH_SKILL.default},
 globalSkills:{slots:['forge','heal']},skillUnlocks:{global:['forge','heal']},shopDaily:{date:'test',chests:{blue:1}},
});
const raw=source.toJSON(),original=JSON.stringify(raw),a=Meta.fromJSON(raw),b=Meta.fromJSON(raw);
function allObjects(v,out=[]){if(v&&typeof v==='object'){out.push(v);Object.values(v).forEach(x=>allObjects(x,out));}return out;}
const references=new Set(allObjects(raw));for(const v of allObjects(a))assert(!references.has(v),'Restored profile shares input');
const aRefs=new Set(allObjects(a));for(const v of allObjects(b))assert(!aRefs.has(v),'Profiles share nested state');
a.shards.fire_seed=100;a.deepChests[0].openAt=999;a.skillUnlocks.global.push('gold');
a.dailyPicks.picks[0].price=1;a.shopDaily.chests.blue=99;
assert.strictEqual(JSON.stringify(raw),original);assert.strictEqual(b.shards.fire_seed,8);
const saved=a.toJSON(),savedText=JSON.stringify(saved);a.shards.fire_seed++;a.deepChests[0].openAt++;
assert.strictEqual(JSON.stringify(saved),savedText);saved.shards.fire_seed=0;assert.strictEqual(a.shards.fire_seed,101);
// wx stub deliberately returns references: the application must own the copy boundary.
const store={xxfx_save_v1:raw};global.wx={getStorageSync:k=>store[k],setStorageSync:(k,v)=>{store[k]=v;},removeStorageSync:k=>delete store[k]};
const game={meta:b},manager=new SaveManager(game);const loaded=manager.load();loaded.shards.fire_seed=0;assert.strictEqual(raw.shards.fire_seed,8);
assert.strictEqual(manager.save(),true);const stored=JSON.stringify(store.xxfx_save_v1);game.meta.shards.fire_seed=777;assert.strictEqual(JSON.stringify(store.xxfx_save_v1),stored);
for(const version of [1,2,3,4,5]){
 const legacy={version,gold:42,relics:{},relicSlots:['gold'],skillCards:{ice:{'减速场':{count:1,lv:1}},electric:{'弹跳':{count:1,lv:1}}},towerSkillSlots:{ice:'减速场',electric:'弹跳'}};
 store.xxfx_save_v1=legacy;const prior=JSON.stringify(legacy);
 const data=manager.load();assert.strictEqual(manager.lastLoadStatus,'ok');assert(data);const restored=Meta.fromJSON(data);
 assert.strictEqual(restored.gold,42);assert.strictEqual(JSON.stringify(legacy),prior);
 if(version>=3){assert(data.skillCards.ice['寒霜']);assert(data.skillCards.electric['活电']);assert(!data.skillCards.ice['减速场']);}
}
const equipped={version:4,gold:3,relics:{},relicSlots:['gold']};const inputText=JSON.stringify(equipped);
assert.strictEqual(Meta.fromJSON(equipped).relicCount('gold'),1);assert.strictEqual(JSON.stringify(equipped),inputText);
for(const bad of [{version:999,gold:999},false,0,'corrupt']){
 store.xxfx_save_v1=bad;const prior=JSON.stringify(bad);assert.strictEqual(manager.load(),null);
 assert.strictEqual(manager.save(),false);assert.strictEqual(JSON.stringify(store.xxfx_save_v1),prior);
}
const get=wx.getStorageSync;wx.getStorageSync=()=>{throw Error('read failure');};
assert.strictEqual(manager.load(),null);assert.strictEqual(manager.save(),false);wx.getStorageSync=get;
manager.clear();assert.strictEqual(manager.lastLoadStatus,'missing');assert.strictEqual(manager.save(),true);
console.log('PASS deep restore/export/storage ownership, v1-v5 migration immutability, corrupt/read-error write protection and explicit clear recovery');
