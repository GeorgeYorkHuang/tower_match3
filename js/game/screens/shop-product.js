'use strict';
const C=require('../../config.js');
function chestDescription(key){
 const chest=C.SHOP_CHEST[key],tier=chest&&C.DEPTH_CHEST.tiers.find(t=>t.key===chest.tier);
 if(!tier)return '';
 return Object.entries(tier.fragments).map(([rar,n])=>({r:'蓝色',sr:'紫色',ssr:'金色'}[rar])+'碎片 '+(n[0]===n[1]?n[0]:n.join('～'))+'片').join('，')+(tier.ssrChance?'；额外金色碎片概率 '+Math.round(tier.ssrChance*100)+'%。':'。');
}
function brief(key,data,fallback){
 if(key==='shopShard'){const d=C.relicRunDef(data.relic);return d?d.desc:fallback;}
 if(key==='shopChest')return chestDescription(data.key);
 return fallback;
}
function paragraphs(panel){
 const p=panel,item=p.item;
 if(p.kind==='shard'){
  const d=C.relicRunDef(item.relic)||{};
  return ['购买获得 '+item.shards+' 片该圣遗物碎片，用于解锁或升星。','1★ · '+(d.desc||item.desc||'解锁后可在战斗中获取。'),d.star2?'2★ · '+d.star2:'',d.star3?'3★ · '+d.star3:'','每日限购一次，次日刷新。'].filter(Boolean);
 }
 if(p.kind==='chest')return ['开启奖励',chestDescription(item.key),'购买后立即开启，碎片随机分配至对应品质圣遗物；不含金币、钻石。','今日剩余 '+item.left+' / '+C.SHOP_CHEST[item.key].daily+' 次。'];
 if(p.kind==='adReward')return [item.desc,'需完整观看广告，每日限领一次。'];
 return [item.desc||'购买后立即发放奖励。',p.kind==='diamondScarlet'?'只在对应系列红卡中随机，不跨系列。':'奖励购买后立即到账。'];
}
module.exports={brief,paragraphs,chestDescription};
