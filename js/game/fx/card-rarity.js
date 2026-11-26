'use strict';
const {fillRoundRect,strokeRoundRect,text}=require('../ui.js');
const TEXT_DURATION=1.5,TEXT_RISE=18;
const THEMES={
 1:{top:'#427c60',mid:'#234937',bottom:'#142c26',edge:'#b7efd0',light:'#76d5a0',dark:'#315d46'},
 2:{top:'#68518e',mid:'#2f244e',bottom:'#181e31',edge:'#d8c5ff',light:'#bfa2ff',dark:'#52406d'},
 3:{top:'#8b6a33',mid:'#3e3020',bottom:'#192b2a',edge:'#ffe5a0',light:'#ffd374',dark:'#7c5525'}
};
function diamond(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.6,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.6,y);ctx.closePath();ctx.fill();}
function star(ctx,x,y,r,color){ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();}
function face(ctx,g,c,x,y,w,h,time){
 const theme=THEMES[c.star];if(!theme)return false;
 ctx.save();
 ctx.shadowColor=theme.light;ctx.shadowBlur=c.star===3?8:4;
 const grad=ctx.createLinearGradient(x,y,x+w,y+h);grad.addColorStop(0,theme.top);grad.addColorStop(.38,theme.mid);grad.addColorStop(1,theme.bottom);
 fillRoundRect(ctx,x,y,w,h,8,grad);ctx.shadowBlur=0;
 strokeRoundRect(ctx,x,y,w,h,8,theme.dark,3);
 strokeRoundRect(ctx,x+.8,y+.8,w-1.6,h-1.6,7,theme.edge,1.3);
 strokeRoundRect(ctx,x+4,y+4,w-8,h-8,5,theme.light,.65);
 // 切面、对称金属角与内凹徽章，保证小卡槽内仍能辨认星级材质。
 ctx.fillStyle=c.star===3?'rgba(255,227,159,.12)':c.star===2?'rgba(217,190,255,.12)':'rgba(175,243,199,.12)';
 ctx.beginPath();ctx.moveTo(x+5,y+5);ctx.lineTo(x+w-5,y+5);ctx.lineTo(x+5,y+h*.66);ctx.closePath();ctx.fill();
 for(const side of [-1,1]){
  const cx=x+w/2+side*(w/2-8);
  for(const cy of [y+10,y+h-10])diamond(ctx,cx,cy,c.star===3?4:3,theme.edge);
 }
 const cy=y+40;
 ctx.fillStyle='rgba(5,12,20,.55)';ctx.beginPath();ctx.arc(x+w/2,cy,22,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=theme.light;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x+w/2,cy,22,-Math.PI*.85,Math.PI*.85);ctx.stroke();
 g.renderer.cardTowerIcon(ctx,c.key,x+w/2-21,cy-21,42);
 const tint=({fire:'#f67f61',ice:'#8ed9ff',poison:'#7fe0a4',electric:'#ffe783',boomerang:'#c8a0ef',cannon:'#edb17a'})[c.key];
 if(c.star===3)text(ctx,'×2 · 60秒',x+w/2,y+73,9,theme.edge,'center');else diamond(ctx,x+w/2,y+73,4,tint);
 if(c.star>1)text(ctx,'攻击+'+require('../../tower-cards.js').RULES.growth[c.star]+'%',x+w/2,y+86,9,theme.edge,'center');
 text(ctx,'★'.repeat(c.star),x+w/2,y+h-15,c.star===3?13:15,theme.edge,'center');
 // 裁剪后的窄流光，不覆盖图标，也不改变其他画布绘制状态。
 ctx.save();require('../ui.js').roundRect(ctx,x+2,y+2,w-4,h-4,7);ctx.clip();
 const phase=(time/3200)%1,sy=y-h+phase*h*3;
 const shine=ctx.createLinearGradient(x,sy,x+w,sy+25);shine.addColorStop(0,'rgba(255,255,255,0)');shine.addColorStop(.5,c.star===3?'rgba(255,238,183,.19)':c.star===2?'rgba(222,205,255,.12)':'rgba(187,255,210,.12)');shine.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=shine;ctx.fillRect(x,sy,w,25);ctx.restore();
 if(c.star===3){const a=.4+.25*Math.sin(time/850);ctx.globalAlpha*=a;star(ctx,x+w-8,y+19,3,theme.edge);star(ctx,x+9,y+h-30,2,theme.edge);}
 ctx.restore();return true;
}
function snapshot(g){
 const run=g.run,result={};
 for(const key of run.slotOrder){const t=run.effects.tower(key);result[key]=t?t.energy:0;}
 result.shuffle=run.shuffleAmmo||0;result.refill=run.refillAmmo||0;return result;
}
function emit(g,card,source,before,result={}){
 if(!THEMES[card.star])return;
 const run=g.run,ly=g.renderer.ly,targets=[];
 for(const key of run.slotOrder){const t=run.effects.tower(key),gain=t.energy-(before[key]||0);if(gain>.001){const p=g.combat.towerMuzzle(key);targets.push({x:p.x,y:p.y,gain});}}
 const n=ly.slotCount||run.towerSlots,sz=ly.slotSize,gap=ly.slotGap,left=(750-((n+2)*sz+(n+1)*gap))/2+sz/2;
 for(const [i,key]of ['shuffle','refill'].entries()){const gain=(run[key+'Ammo']||0)-before[key];if(gain>.001)targets.push({x:left+i*(n+1)*(sz+gap),y:ly.slotY+sz/2,gain});}
 if(result.growthGain>0||result.doubleSeconds>0){let to=targets.find(t=>{const p=g.combat.towerMuzzle(card.key);return t.x===p.x&&t.y===p.y;});if(!to){const p=g.combat.towerMuzzle(card.key);to={x:p.x,y:p.y,gain:0};targets.push(to);}to.boost=result.growthGain;to.doubleSeconds=result.doubleSeconds||0;}
 if(!targets.length)return;
 if(g._cardUseFxRun!==run){g._cardUseFx=[];g._cardUseFxRun=run;}
 const list=g._cardUseFx||(g._cardUseFx=[]);list.push({card:{...card},source:{...source},targets,destination:targets.find(t=>{const p=g.combat.towerMuzzle(card.key);return t.x===p.x&&t.y===p.y;})||targets[0],variant:Math.floor(Math.random()*(card.star+1)),t:0});if(list.length>3)list.shift();
}
// 总数按品质固定，多目标时分配光球，避免目标越多特效数量成倍增长。
const ORB_COUNTS=[0,4,7,10];
function makeOrbs(star,targets){
 return Array.from({length:ORB_COUNTS[star]},(_,i)=>{
  const angle=i*2.3999632297-.7,radius=star===3?76+(i%4)*20:star===2?48+(i%4)*15:26+(i%4)*9;
  return {target:i%targets.length,dx:Math.cos(angle)*radius,dy:Math.sin(angle)*radius,
   delay:(i%5)*.012,scatter:.2,flight:.42+(i%4)*.045+(star-1)*.04,
   bend:(i%2?1:-1)*(22+i%3*14),radius:2.8+star*.65+(i%3)*.35};
 });
}
function orbPosition(source,target,orb,t){
 const local=t-orb.delay;if(local<0)return null;
 if(local<orb.scatter){const p=1-Math.pow(1-local/orb.scatter,3);return{x:source.x+orb.dx*p,y:source.y+orb.dy*p,phase:'burst',p};}
 const p=Math.min(1,(local-orb.scatter)/orb.flight),q=p*p,inv=1-q;
 const sx=source.x+orb.dx,sy=source.y+orb.dy;
 return{x:inv*inv*sx+2*inv*q*((sx+target.x)/2+orb.bend)+q*q*target.x,
  y:inv*inv*sy+2*inv*q*((sy+target.y)/2+30)+q*q*target.y,phase:p>=1?'arrived':'flight',p};
}
function glowOrb(ctx,x,y,r,theme,alpha){
 // Flat translucent halos avoid allocating two radial gradients per orb and trail sample.
 ctx.globalAlpha=alpha*.18;ctx.fillStyle=theme.light;
 ctx.beginPath();ctx.arc(x,y,r*2.6,0,Math.PI*2);ctx.fill();
 ctx.globalAlpha=alpha;ctx.fillStyle=theme.edge;
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.globalAlpha=alpha*.85;ctx.fillStyle='#ffffff';
 ctx.beginPath();ctx.arc(x-r*.15,y-r*.2,r*.4,0,Math.PI*2);ctx.fill();
}
function render(ctx,g,paint,dt){
 if(g._cardUseFxRun!==g.run){g._cardUseFx=[];return;}
 const list=g._cardUseFx;if(!list)return;
 for(let i=list.length-1;i>=0;i--){const f=list[i];f.t+=dt;
  const theme=THEMES[f.card.star];if(!theme){list.splice(i,1);continue;}
  const duration=.9+TEXT_DURATION;
  if(f.t>=duration){list.splice(i,1);continue;}
  ctx.save();
  // 松手立即收缩卡面，在释放点爆散，随后各光球错峰加速吸入目标槽。
  if(f.t<.16){const p=f.t/.16;ctx.globalAlpha=1-p;paint(ctx,g,f.card,{x:f.source.x-32,y:f.source.y-60,w:64,h:120},1-p*.55);}
  if(f.t<.3){const p=f.t/.3;ctx.globalAlpha=(1-p)*.7;ctx.strokeStyle=theme.light;ctx.lineWidth=2.5*(1-p)+.5;ctx.beginPath();ctx.arc(f.source.x,f.source.y,8+p*(40+f.card.star*10),0,Math.PI*2);ctx.stroke();glowOrb(ctx,f.source.x,f.source.y,7*(1-p)+2,theme,(1-p)*.65);}
  // One baked group sprite replaces all individual orb and trail drawing.
  const travel=Math.min(1,f.t/.9),ease=travel*travel*(3-2*travel);
  const destination=f.destination||f.targets[0];
  const px=f.source.x+(destination.x-f.source.x)*ease;
  const py=f.source.y+(destination.y-f.source.y)*ease-Math.sin(travel*Math.PI)*35;
  ctx.globalAlpha=1;
  if(travel<1)g.renderer.cardChargeSprite(ctx,f.card.star,f.variant||0,Math.min(15,Math.floor(travel*16)),px,py);
  for(let target=0;target<f.targets.length;target++){
   const to=f.targets[target];
   if(f.t<.9)continue;const hit=Math.min(1,(f.t-.9)/.34);ctx.globalAlpha=1-hit;
   glowOrb(ctx,to.x,to.y,5+f.card.star*1.4,theme,(1-hit)*.8);
   ctx.globalAlpha=1-hit;
   for(let ring=0;ring<(f.card.star===3?2:1);ring++){ctx.strokeStyle=theme.light;ctx.lineWidth=1.8-ring*.5;ctx.beginPath();ctx.ellipse(to.x,to.y,14+hit*34+ring*8,7+hit*15+ring*4,0,0,Math.PI*2);ctx.stroke();}
   const textAge=f.t-.9;ctx.globalAlpha=1-Math.max(0,Math.min(1,(textAge-.8)/(TEXT_DURATION-.8)));
   const textY=to.y-26-Math.min(1,textAge/TEXT_DURATION)*TEXT_RISE;
   text(ctx,'+'+Math.round(to.gain)+' 能量',to.x,textY,17,theme.edge,'center');
   let extraY=textY-22;
   if(to.boost){text(ctx,'攻击力 +'+to.boost+'%',to.x,extraY,17,theme.edge,'center');extraY-=22;}
   if(to.doubleSeconds)text(ctx,'双倍攻击 60秒',to.x,extraY,17,theme.edge,'center');
  }
  ctx.restore();
 }
}
module.exports={face,snapshot,emit,render,ORB_COUNTS,makeOrbs,orbPosition};
