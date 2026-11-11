/** 普通炮弹发射前预判固定落点；到点后只按原目标是否实际命中区分直击和溅射。 */
'use strict';
const Collision = require('./collision.js');
function configure(combat, shot) {
  if(shot.key!=='cannon' || !shot.target || shot.scatter || shot.sweep || shot.onReach || shot.chainFlight)return;
  const g=combat.game, target=shot.target;
  const seconds=Math.max(0,shot.dur-shot.t);
  const ly=combat.ly();
  const predicted=g.predictEnemyPosition ? g.predictEnemyPosition(target,seconds) : {
    x:target.x,y:Math.min(ly.wallY-Math.max(10,(target.size||40)*0.5),target.y+(target.speed||0)*seconds),
  };
  shot.fixedImpact={x:predicted.x,y:predicted.y};
  shot.tx=predicted.x;shot.ty=predicted.y;
  if(shot.visual) {
    shot.visual.tx=predicted.x;shot.visual.ty=predicted.y;
    shot.visual.target=null;shot.visual.aim=true;
  }
}
function resolve(combat,shot) {
  if(shot._impactDone)return;
  shot._impactDone=true;
  const point=shot.fixedImpact, e=shot.target;
  const hit=e&&e.hp>0&&combat.enemies().includes(e)&&Math.hypot(e.x-point.x,e.y-point.y)<=Collision.reach(e,35);
  if(hit) {
    shot.impactPosition=point;
    combat.hit('cannon',e,shot.dmg,shot);
    if(shot.onAfterHit)shot.onAfterHit(e,shot.dmg);
  } else combat.missCannon(shot.dmg,point);
}
module.exports={configure,resolve};
