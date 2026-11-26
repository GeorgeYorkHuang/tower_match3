'use strict';
const assert=require('node:assert/strict'),V=require('../js/game/fx/card-rarity.js');
const towers={fire:{energy:50},ice:{energy:90}};
const run={slotOrder:['fire','ice'],effects:{tower:k=>towers[k]},shuffleAmmo:10,refillAmmo:90,towerSlots:2};
const g={run,combat:{towerMuzzle:k=>({x:k==='fire'?200:400,y:900})},renderer:{ly:{slotCount:2,slotSize:100,slotGap:28,slotY:1000}}};
let before=V.snapshot(g);towers.fire.energy=70;run.shuffleAmmo=30;
V.emit(g,{key:'poison',star:2},{x:50,y:1100},before);
assert.equal(g._cardUseFx.length,1);assert.equal(g._cardUseFx[0].targets.length,2);
assert.deepEqual(g._cardUseFx[0].targets.map(t=>t.gain),[20,20]);
assert.equal(g._cardUseFx[0].targets[0].x,200);
assert.equal(g._cardUseFx[0].targets[1].x,183);
before=V.snapshot(g);V.emit(g,{key:'fire',star:3},{x:1,y:2},before);assert.equal(g._cardUseFx.length,1);
towers.fire.energy++;V.emit(g,{key:'fire',star:1},{x:1,y:2},before);assert.equal(g._cardUseFx.length,2);
// 动画清理不依赖战斗奖励，也不会在新对局复用旧目标。
V.render({},g,()=>{},2);assert.equal(g._cardUseFx.length,0);
before=V.snapshot(g);towers.fire.energy++;V.emit(g,{key:'fire',star:3},{x:1,y:2},before);
g.run={};V.render({},g,()=>{},0);assert.equal(g._cardUseFx.length,0);
console.log('PASS actual energy targets, capped targets omitted, no-gain guard and green 1star emission, expiry and new-run cleanup');
