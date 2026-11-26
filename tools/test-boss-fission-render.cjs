'use strict';
const assert=require('node:assert/strict');
const {createEnemyLayer}=require('../js/game/layers/enemies.js');
for(const id of ['lava_twins','frost_twins']) {
 const positions=[];
 const layer=createEnemyLayer({loadImg:()=>null,drawImg:()=>false,IMG_SRC:{}});
 Object.assign(layer,{drawEnemyBody:(ctx,e,x,y,size)=>positions.push([x+size/2,y+size/2]),drawEnemyDebuffs(){},drawEnemyBar(){},drawEnemyDebuffIcons(){}});
 const q=layer.bossEncounter={id,elapsed:10,finished:false,fissionVisual:{at:10,x:200,y:300,duration:.5}};
 const e={id:1,isBoss:true,bossId:id,bossTwinIndex:1,x:140,y:300,hp:100};
 const snapshot=JSON.stringify(e),context={};
 for(const [elapsed,expected] of [[10,200],[10.25,147.5],[10.5,140],[11,140]]) {
  q.elapsed=elapsed;const state=JSON.stringify(q);positions.length=0;
  layer.enemies(context,[e],null);
  assert.equal(positions[0][0],expected);assert.equal(positions[0][1],300);
  assert.equal(JSON.stringify(e),snapshot);assert.equal(JSON.stringify(q),state);
 }
}
console.log('PASS both W40 body transitions: start, easing, end, expiry and read-only rendering');