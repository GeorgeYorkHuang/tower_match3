'use strict';
const CONFIG = require('../config.js');
const B = require('../config/bosses.js').altar_vera;
const EPS = 1e-9;
function enabled(g) { return g.menuStage === B.field && g.run.wave === B.wave && g.state !== 'testfield'; }
function entries(levels) { return levels.map(lv => { const c = CONFIG.ENEMY.levelOf(lv); return { lv, type: c.type, hp: c.hp, offset: 0.5, isBoss: false }; }); }
function setup(director) {
  const g = director.game;
  if (!enabled(g)) return false;
  director._eid = g.enemies.reduce((next, e) => Math.max(next, Number(e.id) + 1 || 0), director._eid);
  g.run.bossLock = true; g.run.bossEnemy = null;
  g.run.bossEncounter = {
    id: B.id, waveNo: B.wave, final: true, phase: 1, members: [], elapsed: 0,
    nextSummonAt: B.summonPeriod, nextWardAt: Infinity, nextRiftAt: Infinity,
    hasteMultiplier: 1, finished: false, rewardGranted: false, summonedHp: 0, wallDamage: 0,
  };
  director.plan = [{ lv: B.genLv, type: 'boss', hp: B.hp, offset: 0.5, isBoss: true, bossId: B.id }, ...entries(B.adds[0])];
  director.hasBoss = true; director.interval = B.spawnInterval;
  director.enemyTotalHp = B.hp + B.adds.flat().reduce((sum, lv) => sum + CONFIG.ENEMY.levelOf(lv).hp, 0);
  g.run.bossWaveHp = director.enemyTotalHp; g.run.bossWaveNo = B.wave;
  if (g.fx && !g.run.veraAnnounced) {
    g.run.veraAnnounced = true;
    g.fx.push({ type: 'floatText', text: '第60波 · 裂坛圣母降临', x: 375, y: director.ly.areaY + director.ly.entryH + 100, t: 0, dur: 3, size: 30, color: '#ffcf7a' });
  }
  return true;
}
function spawn(g, e, id) {
  if (id !== B.id) return;
  const ly = g.wave.ly, entry = ly.areaY + ly.entryH;
  e.bossId = B.id; e.bossName = B.name; e.phase = 1;
  e.hp = e.maxHp = e.delayHp = B.hp; e.armor = B.armor; e.attack = B.attack;
  e.speed = (ly.wallY - entry) / CONFIG.WAVE.seconds * B.speed / 1.5;
  e.isFinalBoss = true; e.bossPlaceholder = false; e.immuneFreeze = true; e.immuneKnockback = true; e.frozen = 0;
  e.bossStandoffY = entry + (ly.wallY - entry) * B.standoffRatio;
  g.run.bossEnemy = e; g.run.bossEncounter.members = [e];
}
function afterDamage(g, e) {
  const q = g.run.bossEncounter;
  if (!q || q.id !== B.id || e.bossId !== B.id || q.finished) return;
  // A large hit may cross both thresholds: enter each phase once without swallowing damage.
  while (q.phase < 3 && e.hp <= e.maxHp * B.thresholds[q.phase - 1]) {
    q.phase++; e.phase = q.phase; e._bossStun = B.phaseStun;
    g.wave.plan.push(...entries(B.adds[q.phase - 1])); g.wave.planDoneAt = null;
    if (q.phase === 2) q.nextWardAt = q.elapsed + B.wardPeriod;
    if (q.phase === 3) { q.nextRiftAt = q.elapsed + B.riftPeriod; e.speed *= B.phaseSpeedMultiplier; }
    g.fx.push({ type: 'floatText', text: '薇拉 · ' + B.phaseNames[q.phase - 1], x: e.x, y: e.y - 65, t: 0, dur: 2, size: 26, color: '#ffcf7a' });
  }
}
function summon(g, q) {
  const ly = g.wave.ly, half = CONFIG.LAYOUT.enemy.runner / 2;
  for (let i = 0; i < B.summonCount; i++) g.wave.plan.push({
    lv: B.summonLv, type: 'runner', hp: B.summonHp, offset: 0.5, isBoss: false,
    isSummon: true, spawnX: i % 2 ? ly.areaX + ly.areaW - B.edgeInset - half : ly.areaX + B.edgeInset + half,
  });
  q.summonedHp += B.summonHp * B.summonCount; g.run.bossWaveHp += B.summonHp * B.summonCount;
  g.wave.enemyTotalHp = g.run.bossWaveHp; g.wave.planDoneAt = null;
}
function tick(g, dt) {
  const q = g.run.bossEncounter, e = g.run.bossEnemy;
  if (!g.run.bossLock || !q || q.id !== B.id || q.finished || !e || e.hp <= 0) return;
  e._bossStun = Math.max(0, (e._bossStun || 0) - dt);
  const end = q.elapsed + Math.max(0, dt);
  while (q.elapsed < end - EPS) {
    const next = Math.min(end, q.nextSummonAt, q.nextWardAt, q.nextRiftAt);
    q.elapsed = next;
    if (q.nextSummonAt <= next + EPS) { summon(g, q); q.nextSummonAt += B.summonPeriod; }
    if (q.nextWardAt <= next + EPS) {
      e.armor = Math.min(B.wardArmorCap, e.armor + B.wardArmorStep);
      q.hasteMultiplier = B.hasteMultiplier; q.nextWardAt += B.wardPeriod;
      g.fx.push({ type: 'floatText', text: '圣坛庇护 · 减伤' + Math.round(e.armor * 100) + '%', x: e.x, y: e.y - 50, t: 0, dur: 1.5, size: 23, color: '#ffdf88' });
    }
    if (q.nextRiftAt <= next + EPS) {
      const damage = (g.run.lineMaxHp || CONFIG.LINE.hp) * B.riftWallRatio;
      const before = Math.max(0, g.run.lineHp);
      g.run.lineHp = Math.max(0, before - damage); q.wallDamage += before - g.run.lineHp;
      q.nextRiftAt += B.riftPeriod;
      g.fx.push({ type: 'floatText', text: '裂痕爆发 −' + Math.round(before - g.run.lineHp), x: 375, y: g.ly.wallY - 30, t: 0, dur: 1, size: 24, color: '#ff8c72' });
      if (g.run.lineHp <= 0) { g.run.broken = true; break; }
    }
  }
}
function onDeath(g, e) {
  const q = g.run.bossEncounter;
  if (!q || q.id !== B.id || !q.members.includes(e) || q.rewardGranted || e.hp > 0) return false;
  q.finished = true; q.rewardGranted = true; q.hasteMultiplier = 1;
  return true;
}
function moveScale(g) {
  const q = g.run && g.run.bossEncounter;
  return g.run && g.run.bossLock && q && q.id === B.id && !q.finished && !['menu', 'gameover', 'testfield'].includes(g.state) ? q.hasteMultiplier : 1;
}
module.exports = { enabled, setup, spawn, afterDamage, tick, onDeath, moveScale };
