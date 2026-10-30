'use strict';
const assert=require('assert'),vm=require('vm'),path=require('path');
const {createRequire}=require('module');const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const original=execFileSync('git',['show','1b72edb:js/meta.js'],{cwd:root,encoding:'utf8'});
const box={module:{exports:{}},require:createRequire(path.join(root,'js/meta.js')),console};
vm.runInNewContext(original,box);
const Before=box.module.exports.Meta,After=require('../js/meta.js').Meta;
const config=require('../js/config.js');
const relics=Object.values(config.RELIC_RUN.tower).flat().concat(config.RELIC_RUN.common);
const ids=['r','sr','ssr'].map(rar=>relics.find(r=>config.relicRarity(r.id)===rar).id);
const snapshot=m=>JSON.stringify(m.toJSON());let cases=0;
for(const id of ids)for(const star of [0,1,2,3])for(const gold of [0,999999])for(const shards of [0,999])for(const stones of [0,99]){
 const a=new Before(),b=new After();
 for(const m of [a,b]){m.gold=gold;m.shards[id]=shards;m.starStones=stones;if(star)m.relicStars[id]=star;}
 for(const [method,args] of [['starOf',[id]],['shardNeed',[id]],['canUnlockByShard',[id]],['unlockByShard',[id]],['upStar',[id]],['addShard',[id,3]],['codexOwned',[id]],['codexUnlock',[id]],['starOf',[id]]]){
  assert.strictEqual(JSON.stringify(b[method](...args)),JSON.stringify(a[method](...args)),method+' result '+id);
  assert.strictEqual(snapshot(b),snapshot(a),method+' state '+id);
 }
 cases++;
}
const a=new After(),b=new After(),id=ids[0];
a.addShard(id,a.shardNeed(id));assert.strictEqual(a.starOf(id),0,'Adding shards does not auto-unlock');
assert.strictEqual(a.unlockByShard(id),null);assert.strictEqual(a.starOf(id),1);
assert.strictEqual(b.starOf(id),0);assert.strictEqual(b.shards[id],undefined);
a.relicStars[id]=1;a.gold=0;a.shards[id]=999;const before=snapshot(a);
assert.strictEqual(a.upStar(id),'金币不足');assert.strictEqual(snapshot(a),before);
console.log('PASS '+cases+' progression scenarios match baseline; errors preserve resources, manual unlocking and profiles remain isolated');
