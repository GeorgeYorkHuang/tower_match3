'use strict';
const CFG=require('../config/rewarded-ads.js');
const {todayStr}=require('./calendar.js');
const Deep=require('../relics/deep-chests.js');
function daily(meta,now) { const date=todayStr(now); return meta.adDaily && meta.adDaily.date===date ? meta.adDaily : {date,diamond:0,chest:0}; }
function canClaim(meta,key,now) { return ['diamond','chest'].includes(key) && !(daily(meta,now)[key]>0); }
function claimDaily(meta,key,options={}) {
  if(!canClaim(meta,key,options.now))return {ok:false,reason:'limit'};
  let gain;
  if(key==='diamond') { meta.diamond+=CFG.dailyDiamond; gain={diamond:CFG.dailyDiamond}; }
  else {
    const shadow=Object.create(meta);shadow.shards=Object.assign({},meta.shards);shadow.relicDust=meta.relicDust||0;
    shadow.deepChests=[{tier:CFG.dailyChestTier,openAt:0}];
    gain=Deep.createDeepChestService({now:()=>options.now||Date.now(),random:options.random}).openDeepChest(shadow,0);
    if(!gain)return {ok:false,reason:'reward'};
    meta.shards=shadow.shards;meta.relicDust=shadow.relicDust;gain.gold=0;gain.diamond=0;
  }
  meta.adDaily=Object.assign({},daily(meta,options.now),{[key]:1});
  return {ok:true,gain};
}
function doubleSettlement(meta,summary) {
  if(!summary||!summary.evacuated||summary.adDoubled)return {ok:false,reason:'claimed'};
  const gold=(summary.payout||0)+(summary.silver||0);
  meta.gold+=gold;
  const extra={};let dust=0;
  Object.entries(summary.bonusShardDetail||{}).forEach(([id,n])=>{const got=meta.addShard(id,n);if(got.kept)extra[id]=got.kept;dust+=got.dust;});
  summary.payout=(summary.payout||0)*2;summary.silver=(summary.silver||0)*2;
  summary.shards=(summary.shards||0)*2;summary.shardsRaw=(summary.shardsRaw||0)*2;
  summary.relicDust=(summary.relicDust||0)+dust;
  for(const [id,n] of Object.entries(extra))summary.shardDetail[id]=(summary.shardDetail[id]||0)+n;
  summary.adDoubled=true;
  return {ok:true,gold,dust};
}
module.exports={daily,canClaim,claimDaily,doubleSettlement};
