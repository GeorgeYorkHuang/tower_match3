'use strict';
const assert=require('node:assert/strict');
const Death=require('../js/game/fx/boss-death.js');
for(const bossId of ['lava_twins','frost_twins','lava_ignis','frost_skall']) {
 const g={fx:[]},e={isBoss:true,bossId,x:100,y:200,bossTwinIndex:2};
 assert.equal(Death.emit(g,e),true);assert.equal(Death.emit(g,e),false);assert.equal(g.fx.length,1);
 const f=g.fx[0],calls=[];let depth=0;
 const ctx={globalAlpha:1,save(){depth++;},restore(){depth--;},translate(){},scale(){},drawImage(...args){calls.push(args);}};
 for(const t of [0,.4,.8]){f.t=t;const snap=JSON.stringify(f);const before=calls.length;Death.draw(ctx,f,()=>({width:768,height:128}));assert.equal(calls.length-before,t<.8?1:0);assert.equal(depth,0);assert.equal(JSON.stringify(f),snap);}
 Death.draw(ctx,{...f,t:0},()=>null);assert.equal(depth,0);
 assert.equal(Death.emit(g,{...e,_bossDeathVisual:false,_bossRetired:true}),false);
}
assert.equal(Death.emit({fx:[]},{isBoss:false}),false);
console.log('PASS four Boss death snapshots: once-only, retirement exclusion, fade lifetime, missing texture and read-only draw');