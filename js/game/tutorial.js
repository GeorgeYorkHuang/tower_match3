'use strict';
const CONFIG=require('../config.js');
const titles=['进入战斗','完成三消','激活防御塔','补充塔能量','选择技能','释放全局技能'];
function pending(g){return !g.testProfile&&g.meta&&g.meta.tutorial&&!g.meta.tutorial.done;}
function active(g){return pending(g)&&(g.state==='menu'||!!g._tutorial);}
function save(g,step){g.meta.tutorial={version:1,done:false,step};g.save.save();}
function finish(g,skipped){g.meta.tutorial={version:1,done:true,skipped:!!skipped};g._tutorial=null;g.save.save();g.toast(skipped?'已跳过新手引导':'新手引导完成 · 开始守护圣坛','#bdeba0');}
// Construct a match-free teaching board; validate the exact move using the real matcher.
function prepare(g){const b=g.run.board,colors=b.activeColors,r=b.rows-2,c=Math.floor(b.cols/2);let found=false;
 for(let seed=0;seed<colors.length&&!found;seed++){
  b.grid=Array.from({length:b.rows},(_,y)=>Array.from({length:b.cols},(_,x)=>colors[(y*2+x+seed)%colors.length]));
  b.grid[r][c-1]='red';b.grid[r][c]='blue';b.grid[r][c+1]='red';b.grid[r+1][c]='red';
  if(b.findMatches().length)continue;
  b.grid[r][c]='red';b.grid[r+1][c]='blue';const m=b.findMatches();b.grid[r][c]='blue';b.grid[r+1][c]='red';
  found=m.length===1&&m[0].size===3;
 }
 if(!found)throw Error('Tutorial board has no valid teaching move');
 g._tutorial.move=[r,c,r+1,c];g.selected=null;g.pickCell=null;g.boardHint=null;
}
function begin(g){g._tutorial=null;if(!pending(g)||g.menuStage==='test')return;
 g._tutorial={step:1,waiting:false};prepare(g);save(g,1);
}
function advance(g,n){g._tutorial.step=n;g._tutorial.waiting=false;save(g,n);}
function allowSwap(g,a,b,c,d){if(!g._tutorial)return true;const t=g._tutorial,m=t.move;
 return (t.step===1||t.step===3)&&!t.waiting&&((a===m[0]&&b===m[1]&&c===m[2]&&d===m[3])||(a===m[2]&&b===m[3]&&c===m[0]&&d===m[1]));}
function swapped(g){if(g._tutorial)g._tutorial.waiting=true;}
function chosen(g){if(g._tutorial&&g._tutorial.step===4)g._tutorial.chosen=true;}
function tick(g){const t=g._tutorial;if(!t)return false;
 if(t.waiting&&!g.anim&&!g._chestBusy){
  if(t.step===1){t.tower=g.run.slotOrder[0];advance(g,2);}
  else if(t.step===3){advance(g,4);if(!g.run.effects.pendingTotal())g.run.gainExp(Math.max(0,g.run.expNeed()-g.run.exp));}
 }
 if(t.step===4&&!g.anim){
  if(g.run.effects.pendingTotal()>0)g.flushUpgrades();
  else if(t.chosen){advance(g,5);t.oldSlot=g.run.globalSlots[0];g.run.globalSlots[0]='refill';g.run.shuffleAmmo=Math.max(g.run.shuffleAmmo,CONFIG.GLOBAL_SKILL.chargePerUse);const tw=g.run.effects.tower(t.tower);tw.energy=Math.min(tw.energy,20);}
 }
 return true;
}
function globalUsed(g,skill){const t=g._tutorial;if(t&&t.step===5&&skill==='refill'){if(t.oldSlot)g.run.globalSlots[0]=t.oldSlot;finish(g,false);}}
function towerRect(g){const l=g.ly,n=l.slotCount||4,total=(n+2)*l.slotSize+(n+1)*l.slotGap;return{x:(750-total)/2+l.slotSize+l.slotGap,y:l.slotY,w:l.slotSize,h:l.slotSize};}
function target(g){const t=g._tutorial;if(!t){const h=(g.menuHits||[]).find(h=>h.key==='enter');return h&&(h.rect||h);}
 if(t.step===1||t.step===3){const l=g.ly,m=t.move;return{x:l.boardX+m[1]*l.cell-5,y:l.boardY+m[0]*l.cell-5,w:l.cell+10,h:l.cell*2+10};}
 if(t.step===2)return towerRect(g);
 if(t.step===4)return require('./screens/pick-layout.js').geometry('skill',{towerTop:g.ly.slotY,towerBottom:g.ly.slotY+g.ly.slotSize});
 return (g.renderer.globalBtns||[]).find(b=>b.key==='shuffle');
}
function inside(p,b){return b&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;}
function tap(g,p){if(!active(g))return false;
 if(inside(p,{x:582,y:g._tutorial&&g._tutorial.step===4?1166:236,w:130,h:48})){const t=g._tutorial;if(t&&t.oldSlot)g.run.globalSlots[0]=t.oldSlot;finish(g,true);return true;}
 const t=g._tutorial;if(!t){const h=(g.menuHits||[]).find(h=>h.key==='enter');if(h&&h.hit(p.x,p.y)){g.menuStage='ancient';return false;}return true;}
 if(t.waiting||g.anim)return true;
 if(t.step===1||t.step===3)return !inside(p,target(g));
 if(t.step===2&&inside(p,target(g))){const tw=g.run.effects.tower(t.tower);tw.energy=20;advance(g,3);prepare(g);return true;}
 if(t.step===4&&g.state==='picking')return !Object.keys(g.pickHits||{}).some(k=>/^\d+$/.test(k)&&g.pickHits[k].hit(p.x,p.y));
 if(t.step===5)return !inside(p,target(g));
 return true;
}
function draw(ctx,g){if(!active(g))return;const t=g._tutorial,step=t?t.step:0,b=target(g),tipY=step===4?1150:220;ctx.save();ctx.fillStyle='rgba(5,20,15,0.55)';
 if(b&&Number.isFinite(b.x)&&Number.isFinite(b.w)){const x=Math.max(0,b.x-6),y=Math.max(0,b.y-6),w=b.w+12,h=b.h+12;ctx.fillRect(0,0,750,y);ctx.fillRect(0,y, x,h);ctx.fillRect(x+w,y,750-x-w,h);ctx.fillRect(0,y+h,750,1626-y-h);ctx.strokeStyle='#ffdc78';ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);}else ctx.fillRect(0,0,750,1626);
 ctx.fillStyle='#183f30';ctx.fillRect(30,tipY,690,190);ctx.strokeStyle='#bda66b';ctx.lineWidth=2;ctx.strokeRect(30,tipY,690,190);
 ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='bold 27px sans-serif';ctx.fillStyle='#ffe4a1';ctx.fillText('新手引导 '+(step+1)+'/6 · '+titles[step],54,tipY+42);
 ctx.font='21px sans-serif';ctx.fillStyle='#f0ebd5';const lines=[['点击「进入战斗」，开始守护圣坛。','可以随时跳过，稍后在「信息」中重新体验。'],['按箭头交换两个方块，连成三个同色方块。','消除不同颜色，将激活对应的防御塔。'],['火焰塔已激活！点击高亮的塔继续。','塔会消耗能量攻击，需要持续三消补能。'],['再次按箭头消除红色方块，补充火焰塔能量。','已为练习调整塔能量，观察能量条的增长。'],['获得升级机会！从下方技能卡中选择一个。','本次练习提供一次升级，技能在本局生效。'],['点击高亮的「能量补给」，为已激活的塔补能。','本次练习已充能；正常战斗需通过消除积攒。']][step];lines.forEach((s,i)=>ctx.fillText(s,54,tipY+96+i*36));
 ctx.fillStyle='#b9cbb9';ctx.textAlign='center';ctx.font='20px sans-serif';ctx.fillText('跳过引导',647,tipY+40);
 if(t&&(step===1||step===3)&&!t.waiting&&b){const l=g.ly,m=t.move,x=l.boardX+(m[1]+0.5)*l.cell,y=l.boardY+(m[2]+0.5)*l.cell;ctx.strokeStyle='#ffe5a0';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-l.cell);ctx.lineTo(x-12,y-l.cell+18);ctx.moveTo(x,y-l.cell);ctx.lineTo(x+12,y-l.cell+18);ctx.stroke();ctx.beginPath();ctx.arc(x,y-(Date.now()%1100)/1100*l.cell,10,0,Math.PI*2);ctx.fillStyle='#fff6d0';ctx.fill();}
 ctx.restore();}
function restart(g){if(g.testProfile){g.toast('请在正常档案体验新手引导','#ffdf9b');return;}g.meta.tutorial={version:1,done:false,step:0};g.menuPanel=null;g.menuTab='battle';g.menuStage='ancient';g.newRun(false);g.save.save();}
module.exports={begin,tick,draw,tap,allowSwap,swapped,chosen,globalUsed,restart,prepare};
