'use strict';
const Cards=require('../../tower-cards.js'),CONFIG=require('../../config.js');
const Rarity=require('../fx/card-rarity.js');
const {fillRoundRect,strokeRoundRect,text,button}=require('../ui.js');
function boxes(g){const y=g.renderer.ly.boardY+38;return Array.from({length:10},(_,i)=>({x:(750-(10*64+9*6))/2+i*70,y,w:64,h:120}));}
function inside(p,r){return p&&r&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}
function active(g){return g.state==='fighting'&&!g.shopOpen&&!g.funcLayer&&!g.towerInfo&&!g.towerSkill&&!g.relicDetail;}
function paintCard(ctx,g,c,r,scale=1){
 ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.scale(scale,scale);
 const x=-r.w/2+4,y=-r.h/2+4,w=r.w-8,h=r.h-8;
 fillRoundRect(ctx,x+2,y+4,w,h,8,'rgba(0,0,0,.4)');
 if(Rarity.face(ctx,g,c,x,y,w,h,g.animClock||0)){ctx.restore();return;}
 const grad=ctx.createLinearGradient(0,y,0,y+h);grad.addColorStop(0,'#516453');grad.addColorStop(1,'#23372e');
 fillRoundRect(ctx,x,y,w,h,8,grad);strokeRoundRect(ctx,x,y,w,h,8,'#e4c375',1.5);
 g.renderer.cardTowerIcon(ctx,c.key,-24,y+12,48);
 text(ctx,'★'.repeat(c.star),0,y+h-16,16,'#ffe18b','center');ctx.restore();
}
function render(ctx,g){
 const d=Cards.state(g.run),y=g.renderer.ly.boardY,rects=boxes(g);
 if(d.talentSlots==null){const talents=require('../../talents/model.js').analyze(g.meta);d.talentSlots=8+(talents.count>=3?1:0)+(talents.count>=6?1:0);}
 d.unlocked=Math.max(d.unlocked,d.talentSlots);
 fillRoundRect(ctx,0,y+28,750,212,0,'#15251f');
 const now=Date.now(),fxDt=active(g)&&!g._cardFullPrompt?Math.min(.05,Math.max(0,(now-(g._cardFxLast||now))/1000)):0;g._cardFxLast=now;let event=null,progress=0;
 if(d.animation){const a=d.animation;const dt=g.state==='fighting'?Math.min(.05,(now-(a.last||now))/1000):0;a.last=now;a.time+=dt;
 event=a.events[a.index];const duration=event&&event.type==='deal'?.095:.42;
 if(a.time>=duration){a.time=0;a.index++;event=a.events[a.index];}
 if(!event)delete d.animation;else progress=Math.min(1,a.time/duration);
 }
 const shown=event?event.before:d.cards;
 rects.forEach((r,i)=>{const locked=i>=d.unlocked;
 // Raised lower lip and dark inner well create a recessed slot.
 fillRoundRect(ctx,r.x-1,r.y+3,r.w+2,r.h,11,'#657568');
 fillRoundRect(ctx,r.x,r.y,r.w,r.h-1,10,'#070f0b');
 const well=ctx.createLinearGradient(0,r.y,0,r.y+r.h);
 well.addColorStop(0,'#020705');well.addColorStop(.25,'#09150f');well.addColorStop(1,'#22382b');
 fillRoundRect(ctx,r.x+3,r.y+4,r.w-6,r.h-9,8,well);
 strokeRoundRect(ctx,r.x+2,r.y+2,r.w-4,r.h-4,9,'#020604',2);
 strokeRoundRect(ctx,r.x,r.y,r.w,r.h,10,'#405347',1);
 if(locked){text(ctx,'锁',r.x+r.w/2,r.y+44,21,'#b3a47b','center');text(ctx,'广告',r.x+r.w/2,r.y+86,15,'#aaa','center');return;}
 const c=shown[i];if(c&&!(event&&event.type==='merge'&&event.ids.includes(i)))paintCard(ctx,g,c,r);
 else if(!c)text(ctx,'＋',r.x+r.w/2,r.y+58,22,'#354e40','center');
 });
 const b={x:(750-300)/2,y:y+174,w:300,h:48};g._cardDrawRect=b;
 ctx.save();
 ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=8;ctx.shadowOffsetY=5;
 fillRoundRect(ctx,b.x,b.y+5,b.w,b.h,24,'#70521e');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 const face=ctx.createLinearGradient(0,b.y,0,b.y+b.h);
 face.addColorStop(0,d.animation?'#a7955c':'#ffe5a0');face.addColorStop(.42,d.animation?'#8e814c':'#d9b766');face.addColorStop(1,'#a97e30');
 fillRoundRect(ctx,b.x,b.y,b.w,b.h,24,face);
 strokeRoundRect(ctx,b.x+.5,b.y+.5,b.w-1,b.h-1,23.5,'#f4d791',1.5);
 fillRoundRect(ctx,b.x+18,b.y+5,b.w-36,4,2,'rgba(255,255,255,.38)');ctx.restore();
 ctx.save();text(ctx,d.animation?'抽取中…':d.draws>=3?'抽取3张 · '+Cards.RULES.cost+'银币':'免费抽取3张 · '+(3-d.draws)+'次',b.x+b.w/2,b.y+b.h/2,21,'#282617','center');ctx.restore();
 if(event&&event.type==='deal'){const to=rects[event.index],k=1-Math.pow(1-progress,3);
 paintCard(ctx,g,event,{x:b.x+b.w/2-to.w/2+(to.x-(b.x+b.w/2-to.w/2))*k,y:b.y+(to.y-b.y)*k-Math.sin(progress*Math.PI)*45,w:to.w,h:to.h},.35+.65*k);
 }else if(event){const to=rects[event.ids[0]],k=progress;
 event.ids.forEach(i=>{const r=rects[i];ctx.save();ctx.globalAlpha=1-k*.6;paintCard(ctx,g,event.before[i],{...r,x:r.x+(to.x-r.x)*k,y:r.y-Math.sin(k*Math.PI)*16},1-k*.3);ctx.restore();});
 if(k>.5){ctx.save();ctx.globalAlpha=Math.sin((k-.5)*Math.PI*2)*.8;ctx.strokeStyle=event.star===3?'#ffe5a0':'#d8c5ff';ctx.lineWidth=event.star===3?3:2;ctx.beginPath();ctx.ellipse(to.x+to.w/2,to.y+to.h/2,25+(k-.5)*100,42+(k-.5)*100,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
 if(k>.65)paintCard(ctx,g,{key:event.key,star:event.star},to,1+Math.sin((k-.65)/.35*Math.PI)*.15);
 }
 if(g._cardDrag){const drag=g._cardDrag;paintCard(ctx,g,drag.card,{x:drag.p.x-32,y:drag.p.y-60,w:64,h:120},1.08);}
 Rarity.render(ctx,g,paintCard,fxDt);
}

function confirmDraw(g){const result=Cards.draw(g.run,{allowDiscard:true});if(!result.ok)g.toast(result.reason);else require('../prologue-tutorial.js').action(g,'cardDraw');}
function warning(ctx,g){
 const p=g._cardFullPrompt;if(!p)return;
 ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(0,0,750,1626);
 const grad=ctx.createLinearGradient(95,550,655,960);grad.addColorStop(0,'#354b3c');grad.addColorStop(1,'#14251e');
 fillRoundRect(ctx,95,550,560,410,26,grad);strokeRoundRect(ctx,95,550,560,410,26,'#d5b477',2);
 for(const x of [115,623]){fillRoundRect(ctx,x,575,12,290,6,'rgba(215,184,112,.13)');}
 text(ctx,'卡槽不足',375,606,34,'#ffe0a0','center');
 text(ctx,'空卡槽不足3格，继续抽取会有卡被丢弃。',375,668,22,'#e4d7bd','center');
 text(ctx,'无法放入卡槽的卡片不会保留。',375,706,21,'#bfcdbd','center');
 p.check={x:180,y:746,w:390,h:48};
 fillRoundRect(ctx,190,755,28,28,6,p.checked?'#d2b36a':'#14221b');strokeRoundRect(ctx,190,755,28,28,6,'#d7bc81',1.5);
 if(p.checked)text(ctx,'✓',204,769,23,'#17281d','center');text(ctx,'不再提示（本局）',242,770,23,'#e4d6b5','left');
 p.cancel=button(ctx,135,850,220,66,'返回整理',{bg:'#526056',fontSize:24,capsule:true,raised:true}).hit;
 p.confirm=button(ctx,385,850,230,66,'确认抽取',{bg:'#8b693a',fontSize:24,capsule:true,raised:true}).hit;
}
function begin(g,p){
 if(g._cardFullPrompt){g._cardPromptDown=p;return true;}
if(!active(g)||Cards.state(g.run).animation||!require('../prologue-tutorial.js').allowCardDrag(g,p))return false;const d=Cards.state(g.run),i=boxes(g).findIndex(r=>inside(p,r));if(i>=0&&i<d.unlocked&&d.cards[i]){g._cardDrag={index:i,card:d.cards[i],p};return true;}return false;}
function end(g,p){
 if(g._cardFullPrompt){const prompt=g._cardFullPrompt,down=g._cardPromptDown;g._cardPromptDown=null;
  if(!p||!down)return true;
  if(inside(p,prompt.check)&&inside(down,prompt.check)){prompt.checked=!prompt.checked;return true;}
  if(prompt.cancel&&prompt.cancel(p.x,p.y)&&prompt.cancel(down.x,down.y)){g._cardFullPrompt=null;return true;}
  if(prompt.confirm&&prompt.confirm(p.x,p.y)&&prompt.confirm(down.x,down.y)){if(prompt.checked)Cards.state(g.run).skipFullWarning=true;g._cardFullPrompt=null;confirmDraw(g);}return true;
 }
 const drag=g._cardDrag;if(!drag)return false;g._cardDrag=null;
 if(!active(g)||!p)return true;
 const d=Cards.state(g.run),to=boxes(g).findIndex(rect=>inside(p,rect));
 if(to>=0){if(to<d.unlocked&&d.cards[drag.index]===drag.card)[d.cards[drag.index],d.cards[to]]=[d.cards[to],d.cards[drag.index]];return true;}
 const ly=g.renderer.ly;
 if(p.x>=ly.areaX&&p.x<=ly.areaX+ly.areaW&&p.y>=ly.areaY+ly.entryH&&p.y<=ly.boardY){
   const existing=g.run.slotOrder.indexOf(drag.card.key);
   const slot=existing>=0?existing:g.run.slotOrder.length;
   const before=Rarity.snapshot(g);
   const result=Cards.use(g.run,drag.index,slot);
   if(result.ok){if(result.energyFull&&!result.growthGain&&!result.doubleSeconds)g.toast('能量已满，卡片已使用','#d4dec2');Rarity.emit(g,drag.card,p,before,result);if(result.doubleSeconds&&!result.growthGain)g.toast('双倍攻击已刷新 · 60秒','#ffe5a0');if(result.growthGain>0)g.toast('高星强化 · '+CONFIG.TOWERS[drag.card.key].name+'攻击力 +'+result.growthGain+'%（本局累计 +'+result.growthTotal+'%）'+(result.doubleSeconds?' · 双倍攻击60秒':''),drag.card.star===3?'#ffe5a0':'#d8c5ff');}
   if(!result.ok&&result.reason)g.toast(result.reason);
 }
 return true;
}

function tap(g,p){if(!active(g))return false;if(inside(p,g._cardDrawRect)){if(Cards.state(g.run).animation)return true;const d=Cards.state(g.run);const cost=d.draws>=3?Cards.RULES.cost:0;if(g.run.gold<cost){g.toast('银币不足');return true;}if(d.cards.slice(0,d.unlocked).filter(c=>!c).length<3&&!d.skipFullWarning){g._cardFullPrompt={checked:false};return true;}confirmDraw(g);return true;}const i=boxes(g).findIndex(r=>inside(p,r));if(i>=0){const d=Cards.state(g.run);if(i>=d.unlocked&&!g._cardAdBusy){g._cardAdBusy=true;const run=g.run;require('../../ads/rewarded-video.js').show('cardSlot').then(r=>{if(r.ok&&g.run===run)d.unlocked=Math.min(10,d.unlocked+1);else if(!r.ok)g.toast('完整观看广告后解锁，广告未配置时暂不可用');}).finally(()=>g._cardAdBusy=false);}return true;}return p.y>=g.renderer.ly.boardY && p.y<g.renderer.ly.boardY+240;}
module.exports={render,warning,begin,end,tap,active};
