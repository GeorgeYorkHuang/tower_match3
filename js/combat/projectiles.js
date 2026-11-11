const Collision = require('./collision.js');
'use strict';
// Shared projectile bookkeeping, target resolution and geometry. No cached game state.
const COMBAT_BALANCE = require('../config/combat-common.js');
const BoomerangTrajectory = require('./boomerang-trajectory.js');
const CannonFlight = require('./cannon-flight.js');

function addProjectile(combat, shot, visual) {
  shot.visual = visual; visual.projectile = shot;
  combat.shots.push(shot); combat.game.fx.push(visual);
  return shot;
}

function resolveShot(combat, s) {
  if(s.fixedImpact) { CannonFlight.resolve(combat,s); return; }
  const g = combat.game;
  const e = s.target;
  if (!e || e.hp <= 0 || !g.enemies.includes(e)) return; // 目标已死/消失 → 落空
  if (s.onHit) { s.onHit(e, s.dmg, s, true); return; }   // ：自定义命中回调（多重火球分击等，不触发技能链）
  combat.hit(s.key, e, s.dmg, s);
  if (s.onAfterHit) s.onAfterHit(e, s.dmg);
}

function scatterCheck(combat, s) {
  const p = Math.max(0, Math.min(1, s.t / s.dur));
  const prev = Math.max(0, Math.min(1, s._collisionP || 0));
  const ax=s.sx+(s.tx-s.sx)*prev, ay=s.sy+(s.ty-s.sy)*prev;
  const bx=s.sx+(s.tx-s.sx)*p, by=s.sy+(s.ty-s.sy)*p;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,r=s.hitR||COMBAT_BALANCE.scatterHitRadius;
  let first=null, at=Infinity;
  for(const e of combat.enemies()) {
    if(e.hp<=0 || e===s.ignoreTarget || (s._pierceHitSet && s._pierceHitSet.has(e))) continue;
    const u=len2?Math.max(0,Math.min(1,((e.x-ax)*dx+(e.y-ay)*dy)/len2)):0;
    if(Math.hypot(e.x-ax-u*dx,e.y-ay-u*dy)<=Collision.reach(e,r) && u<at){first=e;at=u;}
  }
  // 穿透弹命中后从命中点继续扫剩余线段，避免同一帧跨过后续敌人。
  s._collisionP = first ? prev + (p - prev) * at : p;
  return first;
}

function hasRemainingScatterTarget(combat, s) {
  const dx = s.tx - s.sx, dy = s.ty - s.sy;
  const len2 = dx * dx + dy * dy;
  const after = Math.max(0, Math.min(1, s._collisionP || 0)) - 1e-5;
  const r = s.hitR || COMBAT_BALANCE.scatterHitRadius;
  return combat.enemies().some((e) => {
    if (e.hp <= 0 || (s._pierceHitSet && s._pierceHitSet.has(e))) return false;
    const u = len2 ? ((e.x - s.sx) * dx + (e.y - s.sy) * dy) / len2 : 0;
    if (u < after || u > 1) return false;
    const px = s.sx + u * dx, py = s.sy + u * dy;
    return Math.hypot(e.x - px, e.y - py) <= Collision.reach(e, r);
  });
}

function sweepPos(s, p) {
  return BoomerangTrajectory.position(s, Math.max(0, Math.min(1, p)));
}

module.exports = { addProjectile, resolveShot, scatterCheck, hasRemainingScatterTarget, sweepPos };
