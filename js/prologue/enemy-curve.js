/** 前两章敌人预算：最终血量/护甲按章内波次插值，不再乘正式怪物代际倍率。 */
'use strict';
const LEVEL={normal:1,runner:2,tank:3};
function progress(chapter,wave){return Math.max(0,Math.min(1,(wave-1)/Math.max(1,chapter.enemyCurve.plateauWave-1)));}
function lerp(values,t){return values[0]+(values[1]-values[0])*t;}
function stats(chapter,wave,type){
  const curve=chapter&&chapter.enemyCurve;
  if(!curve)return null;
  const t=progress(chapter,wave),range=curve.hp[type]||curve.hp.normal;
  return {hp:Math.round(lerp(range,t)),armor:Math.round(lerp(curve.armor,t)*10000)/10000};
}
function ordinary(chapter,wave,index){
  const c=chapter.enemyCurve;
  const type=wave>=c.tankStartWave&&(index+1)%c.tankEvery===0?'tank':(index+1)%c.runnerEvery===0?'runner':'normal';
  return {type,lv:LEVEL[type],...stats(chapter,wave,type)};
}
function plannedHp(chapter,wave,item){
  const value=stats(chapter,wave,item.isBoss?'boss':item.type);
  return value?value.hp:null;
}
module.exports={stats,ordinary,plannedHp};
