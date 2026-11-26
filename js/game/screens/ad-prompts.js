'use strict';
const {fillRoundRect,strokeRoundRect,text,button}=require('../ui.js');
const CONFIG=require('../../config.js');
// Read-only projection of the existing finishRun/settleRunShards payout rules.
function rewards(game) {
 const bonus=game.meta.relicBonus();
 const silver=Math.round(game.run.gold*CONFIG.EVAC.poolShare*(1+0.20*bonus.gold));
 const pool=game.depthPool||0, mult=(game.field&&game.field.deepMult)||1;
 const shards=Object.values(game.runShardDetail||{}).reduce((n,v)=>n+Math.max(0,v|0),0);
 return {gold:Math.round(pool*mult)+silver, keptGold:Math.round(pool*CONFIG.EVAC.deadRatio*mult)+Math.round(silver*CONFIG.EVAC.deadRatio),
   shards,keptShards:Math.floor(shards*CONFIG.SHARD_SETTLE.deadRatio)};
}
function defeatBackground(ctx) {
 fillRoundRect(ctx,65,480,620,520,24,'#19262b');
 // Layered stone frame and broken battlements stay behind all labels/buttons.
 strokeRoundRect(ctx,65,480,620,520,24,'#8e7660',3);
 strokeRoundRect(ctx,77,492,596,496,18,'#39494a',2);
 ctx.save();ctx.beginPath();require('../ui.js').roundRect(ctx,77,492,596,496,18);ctx.clip();
 ctx.fillStyle='#26363a';ctx.fillRect(77,492,596,136);
 ctx.fillStyle='#344348';
 for(let i=0;i<8;i++)ctx.fillRect(85+i*77,510+(i%3)*7,58,55);
 ctx.fillStyle='#111d23';ctx.fillRect(77,566,596,48);
 ctx.strokeStyle='rgba(160,126,91,.35)';ctx.lineWidth=2;
 for(const x of [118,610]){ctx.beginPath();ctx.moveTo(x,497);ctx.lineTo(x+13,535);ctx.lineTo(x-4,572);ctx.lineTo(x+18,605);ctx.stroke();}
 ctx.fillStyle='rgba(151,55,39,.20)';ctx.fillRect(77,605,596,7);
 ctx.restore();
}
function draw(ctx,game) {
 game._doubleAdHit=null;game._reviveAdHits=null;
 if(game.state==='reviveOffer'){
   ctx.fillStyle='rgba(0,0,0,0.76)';ctx.fillRect(0,0,750,1626);
   defeatBackground(ctx);
   text(ctx,'防线失守',375,566,42,'#ffe3a0','center');
   const income=rewards(game);
   fillRoundRect(ctx,95,635,560,204,14,'rgba(8,18,22,.70)');
   text(ctx,'本局收益',122,665,21,'#b5c2bf','left');
   text(ctx,'当前累计',410,665,21,'#e9dfbe','center');
   text(ctx,'放弃后获得',565,665,21,'#dfab90','center');
   text(ctx,'金币',122,718,25,'#e8ce83','left');
   text(ctx,String(income.gold),410,718,28,'#f3dfa4','center');
   text(ctx,String(income.keptGold),565,718,28,'#e3b79c','center');
   text(ctx,'圣物碎片',122,774,25,'#ccb2e8','left');
   text(ctx,String(income.shards),410,774,28,'#e9d9fa','center');
   text(ctx,String(income.keptShards),565,774,28,'#e3b79c','center');
   text(ctx,'金币已按结算规则折算',375,818,17,'#91a39c','center');
   game._reviveAdHits={
     decline:button(ctx,95,880,265,76,'放弃并结算',{bg:'#554845',fontSize:25,capsule:true,raised:true}).hit,
     watch:button(ctx,380,880,275,76,game._adBusy?'广告加载中…':'观看广告复活',{bg:'#537943',fontSize:25,capsule:true,raised:true}).hit
   };
 }
 if(game.state==='gameover'&&game.runSummary&&game.runSummary.evacuated){
   const claimed=game.runSummary.adDoubled;
   const label=claimed?'已领取双倍收益':game._adBusy?'广告加载中…':'观看广告 · 金币与碎片翻倍';
   const hit=button(ctx,100,1320,550,74,label,{bg:claimed?'#526052':'#61763b',fontSize:27}).hit;
   text(ctx,'通关宝箱不翻倍',375,1422,20,'#d7decc','center');
   if(!claimed)game._doubleAdHit=hit;
 }
}
module.exports={draw,rewards};
