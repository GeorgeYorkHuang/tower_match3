/**
 * 毒棒召唤物的表现状态：待机呼吸，仅在实际选中攻击目标时播放挥击。
 * 使用召唤物战斗时间，不依赖怪物缠绕状态、真实时间或随机数。
 */
'use strict';
const C = require('../config/vine-whip.js');

function begin(stick) {
  stick._stickVisual = { age: 0, idleElapsed: 0, attackElapsed: null, attackSpan: 0, flip: false };
}

function advance(stick, dt) {
  if (!(stick.ttl > 0)) {
    delete stick._stickVisual;
    return;
  }
  if (!stick._stickVisual) begin(stick);
  if (!(Number.isFinite(dt) && dt > 0)) return;
  const state = stick._stickVisual;
  state.age += dt;
  if (state.attackElapsed != null) {
    state.attackElapsed += dt;
    if (state.attackElapsed >= state.attackSpan) {
      state.idleElapsed = state.attackElapsed - state.attackSpan;
      state.attackElapsed = null;
    }
  } else state.idleElapsed += dt;
}

function attack(stick, target) {
  if (!(stick.ttl > 0) || !target || !(target.hp > 0)) return false;
  if (!stick._stickVisual) begin(stick);
  const interval = stick.atkI > 0 ? stick.atkI : 1;
  const state = stick._stickVisual;
  // 原素材 1.4 秒；按实际攻击间隔压缩，保证一次挥击完整结束并留出待机。
  state.attackSpan = Math.max(0.08, Math.min(C.attackPlayback.maximum, interval * C.attackPlayback.ratio));
  state.attackElapsed = 0;
  state.idleElapsed = 0;
  state.flip = target.x < stick.x;
  return true;
}

function sample(stick) {
  if (!stick || !(stick.ttl > 0)) return null;
  const state = stick._stickVisual;
  if (state && state.attackElapsed != null) {
    return {
      kind: 'attack',
      time: Math.min(C.attack.duration, state.attackElapsed / state.attackSpan * C.attack.duration),
      flip: state.flip,
    };
  }
  // 每次挥击结束都从呼吸首帧开始，与攻击末帧保持同一根部与姿态。
  const idleAge = state ? state.idleElapsed : 0;
  return { kind: 'idle', time: idleAge % C.idle.duration, flip: !!(state && state.flip) };
}

module.exports = { begin, advance, attack, sample };
