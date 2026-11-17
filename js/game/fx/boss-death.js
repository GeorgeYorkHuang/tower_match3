'use strict';
const art=require('../boss-idle-art.js');
const sizeOf=require('../../enemy-size.js');
const CONFIG=require('../../config.js');
function emit(g,e) {
 if(!e.isBoss || e._bossRetired || e._bossDeathVisual || !art[e.bossArtKey||e.bossId])return false;
 e._bossDeathVisual=true;
 g.fx.push({type:'bossDeath',x:e.x,y:e.y,t:0,dur:.8,size:sizeOf(e,CONFIG.LAYOUT.enemy),
  artKey:e.bossArtKey||e.bossId,mirror:e.bossTwinIndex===2});
 return true;
}
function draw(ctx,f,load) {
 const a=art[f.artKey];if(!a)return;
 const p=Math.max(0,Math.min(1,f.t/f.dur));if(p>=1)return;
 const img=load(a.src);if(!img||!img.width||!img.height)return;
 const w=img.width/a.frames;
 ctx.save();
 try {
  ctx.globalAlpha*=1-p;
  ctx.translate(f.x,f.y+p*f.size*.15);
  ctx.scale(f.mirror?-1:1,1-p*.15);
  ctx.drawImage(img,0,0,w,img.height,-f.size/2,-f.size/2,f.size,f.size);
 }finally{ctx.restore();}
}
module.exports={emit,draw};