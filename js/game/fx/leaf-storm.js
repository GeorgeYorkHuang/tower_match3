'use strict';
// Baked from pixelfx nature/leaf-storm (MIT); notices accompany the atlas.
const frames=require('./leaf-storm-frames.js');
let image=null,ready=false;
function draw(ctx,x,y,time,key){
 if(!image){
  if(typeof wx==='undefined'||!wx.createImage)return;
  image=wx.createImage();image.onload=()=>{ready=true;};image.onerror=()=>{image=null;ready=false;};
  image.src='assets/images/towers/fx/buffs/leaf-storm.png';
 }
 if(!ready)return;
 const phase=String(key).split('').reduce((n,c)=>n+c.charCodeAt(0),0)%48;
 const f=frames[(Math.floor(time*20)+phase)%frames.length];
 ctx.save();ctx.globalAlpha=.9;ctx.imageSmoothingEnabled=false;
 ctx.drawImage(image,f.x,f.y,f.w,f.h,x-56,y-92,112,104);ctx.restore();
}
module.exports={draw};
