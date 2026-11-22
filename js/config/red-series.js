'use strict';
// 系列六边形底板使用独立图片；新系列紫金处于设计中，不注册战斗效果。
module.exports=function(C){
 C.seriesNames={sanctum:'圣庭',forge:'熔铸',gale:'霜风'};
 for(const card of C.cards)card.icon='assets/images/redcards/'+card.id+'-v3.png';
 const base=C.cards.slice();
 for(const series of ['forge','gale'])for(const original of base){
  const card=JSON.parse(JSON.stringify(original));
  card.id='ur_'+series+'_'+card.tower;card.series=series;
  card.icon='assets/images/redcards/'+card.id+'-v3.png';
  card.name=C.seriesNames[series]+'·'+({fire:'炽核',ice:'凝晶',poison:'孢子',electric:'电弧',cannon:'炉心',boomerang:'回响'}[card.tower]);
  card.outlineColor=series==='forge'?'#e8603c':'#5dade2';
  for(const kind of ['purple','gold']){card[kind].key=series+'_'+card.tower;card[kind].enabled=false;card[kind].name=kind==='purple'?'二星紫天赋 · 设计中':'三星金天赋 · 设计中';card[kind].desc='设计中，当前不提供战斗效果。';}
  card.desc='1星覆盖4格，激活覆盖的固定塔攻击点及绿色属性点。';
  card.star2='2星覆盖8格；紫天赋设计中，暂不生效。';
  card.star3='3星覆盖12格；紫、金天赋设计中，暂不生效。';
  C.cards.push(card);
 }
 return C;
};
