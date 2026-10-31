const Collision = require('./collision.js');
'use strict';
// Shared projectile bookkeeping, target resolution and geometry. No cached game state.
const COMBAT_BALANCE = require('../config/combat-common.js');

function addProjectile(combat, shot, visual) {
  shot.visual = visual; visual.projectile = shot;
  combat.shots.push(shot); combat.game.fx.push(visual);
  return shot;
}

function resolveShot(combat, s) {
  const g = combat.game;
  const e = s.target;
  if (!e || e.hp <= 0 || !g.enemies.includes(e)) return; // 目标已死/消失 → 落空
  if (s.onHit) { s.onHit(e, s.dmg); return; }             // v1.13.2：自定义命中回调（多重火球分击等，不触发技能链）
  combat.hit(s.key, e, s.dmg);
}

function scatterCheck(combat, s) {
  const p = Math.max(0, Math.min(1, s.t / s.dur));
  const prev = Math.max(0, Math.min(1, s._collisionP || 0));
  const ax=s.sx+(s.tx-s.sx)*prev, ay=s.sy+(s.ty-s.sy)*prev;
  const bx=s.sx+(s.tx-s.sx)*p, by=s.sy+(s.ty-s.sy)*p;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,r=s.hitR||COMBAT_BALANCE.scatterHitRadius;
  s._collisionP=p;
  let first=null, at=Infinity;
  for(const e of combat.enemies()) {
    if(e.hp<=0 || e===s.ignoreTarget) continue;
    const u=len2?Math.max(0,Math.min(1,((e.x-ax)*dx+(e.y-ay)*dy)/len2)):0;
    if(Math.hypot(e.x-ax-u*dx,e.y-ay-u*dy)<=Collision.reach(e,r) && u<at){first=e;at=u;}
  }
  return first;
}

function sweepPos(s, p) {
  const dx = s.tx - s.sx, dy = s.ty - s.sy;
  const dist = Math.hypot(dx, dy) || 1;
  const cxn = dx / dist, cyn = dy / dist;          // 投掷方向单位向量
  const arcH = 160;                                 // 椭圆短半轴（弧高，垂直投掷方向）
  const a = dist / 2 + 20;                          // 长半轴（沿投掷方向，保证越过怪物）
  const cx = s.sx + cxn * (dist / 2);               // 椭圆中心（塔与怪物中点）
  const cy = s.sy + cyn * (dist / 2);
  const total = Math.PI * 1.9;                      // 342°：从塔端绕 0.95 圈回塔
  const ang = Math.PI + total * p;                  // p=0 在塔端（π），p≈0.53 越过怪物最远点，p=1 回到塔
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return {
    x: cx + a * cs * cxn - arcH * sn * cyn,
    y: cy + a * cs * cyn + arcH * sn * cxn,
  };
}

module.exports = { addProjectile, resolveShot, scatterCheck, sweepPos };
