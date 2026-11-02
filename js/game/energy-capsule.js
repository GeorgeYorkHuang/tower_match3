'use strict';
const { fillRoundRect, strokeRoundRect } = require('./ui.js');
function colorAt(r){
 if(r<.2)return '#ff4b4b';
 if(r<.4){const t=(r-.2)/.2;return `rgb(255,${Math.round(75+180*t)},${Math.round(75+100*t)})`;}
 if(r<=.8)return '#42d66b';
 const t=(r-.8)/.2;return `rgb(${Math.round(66-30*t)},${Math.round(214-30*t)},${Math.round(107+148*t)})`;
}
function draw(ctx,x,y,w,h,ratio){
 const r=Math.max(0,Math.min(1,ratio||0)),rad=w/2,ix=x+1.5,iy=y+1.5,iw=w-3,ih=h-3;
 fillRoundRect(ctx,x,y,w,h,rad,'rgba(7,13,18,0.92)');
 const bg=ctx.createLinearGradient(x,y,x+w,y);bg.addColorStop(0,'rgba(255,255,255,0.10)');bg.addColorStop(.35,'rgba(255,255,255,0.025)');bg.addColorStop(1,'rgba(0,0,0,0.35)');
 fillRoundRect(ctx,ix,iy,iw,ih,rad-1,bg);
 if(r>0){
  const fh=Math.max(3,ih*r),fy=iy+ih-fh,g=ctx.createLinearGradient(ix,fy,ix+iw,fy),col=colorAt(r);
  g.addColorStop(0,'rgba(255,255,255,0.48)');g.addColorStop(.22,col);g.addColorStop(.72,col);g.addColorStop(1,'rgba(0,0,0,0.24)');
  fillRoundRect(ctx,ix+1,fy,iw-2,fh,Math.min((iw-2)/2,fh/2),g);
  ctx.save();ctx.globalAlpha=.35;fillRoundRect(ctx,ix+2,fy+2,Math.max(1,(iw-4)*.24),Math.max(1,fh-4),2,'rgba(255,255,255,0.8)');ctx.restore();
 }
 strokeRoundRect(ctx,x,y,w,h,rad,'rgba(225,241,248,0.72)',1.2);
 ctx.save();ctx.globalAlpha=.42;fillRoundRect(ctx,x+rad*.6,y+2,w-rad*1.2,1.5,1,'#ffffff');ctx.restore();
}
module.exports={draw};
