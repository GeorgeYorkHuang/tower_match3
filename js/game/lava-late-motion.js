'use strict';
function sample(level,now){
 const t=Math.max(0,Number(now)||0);
 if(level===14)return {frame:[0,1,2,1,3][Math.floor(t/160)%5],bob:Math.sin(t/800*Math.PI*2)*.035,lean:Math.sin(t/800*Math.PI*2)*.025};
 return {frame:Math.floor(t/180)%6,bob:-Math.abs(Math.sin(t/360*Math.PI))*.018,lean:0};
}
function draw(ctx,load,e,x,y,size,now){
 const level=e.genLv;if(e.isBoss||e.isSummon||![6,12,14].includes(level))return false;
 const image=load('assets/images/monsters/enemies/lava-lv'+level+(level!==14?'-roll-v1':'')+'.png');if(!image||!image.width)return false;
 const m=sample(level,now),cols=level!==14?3:4,rows=level!==14?2:1;
 const fw=image.width/cols,fh=image.height/rows;
 ctx.save();try{
 ctx.translate(x+size/2,y+size/2+m.bob*size);ctx.rotate(m.lean);
 // Roll draft contains exterior haze: clip outside the spherical silhouette.
 if(level!==14){ctx.beginPath();ctx.ellipse(0,0,size*.407,size*.422,0,0,Math.PI*2);ctx.clip();}
 ctx.drawImage(image,m.frame%cols*fw,Math.floor(m.frame/cols)*fh,fw,fh,-size/2,-size/2,size,size);
 }finally{ctx.restore();}return true;
}
module.exports={sample,draw};