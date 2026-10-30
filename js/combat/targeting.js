'use strict';
// Shared targeting only; retain enemy references and caller-owned ordering.
const CONFIG = require('../config.js');
const COMBAT_BALANCE = require('../config/combat-common.js');

function range(combat, key) {
  const cfg = CONFIG.TOWERS[key];
  return Math.max(60, cfg.range - 50);   // v1.16.21：全塔射程统一缩小 50px（普攻/技能同口径）
}

function pickTarget(combat, key) {
  const r = combat.range(key);
  const mz = combat.towerMuzzle(key);
  let best = null, bestD = Infinity;
  combat.enemies().forEach((e) => {
    if (e.hp <= 0) return;
    const d = Math.hypot(e.x - mz.x, e.y - mz.y);
    if (d > r) return;
    if (d < bestD) { bestD = d; best = e; }
  });
  return best;
}

function pickAltTarget(combat, key, main) {
  const r = combat.range(key);
  const mz = combat.towerMuzzle(key);
  const y0 = main.y - COMBAT_BALANCE.alternateTargetBand, y1 = main.y;
  const cands = combat.enemies().filter((e) => e.hp > 0 && e !== main && e.y >= y0 && e.y <= y1 && Math.hypot(e.x - mz.x, e.y - mz.y) <= r);
  if (!cands.length) return main;
  return cands[Math.floor(Math.random() * cands.length)];
}

function towerMuzzle(combat, key) {
  const g = combat.game;
  const ly = combat.ly();
  if (g.state === 'testfield') return { x: 15 + 50, y: 1053 + 50 };   // 渲染 testFieldLayer 硬编码单塔大槽（100×100，中心 65,1103）
  const n = ly.slotCount || 4;
  const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
  const startX = (750 - rowW) / 2;
  const slotW = ly.slotSize + ly.slotGap;
  const idx = g.run.slotOrder.indexOf(key);
  return { x: startX + Math.max(0, idx) * slotW + ly.slotSize / 2, y: ly.slotY + ly.slotSize / 2 };
}

function inTowerRange(combat, key, x, y) {
  return Math.abs(combat.towerMuzzle(key).y - y) <= combat.range(key);
}

module.exports = { range, pickTarget, pickAltTarget, towerMuzzle, inTowerRange };
