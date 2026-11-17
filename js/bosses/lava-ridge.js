'use strict';
const CONFIG = require('../config.js');
const B = require('../config/bosses.js').lava_ridge;
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
    elapsed: 0, shellElapsed: 0, nextSummonAt: B.openingAddsDelay + B.summonPeriod,
    nextAddsAt: B.openingAddsDelay, openingAddsSent: false };
  director.plan = [{ lv: 9, type: 'boss', hp: B.hp, offset: 0.5, isBoss: true, bossId: B.id }];
  director.hasBoss = true; director.interval = B.spawnInterval;
  director.enemyTotalHp = B.hp + entries(g).reduce((sum, item) => sum + item.hp, 0);
  g.run.bossWaveHp = director.enemyTotalHp; g.run.bossWaveNo = B.wave;
  if (g.fx) g.fx.push({ type: 'floatText', text: '第20波 · 熔壳巨蜥·赤脊', x: 375, y: director.ly.areaY + director.ly.entryH + 100, t: 0, dur: 3, size: 28, color: '#ff9b53' });
  return true;
}
function spawn(g, e, id) {
  if (id !== B.id) return;
  e.bossId = B.id; e.bossName = B.name; e.phase = 1;
  e.hp = e.maxHp = e.delayHp = B.hp; e.armor = B.armor; e.attack = B.attack;
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
  const room = Math.max(0, B.summonLimit - living);
  const count = Math.min(room, B.summonCount);
  if (!count) return;
  const c = CONFIG.ENEMY.levelOf(B.summonLv);
  for (let i = 0; i < count; i++) g.wave.plan.push({ lv: B.summonLv, type: c.type, hp: B.summonHp,
    offset: 0.5, isBoss: false, isSummon: true, bossSummonId: B.id });
  q.summonedHp = (q.summonedHp || 0) + B.summonHp * count;
  if (g.run.bossEnemy) { g.run.bossEnemy.bossAnimState = 'summon'; g.run.bossEnemy.bossAnimUntil = q.elapsed + 0.9; }
  g.run.bossWaveHp += B.summonHp * count; g.wave.enemyTotalHp = g.run.bossWaveHp; g.wave.planDoneAt = null;
}
function tick(g, dt) {
  const q = g.run.bossEncounter, e = g.run.bossEnemy;
  if (!g.run.bossLock || !q || q.id !== B.id || q.finished || !e || e.hp <= 0) return;
  q.elapsed += Math.max(0, dt); addOpening(g, q);
  if (e.bossAnimState && q.elapsed >= (e.bossAnimUntil || 0)) e.bossAnimState = '';
  if (q.phase === 1) {
    q.shellElapsed = (q.shellElapsed + dt) % (B.closedSeconds + B.openSeconds);
    const closed = q.shellElapsed < B.closedSeconds;
    e.armor = closed ? B.armor : B.openArmor;
    e.bossStatus = closed ? '熔壳闭合' : '甲壳破绽';
    if (q.shellState !== closed) e.bossStatus = closed ? '熔壳闭合' : '熔壳开启';
    if (q.shellState !== closed) {
      if (q.shellState === true && closed === false) { e.bossAnimState = 'opening'; e.bossAnimUntil = q.elapsed + 0.45; }
      q.shellState = closed;
      g.fx.push({ type: 'floatText', text: closed ? '熔壳闭合 · 减伤35%' : '甲壳破绽 · 减伤5%', x: e.x, y: e.y - 58, t: 0, dur: 1.3, size: 22, color: closed ? '#ffad5b' : '#fff0b0' });
    }
    if (e.hp / e.maxHp <= B.threshold) {
      q.phase = 2; e.phase = 2; e.armor = B.openArmor; e.speed *= B.phaseSpeed;
      e.attack = Math.round(B.attack * B.phaseAttack); q.nextSummonAt = q.elapsed + B.summonPeriod;
      g.fx.push({ type: 'floatText', text: '熔壳碎裂 · 赤脊暴怒', x: e.x, y: e.y - 65, t: 0, dur: 2, size: 25, color: '#ffe18a' });
    }
  }
  while (q.elapsed >= q.nextSummonAt) { summon(g, q); q.nextSummonAt += B.summonPeriod; }
}
function onDeath(g, e) {
  const q = g.run.bossEncounter;
  if (!q || q.id !== B.id || e.bossId !== B.id || e.hp > 0 || q.finished) return false;
  q.finished = true; q.rewardGranted = true; return true;
}
module.exports = { enabled, setup, spawn, tick, onDeath };
