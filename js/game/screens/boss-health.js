/** 20波Boss血条：18px生命填充、金色框、阶段刻度及独立护盾层。 */
'use strict';
const {fillRoundRect,strokeRoundRect,text}=require('../ui.js');
function draw(ctx,boss,top){
 const x=155,y=top+30,w=440,h=18;
 const ratio=boss.maxHp>0?Math.max(0,Math.min(1,boss.hp/boss.maxHp)):0;
 const rosea=boss.bossId==='altar_rosea';
 const phaseLabel=boss.bossStatus||(rosea?(boss.phase===1?'藤甲':'花绽狂暴'):boss.phase===2?'狂暴阶段':'');
 text(ctx,(boss.bossName||'圣坛蔓钟')+(phaseLabel?' · '+phaseLabel:''),375,top+15,18,'#f5dc9d','center');
 fillRoundRect(ctx,x-5,y-5,w+10,h+10,10,'#171d20');
 strokeRoundRect(ctx,x-5,y-5,w+10,h+10,10,'#bca064',2);
 fillRoundRect(ctx,x,y,w,h,7,'#31242c');
 if(ratio>0){
  const gradient=ctx.createLinearGradient(0,y,0,y+h);
  gradient.addColorStop(0,'#ffb5a7');gradient.addColorStop(.45,'#e25e72');gradient.addColorStop(1,'#a42d50');
  fillRoundRect(ctx,x,y,Math.max(2,w*ratio),h,Math.min(7,w*ratio/2),gradient);
  fillRoundRect(ctx,x+2,y+2,Math.max(0,w*ratio-4),4,2,'rgba(255,244,218,0.35)');
 }
 // 阶段刻度与真实生命阈值一致。
 const thresholds=boss.phaseThresholds || (boss.isFinalBoss?[.70,.35]:[.5]);
 ctx.strokeStyle='#f4dca2';ctx.lineWidth=2;ctx.beginPath();
 thresholds.forEach(p=>{ctx.moveTo(x+w*p,y);ctx.lineTo(x+w*p,y+h);});ctx.stroke();
 text(ctx,Math.max(0,Math.ceil(boss.hp))+' / '+Math.ceil(boss.maxHp),375,y+h/2+1,13,'#ffffff','center');
 const shield=Math.max(0,boss.shield||0),capacity=Math.max(1,boss._shieldPerLayer||shield);
 if(shield>0)fillRoundRect(ctx,x,y+h+7,w*Math.min(1,shield/capacity),5,2,'#87dce8');
 if(phaseLabel||shield>0)text(ctx,shield>0?(rosea||boss._shieldPerLayer?'藤甲护盾 ':'护盾 ')+Math.ceil(shield):phaseLabel,375,y+h+26,14,shield>0?'#bcecf1':'#d7c8a3','center');
}
module.exports={draw};
