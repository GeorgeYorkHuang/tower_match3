/**
 * 每门召唤炮台独立的表现进度：由实际攻击触发，跟随战斗时间推进。
 * 不读取真实时间、不触发伤害、不按坐标共享状态。
 */
'use strict';
const C = require('../config/turret-vfx.js');

function begin(turret) {
  turret._turretVisual = { age: 0, idleElapsed: 0, fireElapsed: null, fireSpan: 0, flip: false };
}

function advance(turret, dt) {
  if (!(turret.ttl > 0)) {
    delete turret._turretVisual;
    return;
  }
  if (!turret._turretVisual) begin(turret);
  if (!(Number.isFinite(dt) && dt > 0)) return;
  const state = turret._turretVisual;
  state.age += dt;
  if (state.fireElapsed == null) state.idleElapsed += dt;
  else {
    state.fireElapsed += dt;
    if (state.fireElapsed >= state.fireSpan) {
      state.idleElapsed = state.fireElapsed - state.fireSpan;
      state.fireElapsed = null;
    }
  }
}

function fire(turret, target) {
  if (!(turret.ttl > 0) || !target || !(target.hp > 0)) return false;
  if (!turret._turretVisual) begin(turret);
  const state = turret._turretVisual;
  const interval = turret.atkI > 0 ? turret.atkI : 1;
  // C 分支最快 0.7 秒攻击一次；完整复位后保留短暂停顿，避免不断重置开火。
  state.fireSpan = Math.max(0.08, Math.min(C.firePlayback.maximum, interval * C.firePlayback.ratio));
  state.fireElapsed = 0;
  state.idleElapsed = 0;
  state.flip = target.x < turret.x;
  return true;
}

function sample(turret) {
  if (!turret || !(turret.ttl > 0)) return null;
  const state = turret._turretVisual;
  if (state && state.fireElapsed != null) {
    return { kind: 'fire', time: Math.min(C.fire.duration, state.fireElapsed / state.fireSpan * C.fire.duration), flip: state.flip };
  }
  return { kind: 'idle', time: (state ? state.idleElapsed : 0) % C.idle.duration, flip: !!(state && state.flip) };
}

module.exports = { begin, advance, fire, sample };
