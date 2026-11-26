'use strict';
// 系列六边形底板使用独立图片；18张卡保留库存，紫金效果由red-hybrid统一重置。
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
  C.cards.push(card);
 }
 return require('./red-hybrid.js')(C);
};
