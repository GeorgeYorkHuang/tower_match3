const ChainFlight = require('../chain-flight.js');
'use strict';
const CONFIG = require('../config.js');
// Queues, energy and timing remain on the caller-owned combat/run.

function periodicTimers() {
  return {
    fire: { '火柱': 'firePillar', '烈焰墙': 'fireWall', '火雨': 'fireRain' },
    ice: { '冰花': 'iceFlower', '冬珠': 'frostOrb', '冰墙': 'iceWall' },
    electric: { '极光电击': 'arc', '雷暴': 'storm' },                 // 活电=命中触发，非周期施放
    poison: { '毒池': 'pool', '毒棒': 'stick', '毒藤': 'vine' },      // 瘴气=驻场被动
    cannon: { '炮火支援': 'support', '地雷阵': 'mine', '炮台': 'turret' },
    boomerang: { '风暴镖': 'storm', '弹力镖': 'ringN' },               // 风痕=命中触发
  };
}

function _weakPeriod(combat, key) {
  const t = combat.tower(key);
  return t && t.energy <= 0 ? CONFIG.GLOBAL_SKILL.weakPeriod : 1;
}

function castPeriodicNow(combat, key) {
  const map = periodicTimers()[key];
  if (!map) return false;
  const names = Object.keys(map).filter((n) => combat.lv(key, n) > 0);
  if (!names.length) return false;
  const name = names[Math.floor(Math.random() * names.length)];
  combat.timers[map[name]] = (combat.timers[map[name]] || 0) + 1e9;   // 下一帧 tick 立即施放
  // 施放确认飘字（金色，棋盘联动反馈）
  if (combat.game && combat.game.run && combat.game.run.fxTarget) {
    combat.game.run.fxTarget.push({ type: 'floatText', text: name, x: 375, y: 300, t: 0, dur: 0.9, size: 18, color: '#f7c948' });
  }
  return true;
}

function spawnChainShots(combat, ent) {
  const g = combat.game;
  const { key, x, y } = ent;
  const main = combat.pickTarget(key);
  if (!main) return;
  let dmg = combat.shotDmg(key);
  const t = combat.tower(key);
  if (t && t.energy <= 0) dmg /= CONFIG.GLOBAL_SKILL.weakDmg;   // 去弱化：不受能量影响
  const cfg = CONFIG.TOWERS[key];
  const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
  const dur = cfg.shot.dur;
  // 每枚独立寻敌：主目标上方 40px 截面带内随机敌人（带内无其他敌人则回退主目标），避免所有子弹打向同一个敌人
  const target = combat.pickAltTarget(key, main);
  const chainFlight = ChainFlight.create(x, y, target.x, target.y, dur);
  const totalDuration = require('../config/chain-flight.js').maxFlightTime;
  combat.addProjectile({ key, target, dmg, t: 0, dur: totalDuration, sx: x, sy: y, x, y, chainFlight }, { type: 'shot', kind: cfg.shot.kind, color: tint, x, y, tx: target.x, ty: target.y, t: 0, dur: totalDuration, key, chainFlight });
  g.playSfx('shot', 0.25);
  // 消除格迸发小闪光（连消触发反馈）
  combat.fxFlash(x, y, tint);
}

function castEnergy(combat, key, name) {
  const t = combat.tower(key);
  if (!t) return;
  const cost = (CONFIG.SKILL_ENERGY && CONFIG.SKILL_ENERGY[name]) || 0;
  if (cost <= 0) return;
  if (t.energy < cost) return;
  t.energy = Math.max(0, t.energy - cost);
}

function bonusStrike(combat, key, shape) {
  const g = combat.game;
  const t = combat.tower(key);
  if (!t || t.level === 0) return;
  // v1.16.77 能量：三消额外攻击同样耗 0.5 能量；能量耗尽不取消，伤害走弱化态（shotDmg 内 ×0.5）
  // v1.16.96 弹药箱3★：能量不足时从备用能量库借用
  g.run.spendAttackEnergy(t);
  const tgt = combat.pickTarget(key);
  if (!tgt) return;
  const dmg = combat.shotDmg(key);
  const tint = CONFIG.TOWERS[key].color || '#fff';
  if (shape === '3') {
    // 三连：单发直击
    combat.damage(tgt, dmg, key);
    combat.fxFlash(tgt.x, tgt.y, tint, 0.3);
    combat.fxParticle(tgt.x, tgt.y - 8, tint, 4, 40, 0.4, 120, 4);
  } else if (shape === '4') {
    // 直4：双发（第二发 50%）
    combat.damage(tgt, dmg, key);
    combat.damage(tgt, dmg * 0.5, key);
    combat.fxFlash(tgt.x, tgt.y, tint, 0.35);
    combat.fxRing(tgt.x, tgt.y, tint, 36, 0.35, 3);
  } else if (shape === 'L5' || shape === '5') {
    // L5/直5：溅射爆
    combat.explode(tgt.x, tgt.y, 72, dmg, key, 0, false);
    combat.fxRing(tgt.x, tgt.y, tint, 60, 0.4, 4);
  } else {
    // 6+ 大消：大范围高伤爆
    combat.explode(tgt.x, tgt.y, 110, dmg * 1.5, key, 0, false);
    combat.fxRing(tgt.x, tgt.y, tint, 90, 0.5, 5);
    combat.fxFlash(tgt.x, tgt.y, '#ffffff', 0.4);
  }
}

module.exports = { periodicTimers, _weakPeriod, castPeriodicNow, spawnChainShots, castEnergy, bonusStrike };
