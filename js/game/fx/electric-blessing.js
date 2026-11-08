'use strict';
const a=require('./approved-electric-frames.js').blessing;
let img,ready=false;
function draw(ctx,x,y,t){if(!img){if(typeof wx==='undefined'||!wx.createImage)return;img=wx.createImage();img.onload=()=>ready=true;img.src='assets/images/towers/fx/electric-approved/'+a.src;}if(!ready)return;const f=a.frames[Math.floor(t*a.fps)%a.frames.length];ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(img,f.x,f.y,f.w,f.h,x-a.pivot[0],y-a.pivot[1],f.w,f.h);ctx.restore();}
module.exports={draw};
