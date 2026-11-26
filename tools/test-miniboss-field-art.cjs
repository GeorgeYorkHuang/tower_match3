'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),Art=require('../js/game/miniboss-field-art.js');
for(const field of ['ancient','lava','frost']){
 const bytes=fs.readFileSync('assets/images/monsters/bosses/miniboss-fields/'+field+'-local-v1.png');assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),256);
 const e={id:0,bossArtKey:'miniboss_bell',minibossField:field},snap=JSON.stringify(e);let depth=0;const calls=[];
 const ctx={save(){depth++;},restore(){depth--;},translate(){},rotate(){},drawImage(...a){calls.push(a)}};
 for(const [t,f] of [[0,0],[1850,1],[2000,2],[2300,3],[2400,0]]){calls.length=0;assert.equal(Art.draw(ctx,()=>({width:1024,height:256}),e,0,0,166.4,t),true);assert.equal(calls[0][1],f*256);assert.equal(depth,0);assert.equal(JSON.stringify(e),snap);}
 assert.equal(Art.draw(ctx,()=>null,e,0,0,166.4,0),false);
}
assert.equal(Art.draw({},()=>{throw Error('unexpected load');},{bossArtKey:'miniboss_bell',minibossField:'unknown'},0,0,166,0),false);
console.log('PASS field variants, frame timing, dimensions, read-only drawing, missing texture and unknown field fallback');