'use strict';
// Sprite frames baked from pixelfx (MIT); retain assets/fx/buffs notices.
const definitions=require('./tower-buff-frames.js');
const cache={};
function draw(ctx,kind,x,y,time){
 const d=definitions[kind];if(!d)return;
 let entry=cache[kind];
 if(!entry){
  if(typeof wx==='undefined'||!wx.createImage)return;
  const image=wx.createImage();entry=cache[kind]={image,ready:false};
  image.onload=()=>{entry.ready=true;};image.onerror=()=>{entry.failed=true;};image.src=d.src;
 }
 if(!entry.ready)return;
 const index=((Math.floor(time*d.fps)%d.frames.length)+d.frames.length)%d.frames.length,f=d.frames[index];
 ctx.save();ctx.globalAlpha=.9;ctx.imageSmoothingEnabled=false;
 // Match the approved preview: raise the rune by 8px before adjusting its perspective.
 ctx.translate(x+(kind==='volley'?-15:0),y+d.dy);ctx.scale(1,d.scaleY);
 ctx.drawImage(entry.image,f.x,f.y,f.w,f.h,-d.pivot[0],-d.pivot[1],f.w,f.h);
 ctx.restore();
}
module.exports={draw};
