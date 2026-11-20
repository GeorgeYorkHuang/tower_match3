'use strict';
const T=require('./model.js');
function build(meta,slot,id){
 const copy={...meta,talents:T.normalize(meta)},before=T.analyze(meta);
 const error=T.equip(copy,slot,id);if(error)return {error};
 const after=T.analyze(copy),lines=[];
 const names={fire:'火塔',ice:'冰塔',poison:'毒塔',electric:'电塔',cannon:'炮塔',boomerang:'回旋塔'};
 const labels={attack:'攻击',speed:'攻速',charge:'充能',damage:'伤害',skill:'技能伤害',dot:'负面效果',duration:'负面时长'};
 for(const tower of Object.keys(names)){
  const changes=[];for(const key of Object.keys(labels)){
   const a=(before.bonuses[tower]||{})[key]||0,b=(after.bonuses[tower]||{})[key]||0;
   if(Math.abs(a-b)<1e-8)continue;
   const fmt=v=>key==='attack'?String(v):key==='duration'?Number(v.toFixed(2))+'秒':Number((v*100).toFixed(1))+'%';
   changes.push(labels[key]+' '+fmt(a)+'→'+fmt(b));
  }if(changes.length)lines.push(names[tower]+'：'+changes.join('，'));
 }
 for(const kind of ['purple','gold'])for(const sign of [1,-1]){
  const from=sign>0?before:after,to=sign>0?after:before;
  for(const card of to[kind])if(!from[kind].includes(card))lines.push((sign>0?'新增：':'失去：')+T.get(card)[kind].name);
 }
 const ranks={r:1,sr:2,ssr:3};
 if(before.rank!==after.rank)lines.push('羁绊：'+(before.rank||'无')+'→'+(after.rank||'无'));
 if(before.state.center&&(ranks[after.rank]||0)<(ranks[before.rank]||0))lines.push('羁绊品质下降，请重新确认中央自选资格');
 return {before,after,lines:lines.length?lines:['属性无变化'],card:after.cards.find(c=>c.id===id)};
}
module.exports={build};
