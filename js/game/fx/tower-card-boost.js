'use strict';
const {fillRoundRect,text}=require('../ui.js');
function draw(ctx,x,y,size,remaining,now=Date.now()){
 if(!(remaining>0))return;
 const cx=x+size/2,cy=y+size*.56,t=now/1000,pulse=.55+.15*Math.sin(t*4);
 ctx.save();
 const glow=ctx.createRadialGradient(cx,cy,3,cx,cy,size*.59);
 glow.addColorStop(0,'rgba(255,225,121,.27)');glow.addColorStop(1,'rgba(255,193,63,0)');
 ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,size*.59,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='rgba(255,216,112,'+pulse+')';ctx.lineWidth=1.8;
 ctx.beginPath();ctx.ellipse(cx,y+size*.83,size*.42,size*.12,0,0,Math.PI*2);ctx.stroke();
 for(let i=0;i<6;i++){const p=(t*.6+i/6)%1,px=cx+Math.sin(i*2.4+t)*size*.34,py=y+size*.85-p*size*.7;
  ctx.globalAlpha=Math.sin(p*Math.PI)*.8;ctx.fillStyle='#ffeaa7';ctx.beginPath();ctx.arc(px,py,1.5+(i%2)*.5,0,Math.PI*2);ctx.fill();}
 ctx.globalAlpha=1;fillRoundRect(ctx,cx-32,y-8,64,20,10,'#644a1c');
 text(ctx,'×2 · '+Math.ceil(remaining)+'s',cx,y+2,12,'#ffe9a1','center');ctx.restore();
}
module.exports={draw};
