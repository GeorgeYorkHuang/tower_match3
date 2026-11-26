'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const Cast=require('../js/game/boss-cast-art.js');
const {createEnemyLayer}=require('../js/game/layers/enemies.js');
const e={id:1,isBoss:true,bossId:'lava_ignis',genLv:13};
const q={id:e.bossId,elapsed:10,finished:false,castEnd:18};
for(const [t,f] of [[10,0],[12,1],[14,3],[17.99,5]]){q.elapsed=t;const snap=JSON.stringify(q);const a=Cast.select(q,e);assert.equal(a.frameFor(),f);assert.equal(a.frames,6);assert.equal(Cast.select(q,e).frameFor(),f);assert.equal(JSON.stringify(q),snap);}
q.elapsed=14;q.castEnd=Infinity;q.interruptVisual={at:14};assert.equal(Cast.select(q,e).frameFor(),4);q.elapsed=14.6;assert.equal(Cast.select(q,e),null);
q.heatVisual={at:14.6};assert.ok(Cast.select(q,e).src.includes('eruption'));q.elapsed=16;assert.equal(Cast.select(q,e),null);
q.id=e.bossId='frost_skall';q.elapsed=20;q.shadowVisual={at:20};q.windVisual={at:20};assert.ok(Cast.select(q,e).src.includes('shadowfission'));q.elapsed=20.7;assert.ok(Cast.select(q,e).src.includes('coldwind'));q.elapsed=21;assert.equal(Cast.select(q,e),null);q.finished=true;assert.equal(Cast.select(q,e),null);
const calls=[];const ctx={drawImage(...a){calls.push(a)}};
const load=src=>{const b=fs.readFileSync(src);return {src,width:b.readUInt32BE(16),height:b.readUInt32BE(20)}};
const layer=createEnemyLayer({loadImg:load,IMG_SRC:{},drawImg:()=>false});q.finished=false;q.id=e.bossId='lava_ignis';q.elapsed=12;q.castEnd=18;q.interruptVisual=null;layer.bossEncounter=q;
assert.equal(layer.drawEnemyAnim(ctx,'assets/images/monsters/bosses/expansion/ignis-idle-v1.png',e,10,20,128,false,13,6,false),true);assert.ok(calls[0][0].src.includes('ignis-charge'));assert.equal(calls[0][1],128);
const fallback=createEnemyLayer({loadImg:src=>src.includes('charge')?null:load(src),IMG_SRC:{},drawImg:()=>false});fallback.bossEncounter=q;calls.length=0;assert.equal(fallback.drawEnemyAnim(ctx,'assets/images/monsters/bosses/expansion/ignis-idle-v1.png',e,10,20,128,false,13,6,false),true);assert.ok(calls[0][0].src.includes('idle'));
for(const name of ['ignis-eruption','ignis-charge','skar-coldwind','skar-shadowfission']){const b=fs.readFileSync('assets/images/monsters/bosses/expansion/'+name+'-v1.png');assert.equal(b.readUInt32BE(20),128);}
console.log('PASS cast event timing, progress frames, interrupt/priority, pause read-only, renderer asset selection and missing-image fallback');
const requested=[];
const preload=createEnemyLayer({loadImg:src=>{requested.push(src);return null;},IMG_SRC:{},drawImg:()=>false});
for(const id of ['lava_ignis','frost_skall']){
  requested.length=0;preload.preloadBoss(id);
  for(const src of Cast.sourcesFor(id)) { assert.ok(requested.includes(src)); assert.ok(fs.existsSync(src)); }
  assert.equal(Cast.sourcesFor(id).length,2);
}
assert.deepEqual(Cast.sourcesFor('unknown'),[]);
console.log('PASS encounter preload requests all cast textures even while images are pending');
