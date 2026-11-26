'use strict';
const CONFIG=require('../../config.js'),GLOW=require('../../config/match-glow.js');
function emit(g,step){
 const run=g.run,ly=g.ly;if(!run||!step)return;
 const global=run.chapter.features.globalSkills;
 for(const m of step.matches||[]){
  const key=(CONFIG.COLORS[m.color]||{}).tower,tower=key&&run.effects.tower(key);let targets=[];
  if(tower&&tower.level>0){const p=g.combat.towerMuzzle(key);targets=[{x:p.x,y:p.y-2}];}
  else if(!global){targets=run.slotOrder.map(k=>g.combat.towerMuzzle(k)).filter(Boolean).map(p=>({x:p.x,y:p.y-2}));}
  else{
   const skill=run._globalSkillOf(m.color),n=ly.slotCount||run.towerSlots,sz=ly.slotSize,gap=ly.slotGap;
   const left=(750-((n+2)*sz+(n+1)*gap))/2+sz/2,right=left+(n+1)*(sz+gap),y=ly.slotY+sz/2;
   if(skill==='shuffle'||skill==='both')targets.push({x:left,y});
   if(skill==='refill'||skill==='both')targets.push({x:right,y});
  }
  for(const [row,col]of m.cells||[])for(const target of targets)g.fx.push({type:'beamp',x0:ly.boardX+(col+.5)*ly.cell,y0:ly.boardY+(row+.5)*ly.cell,x1:target.x,y1:target.y,blockColor:m.color,t:0,dur:GLOW.duration});
 }
}
module.exports={emit};
