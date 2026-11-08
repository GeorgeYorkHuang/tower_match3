'use strict';
const {fillRoundRect,text,button}=require('../ui.js');
function draw(ctx,game) {
 game._doubleAdHit=null;game._reviveAdHits=null;
 if(game.state==='reviveOffer'){
   ctx.fillStyle='rgba(0,0,0,0.76)';ctx.fillRect(0,0,750,1626);
   fillRoundRect(ctx,75,500,600,490,24,'#213c2d');
   text(ctx,'防线失守',375,567,42,'#ffe3a0','center');
   text(ctx,'恢复50%生命 · 防线保护3秒',375,637,25,'#e1e8d2','center');
   text(ctx,'每局限复活一次',375,685,22,'#c3c8ac','center');
   game._reviveAdHits={watch:button(ctx,135,735,480,76,game._adBusy?'广告加载中…':'观看广告复活',{bg:'#537943',fontSize:29}).hit,
     decline:button(ctx,135,850,480,66,'放弃复活 · 结算',{bg:'#66574b',fontSize:25}).hit};
 }
 if(game.state==='gameover'&&game.runSummary&&game.runSummary.evacuated){
   const claimed=game.runSummary.adDoubled;
   const label=claimed?'已领取双倍收益':game._adBusy?'广告加载中…':'观看广告 · 金币与碎片翻倍';
   const hit=button(ctx,100,1320,550,74,label,{bg:claimed?'#526052':'#61763b',fontSize:27}).hit;
   text(ctx,'通关宝箱不翻倍',375,1422,20,'#d7decc','center');
   if(!claimed)game._doubleAdHit=hit;
 }
}
module.exports={draw};
