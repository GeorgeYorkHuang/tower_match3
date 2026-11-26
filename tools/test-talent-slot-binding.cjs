'use strict';
const assert=require('assert/strict'),T=require('../js/talents/model.js'),Layout=require('../js/game/screens/talent-layout.js');
const stars=Object.fromEntries(T.C.cards.map(c=>[c.id,3]));
const m={relicStars:stars,shards:{ur_forge_fire:9},talents:{version:1,slots:['ur_sanctum_fire','ur_forge_fire','ur_gale_ice',null,null,null],center:null}};
const owned=JSON.stringify({stars:m.relicStars,shards:m.shards}),migrated=T.migrate(m);
assert.equal(migrated.state.slots[0],'ur_sanctum_fire');assert.equal(migrated.state.slots[4],'ur_gale_ice');assert.equal(migrated.moved,1);assert.equal(migrated.removed,1);assert.equal(JSON.stringify({stars:m.relicStars,shards:m.shards}),owned);
m.talents=migrated.state;assert.deepEqual(T.migrate(m).state,migrated.state);assert.equal(T.migrate(m).moved,0);assert.equal(T.migrate(m).removed,0);
for(const card of T.C.cards){const x={relicStars:stars,talents:{version:2,slots:Array(6).fill(null)}};const before=JSON.stringify(x);assert(T.equip(x,(card.nativeSlot+1)%6,card.id));assert.equal(JSON.stringify(x),before);assert.equal(T.equip(x,card.nativeSlot,card.id),null);assert(Layout.galleryList(x,card.nativeSlot).every(c=>c.nativeSlot===card.nativeSlot));assert.equal(T.analyze(x).lostAttack,undefined);}
const rotated={relicStars:stars,talents:{version:1,slots:T.C.cards.filter(c=>c.series==='sanctum').map(c=>c.id)}};rotated.talents.slots.push(rotated.talents.slots.shift());const normalized=T.normalize(rotated);assert(normalized.slots.every((id,i)=>T.get(id).nativeSlot===i));
console.log('PASS correct-slot priority, relocation/conflict inventory preservation, idempotence, 18 equip guards and slot candidate filters');
