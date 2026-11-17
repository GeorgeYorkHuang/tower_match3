'use strict';
const {fillRoundRect,text}=require('./ui.js');
function blocked(g){return !!(g._adBusy||g.funcLayer||g.shopOpen||g.dmgStat||g.towerInfo||g.towerSkill||g.relicDetail||g._chestBusy);}
function active(g){return !!(g.testProfile&&g.autoBattle&&!blocked(g)&&['fighting','testfield'].includes(g.state));}
function tick(g,dt){
 if(!g.testProfile){g.autoBattle=false;return;}
 if(!g.autoBattle||blocked(g)||!['picking','relicpick'].includes(g.state)){g._autoPickElapsed=0;return;}
 g._autoPickElapsed=(g._autoPickElapsed||0)+dt;
 if(g._autoPickElapsed<.6)return;
 g._autoPickElapsed=0;
 if(g.state==='relicpick'){
  if(g.relicPick&&g.relicPick.candidates&&g.relicPick.candidates.length)g.relicPickChoice(0);
 }else{
  const group=g.pickQueue[g.pickIndex];
  if(!group)return;
  for(const choice of group.candidates||[]){
   const result=g.run.applyChoice(group.tower,choice);
   if(result.ok){require('./tutorial.js').chosen(g,choice);g.nextPick();break;}
  }
 }
}
function draw(ctx,g){
 g.autoBattleHit=null;
 if(!g.testProfile||!['fighting','testfield','picking','relicpick'].includes(g.state)||blocked(g))return;
 const x=275,y=(g.ly && g.ly.wallY ? g.ly.wallY : 300)-70,w=200,h=48;
 ctx.save();fillRoundRect(ctx,x,y,w,h,10,g.autoBattle?'#276b48':'#334354');
 text(ctx,'自动战斗：'+(g.autoBattle?'开':'关'),x+w/2,y+29,20,'#ffffff','center');ctx.restore();
 g.autoBattleHit={hit:(px,py)=>px>=x&&px<=x+w&&py>=y&&py<=y+h};
}
function tap(g,p){
 if(!g.testProfile||blocked(g)||!['fighting','testfield','picking','relicpick'].includes(g.state)||!g.autoBattleHit||!g.autoBattleHit.hit(p.x,p.y))return false;
 g.autoBattle=!g.autoBattle;g._autoPickElapsed=0;g.run._storeAutoMatchElapsed=0;return true;
}
module.exports={active,tick,draw,tap};