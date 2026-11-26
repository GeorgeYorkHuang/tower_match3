'use strict';
const assert=require('node:assert/strict'),Fx=require('../js/game/fx/boss-skill-atlas.js');
let depth=0;
const ctx=new Proxy({globalAlpha:1,save(){depth++;},restore(){depth--;},drawImage(){throw Error('skill must not draw images');}},{get(o,k){return k in o?o[k]:()=>{};}});
for(const name of Object.keys(Fx.FRAMES))for(let frame=0;frame<Fx.FRAMES[name];frame++){
 const f={name,frame};assert.equal(Fx.draw(ctx,()=>{throw Error('skill must not load texture');},name,frame,100,100,100,.8),true);assert.equal(depth,0);
}
const Cast=require('../js/game/boss-cast-art.js');assert.equal(Cast.select({},{}),null);assert.deepEqual(Cast.sourcesFor('lava_ignis'),[]);
console.log('PASS procedural skill effects: no images, no texture loading, balanced Canvas stack; cast sprites disabled');