'use strict';
const Video=require('../../ads/rewarded-video.js'),Rewards=require('../../economy/ad-rewards.js');
const CFG=require('../../config/rewarded-ads.js'),CONFIG=require('../../config.js');
async function watch(game,key) {
 if(game._adBusy)return false;
 const meta=game.meta,run=game.run,summary=game.runSummary;
 if(['diamond','chest'].includes(key)&&!Rewards.canClaim(meta,key)){game.toast('今日已领取','#f7c948');return false;}
 if(key==='double'&&(!summary||!summary.evacuated||summary.adDoubled))return false;
 if(key==='revive'&&(game.state!=='reviveOffer'||run.adRevived))return false;
 game._adBusy=true;
 try {
   const result=await Video.show(key);
   if(!result.ok){game.toast(result.reason==='unconfigured'?'广告暂未开放':result.reason==='incomplete'?'完整观看后可领取奖励':'广告暂不可用，请稍后重试','#f7c948');return false;}
   if(game.meta!==meta||game.run!==run)return false;
   if(key==='revive') {
     if(game.state!=='reviveOffer'||run.adRevived)return false;
     run.adRevived=true;run.broken=false;
     run.lineHp=Math.max(1,Math.round((run.lineMaxHp||CONFIG.LINE.hp)*CFG.reviveHpRatio));
     run.adReviveProtection=CFG.reviveProtectionSeconds;
     game.state='fighting';game.sfx.startBgm();game.toast('复活成功 · 防线保护3秒','#7ef0a3');return true;
   }
   const snapshot=JSON.parse(JSON.stringify(meta.toJSON()));
   const summarySnapshot=key==='double'?JSON.parse(JSON.stringify(summary)):null;
   let reward=key==='double'?Rewards.doubleSettlement(meta,summary):Rewards.claimDaily(meta,key);
   if(!reward.ok)return false;
   if(key==='double')summary.relicCards=game._buildRelicCards(summary.shardDetail);
   if(game.save.save()===false){
     const restored=require('../../meta.js').Meta.fromJSON(snapshot);Object.keys(meta).forEach(k=>delete meta[k]);Object.assign(meta,restored);
     if(summarySnapshot){Object.keys(summary).forEach(k=>delete summary[k]);Object.assign(summary,summarySnapshot);}
     game.toast('保存失败，奖励尚未领取，请重试','#ff6b6b');return false;
   }
   if(key==='chest')game.menuPanel={type:'chestOpen',mode:'ad',tier:CFG.dailyChestTier,gain:reward.gain,openedAt:Date.now()};
   else if(key==='diamond'){game.menuPanel=null;game.toast('钻石 +1','#8fdcff');}
   else game.toast('金币与碎片已翻倍','#f7c948');
   return true;
 } finally {game._adBusy=false;}
}
function tap(game,p) {
 if(game._adBusy)return true;
 if(game.state==='reviveOffer'){
   const hits=game._reviveAdHits||{};
   if(hits.watch&&hits.watch(p.x,p.y))watch(game,'revive');
   else if(hits.decline&&hits.decline(p.x,p.y)){game.run.adReviveDeclined=true;game.finishRun(false);}
   return true;
 }
 if(game.state==='gameover'&&game.runSummary&&game.runSummary.evacuated&&game._doubleAdHit&&game._doubleAdHit(p.x,p.y)) {watch(game,'double');return true;}
 return false;
}
module.exports={watch,tap};
