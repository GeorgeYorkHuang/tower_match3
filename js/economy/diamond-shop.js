'use strict';
const DeepChests = require('../relics/deep-chests.js');
const OFFERS = {
 gold:{price:1,gold:1000,name:'金币兑换',desc:'消耗1钻石，获得1000金币。'},
 star:{price:10,name:'星辉宝箱',desc:'R碎片12～20、SR碎片12～18、SSR碎片4。立即开启，不含金币或钻石奖励。'},
 scarlet:{price:20,name:'猩红宝箱',desc:'随机获得一张红色圣遗物的1～3个碎片。立即开启，不含金币或钻石奖励。',icon:'assets/images/chests/scarlet-v2.png',shards:[1,3]}
};
for(const [key,field,name]of [['scarletSanctum','ancient','圣庭'],['scarletForge','lava','熔铸'],['scarletGale','frost','霜风']])OFFERS[key]={...OFFERS.scarlet,name:'猩红宝箱·'+name,field,unlockField:field,desc:'随机获得本系列红卡碎片1～3片；新系列紫金天赋设计中。'};
OFFERS.scarlet={...OFFERS.scarlet,field:'ancient',unlockField:'ancient'};
function buy(meta,key,options={}){
 const offer=OFFERS[key];if(!offer)return{ok:false,reason:'offer'};if(offer.unlockField&&require('../field-access.js').reason(offer.unlockField,meta,false))return{ok:false,reason:'locked'};if(meta.diamond<offer.price)return{ok:false,reason:'diamond'};let gain;
 if(key==='gold'){gain={gold:offer.gold};meta.gold+=offer.gold;}
 else if(offer.field){
  const pool=require('../config/red-relics.js').cards(offer.field);if(!pool.length)return{ok:false,reason:'reward'};
  const random=options.random||Math.random,def=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))],n=offer.shards[0]+Math.min(offer.shards[1]-offer.shards[0],Math.floor(random()*(offer.shards[1]-offer.shards[0]+1)));
  const shadow=Object.create(meta);shadow.shards={...meta.shards};shadow.relicDust=meta.relicDust||0;const result=require('../relics/progression.js').addShard(shadow,def.id,n);
  gain={gold:0,diamond:0,shards:n,shardDetail:{[def.id]:result.kept},dust:result.dust};meta.shards=shadow.shards;meta.relicDust=shadow.relicDust;
 }else{
  const shadow=Object.create(meta);shadow.shards={...meta.shards};shadow.relicDust=meta.relicDust||0;shadow.deepChests=[{tier:'star',openAt:0}];
  gain=DeepChests.createDeepChestService(options).openDeepChest(shadow,0);if(!gain)return{ok:false,reason:'reward'};gain.gold=0;gain.diamond=0;meta.shards=shadow.shards;meta.relicDust=shadow.relicDust;
 }
 meta.diamond-=offer.price;meta.totalDiamondSpent=(meta.totalDiamondSpent||0)+offer.price;return{ok:true,gain};
}
module.exports={buy,OFFERS};
