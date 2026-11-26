'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const art = require('../js/game/boss-idle-art.js');
const {createEnemyLayer} = require('../js/game/layers/enemies.js');
const calls = [], transforms = [];
const ctx = {save(){transforms.push('save');},restore(){transforms.push('restore');},translate(...a){transforms.push(['translate',...a]);},scale(...a){transforms.push(['scale',...a]);},drawImage(...a){calls.push(a);}};
const layer = createEnemyLayer({IMG_SRC:{},loadImg:src=>({src,width:768,height:128}),drawImg:()=>{throw Error('unexpected fallback');}});
for (const [id,a] of Object.entries(art)) {
  const bytes=fs.readFileSync(a.src);assert.equal(bytes.readUInt32BE(16),768);assert.equal(bytes.readUInt32BE(20),128);
  const e={id:0,isBoss:true,bossId:id.replace(/_twin$/,''),bossArtKey:id,genLv:13,bossTwinIndex:id.endsWith('_twin')?2:0};
  for(const ms of [0,160,330,530,730,850,970,4000]){
    layer.animNow=ms;calls.length=0;transforms.length=0;
    const snapshot=JSON.stringify(e);
    layer.drawEnemyBody(ctx,e,50,60,166,false,false);
    assert.equal(JSON.stringify(e),snapshot);assert.equal(calls.length,1);
    const [img,sx,sy,sw,sh]=calls[0];assert.equal(img.src,a.src);assert.equal(sw,128);assert.equal(sh,128);assert.equal(sy,0);assert.equal(sx%128,0);assert.ok(sx>=0&&sx<=640);
    assert.equal(transforms.some(t=>Array.isArray(t)&&t[0]==='scale'),e.bossTwinIndex===2);
    assert.equal(transforms.filter(t=>t==='save').length,transforms.filter(t=>t==='restore').length);
    if(id==='frost_twins')assert.equal(sx/128,[0,1,2,3,4,5,0,0][[0,160,330,530,730,850,970,4000].indexOf(ms)]);
  }
}
const unique=[...new Set(Object.values(art).map(a=>a.src))];
const total=unique.reduce((n,p)=>n+fs.statSync(p).size,0);assert.ok(total<1024*1024);
console.log('PASS 6 Boss forms / 48 render samples: atlas bounds, mirror, frame timings, state isolation; bytes='+total);
