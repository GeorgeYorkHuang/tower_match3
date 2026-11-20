'use strict';
// Legacy adapter name retained; all skill shapes are now Canvas geometry, with no image loading.
const FRAMES={'ignis-core':5,'skar-freeze':3,'skar-shellbreak':4,'carlos-resonance':3,'carlos-reignite':3};
function draw(ctx,load,name,frame,x,y,size,alpha=1){
 if(!FRAMES[name])return false;
 ctx.save();try{
 ctx.globalAlpha*=Math.max(0,alpha);ctx.translate(x,y);
 const cold=name.startsWith('skar'),r=size*.36;
 ctx.strokeStyle=cold?'#b5efff':'#ffb451';ctx.fillStyle=cold?'rgba(115,215,255,.18)':'rgba(255,100,20,.24)';ctx.lineWidth=3;
 if(name==='skar-shellbreak'){
  const p=Math.min(1,frame/3);for(let i=0;i<8;i++){const a=i*Math.PI/4,d=r*(.6+p);ctx.save();ctx.translate(Math.cos(a)*d,Math.sin(a)*d);ctx.rotate(a+p);ctx.fillRect(-3,-8,6,16);ctx.restore();}
 }else if(name==='skar-freeze'){
  ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const xx=Math.cos(a)*r,yy=Math.sin(a)*r*1.2;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();
  if(frame>0){ctx.beginPath();ctx.moveTo(-r*.6,-r*.7);ctx.lineTo(r*.6,r*.7);ctx.moveTo(r*.6,-r*.7);ctx.lineTo(-r*.6,r*.7);ctx.stroke();}
 }else{
  const count=name==='carlos-resonance'?Math.min(3,frame+1):2;
  for(let i=0;i<count;i++){ctx.beginPath();ctx.arc(0,0,r*(.6+i*.2),0,Math.PI*2);ctx.fill();ctx.stroke();}
 }
 return true;
 }finally{ctx.restore();}
}
function events(ctx,g){
 const body=g.run.bossEnemy;
 if(body&&body.hp>0&&['lava_ridge','frost_alpha'].includes(body.bossId)&&body.bossStatus){
  ctx.save();try{ctx.strokeStyle=body.bossId==='lava_ridge'?'#ffb451':'#b5efff';ctx.lineWidth=3;const pulse=Math.sin((g.animClock||0)/180)*4;ctx.beginPath();ctx.ellipse(body.x,body.y,48+pulse,24+pulse,0,0,Math.PI*2);ctx.stroke();}finally{ctx.restore();}
 }
 const q=g.run.bossEncounter;if(!q||q.finished)return;
 const e=g.run.bossEnemy;if(!e||e.hp<=0)return;
 const lava=q.id==='lava_ignis',cold=q.id==='frost_skall';if(!lava&&!cold)return;
 const candidates=lava?[q.interruptVisual,q.heatVisual]:[q.shadowVisual,q.windVisual];
 const event=candidates.find(v=>v&&q.elapsed>=v.at&&q.elapsed-v.at<.8);
 const age=event?q.elapsed-event.at:Infinity;
 ctx.save();try{
 ctx.strokeStyle=lava?'#ffb451':'#b5efff';ctx.lineWidth=3;
 if(age>=0&&age<.8){ctx.globalAlpha*=1-age/.8;ctx.beginPath();ctx.ellipse(e.x,e.y,30+age*90,15+age*45,0,0,Math.PI*2);ctx.stroke();}
 if(lava&&Number.isFinite(q.castEnd)){const p=Math.max(0,Math.min(1,1-(q.castEnd-q.elapsed)/8));ctx.globalAlpha=.4+p*.6;ctx.beginPath();ctx.arc(e.x,e.y,45+p*18,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();}
 }finally{ctx.restore();}
}
module.exports={draw,FRAMES,events};