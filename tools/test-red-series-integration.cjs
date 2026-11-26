'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const C=require('../js/config.js'),T=require('../js/talents/model.js'),Runtime=require('../js/talents/runtime.js'),R=require('../js/config/red-relics.js'),Shop=require('../js/economy/diamond-shop.js'),Plan=require('../js/config/prologue.js'),{Meta}=require('../js/meta.js');
assert.equal(T.C.cards.length,18);assert.equal(new Set(T.C.cards.map(c=>c.id)).size,18);
for(const card of T.C.cards){
 const m=new Meta();m.gold=100000;m.addShard(card.id,50);
 assert.equal(m.unlockByShard(card.id),null);assert.equal(m.upStar(card.id),null);assert.equal(m.upStar(card.id),null);assert.equal(m.starOf(card.id),3);
 m.talents={slots:Array(6).fill(null)};m.talents.slots[card.nativeSlot]=card.id;
 const run={};Runtime.initialize(run,m);
 assert.equal(run.talentState.gold.length,card.gold.enabled?1:0);
 assert.equal(run.talentState.purple.length,card.purpleList.length);
 assert(fs.existsSync(path.join(__dirname,'..',card.icon)));
}
for(const [field,series,key]of [['ancient','sanctum','scarletSanctum'],['lava','forge','scarletForge'],['frost','gale','scarletGale']]){
 assert.equal(R.cards(field).length,6);assert(R.cards(field).every(c=>c.series===series));
 const m=new Meta();m.diamond=100;m.fieldClears={ancient:true,lava:true};m.prologue={cleared:Plan.order.slice(),redGiftGranted:true};
 const bought=Shop.buy(m,key,{random:()=>0});assert(bought.ok);assert.equal(m.diamond,80);assert(Object.keys(bought.gain.shardDetail).every(id=>R.fieldOf(id)===field));
 for(const wave of [20,40,60]){const g={menuStage:field,run:{wave},runShardDetail:{}};const result=require('../js/relics/red-boss-drop.js').grant(g,{isBoss:true},()=>0);assert(result);assert.equal(R.fieldOf(result.id),field);assert.equal(require('../js/relics/red-boss-drop.js').grant(g,{isBoss:true},()=>0),null);}
}
for(const [oldId,newId]of Object.entries(R.legacy)){
 const m=new Meta();m.relicStars[oldId]=2;m.shards[oldId]=4;m.talents={slots:[oldId]};require('../js/relics/red-migration.js').migrate(m);
 assert.equal(m.starOf(newId),2);assert.equal(m.shards[newId],4);assert.equal(m.talents.slots[0],newId);
 const snapshot=JSON.stringify(m);require('../js/relics/red-migration.js').migrate(m);assert.equal(JSON.stringify(m),snapshot);
}
for(const series of ['sanctum','forge','gale'])for(const star of [1,2,3]){
 const cards=T.C.cards.filter(c=>c.series===series),meta={relicStars:Object.fromEntries(cards.map(c=>[c.id,star])),talents:{slots:cards.map(c=>c.id)}};
 for(let shift=0;shift<6;shift++){meta.talents.slots=cards.map((_,i)=>cards[(i+shift)%6].id);const a=T.analyze(meta),expected={};for(const node of T.C.nodes)if(node.type==='white'&&a.sources[node.id])expected[node.tower]=(expected[node.tower]||0)+2;for(const tower of Object.keys(C.TOWERS))assert.equal((a.bonuses[tower]||{}).attack||0,expected[tower]||0);}
}
console.log('PASS 18-card unlock/star/effects/assets, 3 boxes and pools, boss dedup, 6 legacy migrations and 54 fixed-node loadouts');
