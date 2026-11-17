'use strict';
const CONFIG = require('../config.js');
const B = require('../config/boss-expansion.js').frost_skall;
const FieldEnemies = require('../field-enemies.js');
const EPS = 1e-9;
function active(g) {
  const q = g.run && g.run.bossEncounter;
  return g.run && g.run.bossLock && q && q.id === B.id && !q.finished ? q : null;
}
function entries(g, levels) {
  const profile = FieldEnemies.ofGame(g);
  return levels.map(lv => {
    const c = CONFIG.ENEMY.levelOf(lv), s = profile && FieldEnemies.stats(profile, lv, c.type);
    return { lv, type: c.type, hp: s ? s.hp : c.hp, offset: 0.5, isBoss: false };
  });
}
function setup(d) {
  const g = d.game;
  if (g.menuStage !== B.field || g.run.wave !== B.wave || g.state === 'testfield') return false;
  d._eid = g.enemies.reduce((n, e) => Math.max(n, Number(e.id) + 1 || 0), d._eid);
  g.run.bossLock = true; g.run.bossEnemy = null;
  g.run.bossEncounter = { id: B.id, waveNo: B.wave, final: true, phase: 1, members: [],
    elapsed: 0, finished: false, rewardGranted: false, nextWindAt: B.suppressionPeriod,
    windUntil: 0, nextFreezeAt: Infinity, freezeApplyAt: Infinity,
    freezeTargets: [], frozenUntil: {}, shadowsSent: [], summonedHp: 0 };
  d.plan = [{ lv: B.genLv, type: 'boss', hp: B.hp, isBoss: true, bossId: B.id, offset: 0.5 }, ...entries(g, B.adds[0])];
  d.hasBoss = true; d.interval = B.spawnInterval;
  d.enemyTotalHp = B.hp + entries(g, B.adds.flat()).reduce((sum, e) => sum + e.hp, 0);
  g.run.bossWaveHp = d.enemyTotalHp; g.run.bossWaveNo = B.wave;
  return true;
}
function spawn(g, e, id) {
  if (id !== B.id) return;
  const ly = g.wave.ly, entry = ly.areaY + ly.entryH;
  Object.assign(e, { bossId: B.id, bossName: B.name, bossArtKey: B.id, phase: 1,
    hp: B.hp, maxHp: B.hp, delayHp: B.hp, armor: B.armor, attack: B.attack,
    speed: (ly.wallY - entry) / CONFIG.WAVE.seconds * B.speed / 1.5,
    isFinalBoss: true, bossPlaceholder: false, immuneFreeze: true, immuneKnockback: true, frozen: 0,
    bossStandoffY: entry + (ly.wallY - entry) * B.standoffRatio, bossStatus: B.phaseNames[0] });
  g.run.bossEnemy = e; g.run.bossEncounter.members = [e];
}
function afterDamage(g, e) {
  const q = active(g);
  if (!q || e.bossId !== B.id || e.hp <= 0) return;
  while (q.phase < 3 && e.hp <= e.maxHp * B.thresholds[q.phase - 1]) {
    q.phase++; e.phase = q.phase; e._bossStun = B.phaseStun;
    e.bossStatus = B.phaseNames[q.phase - 1]; q.phaseVisual = { at: q.elapsed, phase: q.phase };
    g.wave.plan.push(...entries(g, B.adds[q.phase - 1])); g.wave.planDoneAt = null;
    if (q.phase === 3) q.nextFreezeAt = q.elapsed + B.freezePeriod;
  }
  B.shadowThresholds.forEach((threshold, i) => {
    if (q.shadowsSent[i] || e.hp > e.maxHp * threshold) return;
    q.shadowsSent[i] = true; q.shadowVisual = { at: q.elapsed };
    for (let n = 0; n < B.shadowCount; n++) g.wave.plan.push({ lv: B.shadowLv, type: 'runner', hp: B.shadowHp,
      offset: 0.5, isBoss: false, isSummon: true, bossSummonId: B.id,
      spawnX: n % 2 ? g.ly.areaX + g.ly.areaW - B.edgeInset : g.ly.areaX + B.edgeInset });
    q.summonedHp += B.shadowCount * B.shadowHp;
    g.run.bossWaveHp += B.shadowCount * B.shadowHp; g.wave.enemyTotalHp = g.run.bossWaveHp;
    g.wave.planDoneAt = null;
  });
}
function spawnSummon(g, e) {
  if (e.bossSummonId !== B.id) return;
  const ly = g.wave.ly;
  e.speed = (ly.wallY - ly.areaY - ly.entryH) / CONFIG.WAVE.seconds * B.shadowSpeed / 1.5;
}
function keys(g) {
  return [...new Set(g.run.slotOrder || [])].filter(k => {
    const t = g.run.effects.tower(k); return t && t.level > 0;
  });
}
function tick(g, dt) {
  const q = active(g), e = g.run.bossEnemy;
  if (!q || !e || e.hp <= 0 || ['menu', 'gameover', 'testfield'].includes(g.state)) return;
  e._bossStun = Math.max(0, (e._bossStun || 0) - dt);
  const end = q.elapsed + Math.max(0, dt);
  while (q.elapsed < end - EPS) {
    q.elapsed = Math.min(end, q.nextWindAt, q.nextFreezeAt, q.freezeApplyAt);
    if (q.elapsed + EPS >= q.nextWindAt) {
      q.windUntil = q.elapsed + B.suppressionDuration; q.nextWindAt += B.suppressionPeriod;
      q.windVisual = { at: q.elapsed };
    }
    if (q.elapsed + EPS >= q.nextFreezeAt) {
      const candidates = keys(g);
      // Fisher–Yates partial selection: distinct activated slots, no comparator RNG.
      for (let i = 0; i < Math.min(B.freezeTowerCount, candidates.length); i++) {
        const j = i + Math.floor(Math.random() * (candidates.length - i));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      q.freezeTargets = candidates.slice(0, B.freezeTowerCount);
      q.freezeApplyAt = q.elapsed + B.freezeWarning; q.nextFreezeAt += B.freezePeriod;
    }
    if (q.elapsed + EPS >= q.freezeApplyAt) {
      const activated = new Set(keys(g));
      for (const k of q.freezeTargets) if (activated.has(k)) q.frozenUntil[k] = q.elapsed + B.freezeDuration;
      q.freezeTargets = []; q.freezeApplyAt = Infinity;
    }
  }
}
function towerFrozen(g, key) {
  const q = active(g);
  return !!(q && !['menu', 'gameover', 'testfield'].includes(g.state) && (q.frozenUntil[key] || 0) > q.elapsed + EPS);
}
function attackScale(g) {
  const q = active(g);
  return q && !['menu', 'gameover', 'testfield'].includes(g.state) && q.windUntil > q.elapsed + EPS ? 1 / B.intervalScale : 1;
}
function onDeath(g, e) {
  const q = active(g);
  if (!q || e.bossId !== B.id || !q.members.includes(e) || e.hp > 0 || q.rewardGranted) return false;
  q.finished = true; q.rewardGranted = true; q.windUntil = 0;
  q.frozenUntil = {}; q.freezeTargets = []; q.freezeApplyAt = Infinity;
  return true;
}
function clearTemporary(g) {
  const q = g.run && g.run.bossEncounter;
  if (!q || q.id !== B.id) return;
  q.windUntil = 0; q.frozenUntil = {}; q.freezeTargets = [];
  q.freezeApplyAt = q.nextFreezeAt = Infinity;
}
module.exports = { setup, spawn, spawnSummon, tick, afterDamage, attackScale, towerFrozen, onDeath, clearTemporary };
