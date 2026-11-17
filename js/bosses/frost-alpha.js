'use strict';
const CONFIG = require('../config.js');
const B = require('../config/bosses.js').frost_alpha;
const FieldEnemies = require('../field-enemies.js');

function enabled(g) { return g.menuStage === B.field && g.run.wave === B.wave && g.state !== 'testfield'; }
function entries(g) {
  const profile = FieldEnemies.ofGame(g);
  return B.adds.map((lv) => { const c = CONFIG.ENEMY.levelOf(lv), s = profile && FieldEnemies.stats(profile, lv, c.type); return { lv, type: c.type, hp: s ? s.hp : c.hp, offset: 0.5, isBoss: false }; });
}
function setup(director) {
  const g = director.game;
  if (!enabled(g)) return false;
  director._eid = g.enemies.reduce((next, e) => Math.max(next, Number(e.id) + 1 || 0), director._eid);
  g.run.bossLock = true; g.run.bossEnemy = null;
  g.run.bossEncounter = { id: B.id, waveNo: B.wave, phase: 1, members: [], finished: false,
    elapsed: 0, nextChargeAt: B.chargePeriod, chargeState: 'run', stateUntil: 0,
    nextAddsAt: B.openingAddsDelay, openingAddsSent: false };
  director.plan = [{ lv: 9, type: 'boss', hp: B.hp, offset: 0.5, isBoss: true, bossId: B.id }];
  director.hasBoss = true; director.interval = B.spawnInterval;
  director.enemyTotalHp = B.hp + entries(g).reduce((sum, item) => sum + item.hp, 0);
  g.run.bossWaveHp = director.enemyTotalHp; g.run.bossWaveNo = B.wave;
  if (g.fx) g.fx.push({ type: 'floatText', text: '第20波 · 裂风狼王·霜牙', x: 375, y: director.ly.areaY + director.ly.entryH + 100, t: 0, dur: 3, size: 28, color: '#a6e8ff' });
  return true;
}
function spawn(g, e, id) {
  if (id !== B.id) return;
  e.bossId = B.id; e.bossName = B.name; e.phase = 1;
  e.hp = e.maxHp = e.delayHp = B.hp; e.armor = B.armor; e.attack = B.attack; e.attackInterval = B.attackInterval;
  e.speed = (g.wave.ly.wallY - g.wave.ly.areaY - g.wave.ly.entryH) / CONFIG.WAVE.seconds * B.speed / 1.5;
  e.bossArtKey = B.id; e.controlResist = 0.5;
  g.run.bossEnemy = e; g.run.bossEncounter.members = [e];
}
function addOpening(g, q) {
  if (q.openingAddsSent || q.elapsed < B.openingAddsDelay) return;
  q.openingAddsSent = true;
  g.wave.plan.push(...entries(g).map((item) => ({ ...item, isSummon: true, bossOpeningAdd: true })));
  g.wave.planDoneAt = null;
}
function summon(g, q) {
  const living = g.enemies.filter((e) => e.hp > 0 && e.bossSummonId === B.id).length;
  const count = Math.min(Math.max(0, B.summonLimit - living), B.summonCount);
  if (!count) return;
  const c = CONFIG.ENEMY.levelOf(B.summonLv);
  for (let i = 0; i < count; i++) g.wave.plan.push({ lv: B.summonLv, type: c.type, hp: B.summonHp,
    offset: 0.5, isBoss: false, isSummon: true, bossSummonId: B.id });
  q.summonedHp = (q.summonedHp || 0) + B.summonHp * count;
  if (g.run.bossEnemy) { g.run.bossEnemy.bossAnimState = 'summon'; g.run.bossEnemy.bossAnimUntil = q.elapsed + 0.8; }
  g.run.bossWaveHp += B.summonHp * count; g.wave.enemyTotalHp = g.run.bossWaveHp; g.wave.planDoneAt = null;
}
function beginCharge(g, q, e) {
  q.chargeState = 'windup'; q.stateUntil = q.elapsed + B.chargeWindup;
  g.fx.push({ type: 'floatText', text: '霜牙蓄势突袭！', x: e.x, y: e.y - 60, t: 0, dur: B.chargeWindup, size: 24, color: '#b7efff' });
}
function tick(g, dt) {
  const q = g.run.bossEncounter, e = g.run.bossEnemy;
  if (!g.run.bossLock || !q || q.id !== B.id || q.finished || !e || e.hp <= 0) return;
  q.elapsed += Math.max(0, dt); addOpening(g, q);
  if (e.bossAnimState && q.elapsed >= (e.bossAnimUntil || 0)) e.bossAnimState = '';
  e.bossStatus = q.chargeState === 'windup' ? '蓄势突袭' : q.chargeState === 'dash' ? '高速突袭' : q.chargeState === 'fatigue' ? '突袭疲惫' : '狼群协同';
  if (e.hp / e.maxHp <= B.threshold && q.phase === 1) {
    q.phase = 2; e.phase = 2; q.nextChargeAt = q.elapsed + B.phaseChargePeriod;
    q.chargeState = 'run'; q.stateUntil = 0;
    g.fx.push({ type: 'floatText', text: '霜牙狂奔 · 突袭加快', x: e.x, y: e.y - 65, t: 0, dur: 2, size: 25, color: '#d7f7ff' });
  }
  if (q.chargeState === 'windup' && q.elapsed >= q.stateUntil) {
    q.chargeState = 'dash'; q.stateUntil = q.elapsed + B.chargeDuration;
  } else if (q.chargeState === 'dash' && q.elapsed >= q.stateUntil) {
    q.chargeState = 'fatigue'; q.stateUntil = q.elapsed + B.fatigueDuration;
    g.fx.push({ type: 'floatText', text: '突袭结束 · 霜牙疲惫', x: e.x, y: e.y - 58, t: 0, dur: 1.5, size: 22, color: '#d7f7ff' });
  } else if (q.chargeState === 'fatigue' && q.elapsed >= q.stateUntil) q.chargeState = 'run';
  if (q.elapsed >= q.nextChargeAt && q.chargeState === 'run') {
    if (q.phase === 1) summon(g, q);
    beginCharge(g, q, e);
    q.nextChargeAt += q.phase === 1 ? B.chargePeriod : B.phaseChargePeriod;
  }
}
function moveScale(g, e) {
  if (!e || e.bossId !== B.id) return 1;
  const q = g.run && g.run.bossEncounter;
  if (!q || q.id !== B.id || q.finished || ['menu', 'gameover', 'testfield'].includes(g.state)) return 1;
  if (q.chargeState === 'windup' || q.chargeState === 'fatigue') return 0;
  return q.chargeState === 'dash' ? B.chargeSpeed : 1;
}
function onDeath(g, e) {
  const q = g.run.bossEncounter;
  if (!q || q.id !== B.id || e.bossId !== B.id || e.hp > 0 || q.finished) return false;
  q.finished = true; q.rewardGranted = true; return true;
}
module.exports = { enabled, setup, spawn, tick, moveScale, onDeath };
