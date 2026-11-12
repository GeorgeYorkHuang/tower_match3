/** 地图怪物查询：不修改共享等级表；生命预算和实际出生共用同一数据源。 */
'use strict';
const CONFIG = require('./config.js');
const FIELDS = require('./config/field-enemies.js');
function profile(run,field) {
  return run && !(run.chapter && run.chapter.isPrologue) && run.wave >= 1 && run.wave <= 60 ? FIELDS[field] || null : null;
}
function ofGame(game) { return profile(game.run,game.menuStage); }
function count(p,wave) {
  const points=p.counts;
  for(let i=1;i<points.length;i++)if(wave<=points[i][0]){
    const [a,x]=points[i-1],[b,y]=points[i];
    return Math.round(x+(y-x)*(wave-a)/(b-a));
  }
  return points[points.length-1][1];
}
function stats(p,lv,type) {
  const row=p.levels[lv-1],base=CONFIG.ENEMY.levelOf(lv);
  if(!row)return null;
  const elite=type==='elite',e=p.elite;
  return {hp:elite?Math.round(row[0]*e.hp):row[0],
    armor:elite?Math.min(e.armorCap,row[1]+e.armorAdd):row[1],
    attack:elite?Math.round(row[2]*e.attack):row[2],
    speed:base.spd/1.5*p.speed*(elite?e.speed:1),
    attackInterval:p.attackInterval[elite?'elite':base.type]};
}
// 先交替排布普通/重型批和快速批，再均匀插入精英；Boss保持队尾。
function arrange(plan,p) {
  const bosses=plan.filter(e=>e.isBoss),elites=plan.filter(e=>e.type==='elite');
  let regular=plan.filter(e=>!e.isBoss&&e.type!=='elite');
  if(p.batch.restEvery){
    const fast=regular.filter(e=>e.type==='runner'),slow=regular.filter(e=>e.type!=='runner');regular=[];
    let turn=0;
    while(fast.length||slow.length){const source=(turn++%2?fast:slow);const pool=source.length?source:(fast.length?fast:slow);regular.push(...pool.splice(0,4));}
  }
  for(let i=elites.length-1;i>=0;i--)regular.splice(Math.round((i+1)*regular.length/(elites.length+1)),0,elites[i]);
  return regular.concat(bosses);
}
module.exports={ofGame,count,stats,arrange};
