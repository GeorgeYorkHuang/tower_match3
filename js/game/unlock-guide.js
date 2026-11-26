/** 主页解锁指引：读取真实入口坐标，点击查看后才记录已引导，支持重新进入恢复。 */
'use strict';
const Notices=require('../prologue/unlock-notices.js');
const Spotlight=require('./spotlight.js');
const RedGuide=require('./red-card-guide.js');
function target(game){
  if(game.state!=='menu'||game.testProfile)return null;
  const red=RedGuide.target(game);if(red)return red;
  if(game.menuPanel)return null;
  const seen=game.meta.unlockGuideSeen||{};
  const item=Notices.available(game.meta).find(entry=>!seen[entry.id]);
  if(!item)return null;
  const hits=game.menuHits||[];
  let hit=hits.find(h=>h.key===item.hit&&(item.data===undefined||h.data===item.data||h.data&&h.data.id===item.data));
  let viewing=!!hit;
  if(item.hit==='codexSel'&&game.menuTab!=='codex'){hit=hits.find(h=>h.key==='tab'&&h.data==='codex');viewing=false;}
  else if(item.hit==='stage'){
    if(game.menuTab!=='battle'){hit=hits.find(h=>h.key==='tab'&&h.data==='battle');viewing=false;}
    else if(game.menuStage!==item.data){
      const order=require('../field-access.js').visible(game.testProfile);
      hit=hits.find(h=>h.key===(order.indexOf(game.menuStage)<order.indexOf(item.data)?'stageNext':'stagePrev'));viewing=false;
    }
  }else if(!hit){hit=hits.find(h=>h.key==='tab'&&h.data==='battle');viewing=false;}
  return hit&&hit.rect?{item,hit,viewing}:null;
}
function draw(ctx,game){
  const active=target(game);game._unlockGuide=active;
  if(active&&active.red){RedGuide.draw(ctx,game,active);return;}
  game._redCardGuide=null;
  if(active)Spotlight.draw(ctx,[active.hit.rect],active.item.name+'已解锁','点击高亮入口查看新内容。','');
}
function tap(game,point){
  const active=target(game);
  if(!active)return false;
  if(active.red)return RedGuide.tap(game,point,active);
  if(!Spotlight.inside(point,active.hit.rect))return true;
  if(active.viewing){
    const seen=game.meta.unlockGuideSeen||(game.meta.unlockGuideSeen={});seen[active.item.id]=true;game.save.save();
  }
  return false;
}
module.exports={target,draw,tap};
