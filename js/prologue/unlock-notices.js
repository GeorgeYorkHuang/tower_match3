/** 可查看的解锁项目列表；只读档案，不持有游戏或绘制状态。 */
'use strict';
const CONFIG=require('../config.js');
const PLAN=require('../config/prologue.js');
function available(meta){
  const result=[];
  for(const [key,name,hit,data] of [['match','三消技能','matchCfg'],['global','全局技能','globalCfg'],['shop','商店','tab','shop'],['relic','圣遗物','tab','relic']]){
    if((meta.encounters||{})[key])result.push({id:'feature:'+key,name,hit,data});
  }
  if(require('../talents/access.js').unlocked(meta))result.push({id:'feature:talent',name:'天赋',hit:'tab',data:'talent'});
  for(const key of Object.keys(CONFIG.TOWERS))if((meta.towerCodex||{})[key])result.push({id:'tower:'+key,name:(CONFIG.COLORS[CONFIG.TOWERS[key].color]||{}).name||key,hit:'codexSel',data:key});
  const cleared=(meta.prologue||{}).cleared||[];
  const stages=PLAN.order.slice(1).filter((id,i)=>cleared.includes(PLAN.order[i]));
  if(cleared.includes(PLAN.order[2]))stages.push('ancient');
  for(const [from,to]of [['ancient','lava'],['lava','frost'],['frost','abyss']])if((meta.fieldClears||{})[from])stages.push(to);
  for(const id of stages)result.push({id:'stage:'+id,name:(CONFIG.FIELDS[id]||{}).name||id,hit:'stage',data:id});
  return result;
}
module.exports={available};
