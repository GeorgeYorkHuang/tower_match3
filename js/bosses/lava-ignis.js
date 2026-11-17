'use strict';
const CONFIG = require('../config.js');
const B = require('../config/boss-expansion.js').lava_ignis;
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
    elapsed: 0, finished: false, rewardGranted: false, nextHeatAt: B.suppressionPeriod,
    heatUntil: 0, nextSummonAt: Infinity, nextCastAt: Infinity, castEnd: Infinity,
    castDamage: 0, interrupts: 0, summonedHp: 0, wallDamage: 0 };
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
function beginCast(q, e) {
  q.nextCastAt = Infinity; q.castEnd = q.elapsed + B.castDuration;
  q.castDamage = 0; q.castHp = e.hp; q.castVisual = { at: q.elapsed };
}
function afterDamage(g, e) {
  const q = active(g);
  if (!q || e.bossId !== B.id) return;
  if (Number.isFinite(q.castEnd)) {
    q.castDamage += Math.max(0, q.castHp - Math.max(0, e.hp)); q.castHp = e.hp;
    if (e.hp > 0 && q.castDamage + EPS >= e.maxHp * B.interruptDamageRatio) {
      q.castEnd = Infinity; q.nextCastAt = q.elapsed + B.interruptDelay;
      q.interrupts++; q.interruptVisual = { at: q.elapsed };
    }
  }
  while (q.phase < 3 && e.hp <= e.maxHp * B.thresholds[q.phase - 1]) {
    q.phase++; e.phase = q.phase; e._bossStun = B.phaseStun;
    e.bossStatus = B.phaseNames[q.phase - 1]; q.phaseVisual = { at: q.elapsed, phase: q.phase };
    g.wave.plan.push(...entries(g, B.adds[q.phase - 1])); g.wave.planDoneAt = null;
    if (q.phase === 2) q.nextSummonAt = q.elapsed + B.summonPeriod;
    if (q.phase === 3 && e.hp > 0) beginCast(q, e);
  }
}
function hurtWall(g, ratio) {
  const q = active(g);
  if (!q || g.state === 'testfield' || g.run.adReviveProtection > 0) return;
  const before = Math.max(0, g.run.lineHp);
  g.run.lineHp = Math.max(0, before - (g.run.lineMaxHp || CONFIG.LINE.hp) * ratio);
  q.wallDamage += before - g.run.lineHp;
  if (g.run.lineHp <= 0) g.run.broken = true;
}
function summon(g, q) {
  const living = g.enemies.filter(e => e.hp > 0 && e.bossSummonId === B.id).length;
  const queued = g.wave.plan.filter(e => e.bossSummonId === B.id).length;
  const count = Math.min(B.summonCount, Math.max(0, B.summonLimit - living - queued));
  for (let i = 0; i < count; i++) g.wave.plan.push({ lv: B.summonLv, type: 'tank', hp: B.summonHp,
    offset: 0.5, isBoss: false, isSummon: true, bossSummonId: B.id });
  q.summonedHp += count * B.summonHp; g.run.bossWaveHp += count * B.summonHp;
  g.wave.enemyTotalHp = g.run.bossWaveHp;
  if (count) { g.wave.planDoneAt = null; q.summonVisual = { at: q.elapsed }; }
}
function tick(g, dt) {
  const q = active(g), e = g.run.bossEnemy;
  if (!q || !e || e.hp <= 0 || ['menu', 'gameover', 'testfield'].includes(g.state)) return;
  e._bossStun = Math.max(0, (e._bossStun || 0) - dt);
  const end = q.elapsed + Math.max(0, dt);
  while (q.elapsed < end - EPS) {
    q.elapsed = Math.min(end, q.nextHeatAt, q.nextSummonAt, q.nextCastAt, q.castEnd);
    if (q.elapsed + EPS >= q.nextHeatAt) {
      q.heatUntil = q.elapsed + B.suppressionDuration; q.nextHeatAt += B.suppressionPeriod;
      q.heatVisual = { at: q.elapsed };
    }
    if (q.elapsed + EPS >= q.nextSummonAt) { summon(g, q); q.nextSummonAt += B.summonPeriod; }
    if (q.elapsed + EPS >= q.nextCastAt) beginCast(q, e);
    if (q.elapsed + EPS >= q.castEnd) {
      hurtWall(g, B.wallDamageRatio); q.explosionVisual = { at: q.elapsed };
      beginCast(q, e);
      if (g.run.broken) break;
    }
  }
}
function coreAtWall(g, e) {
  if (!active(g) || e.bossSummonId !== B.id || e.hp <= 0 || e._ignisDetonated) return false;
  e._ignisDetonated = true;
  hurtWall(g, B.coreWallRatio);
  // 自爆是实体死亡，不经过攻击增伤/护甲乘区，也不记塔伤害。
  e.hp = 0; e._dying = true; e.lastDmgKey = 'global';
  g.combat.onKill(e);
  return true;
}
function attackScale(g) {
  const q = active(g);
  return q && !['menu', 'gameover', 'testfield'].includes(g.state) && q.heatUntil > q.elapsed + EPS ? 1 / B.intervalScale : 1;
}
function onDeath(g, e) {
  const q = active(g);
  if (!q || e.bossId !== B.id || !q.members.includes(e) || e.hp > 0 || q.rewardGranted) return false;
  q.finished = true; q.rewardGranted = true; q.heatUntil = 0; q.castEnd = q.nextCastAt = Infinity;
  return true;
}
function clearTemporary(g) {
  const q = g.run && g.run.bossEncounter;
  if (!q || q.id !== B.id) return;
  q.heatUntil = 0; q.castEnd = q.nextCastAt = Infinity; q.castDamage = 0;
}
module.exports = { setup, spawn, tick, afterDamage, attackScale, coreAtWall, onDeath, clearTemporary };
