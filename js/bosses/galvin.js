'use strict';
const CONFIG = require('../config.js');
const B = require('../config/bosses.js').altar_galvin;
const enemySize = require('../enemy-size.js');
function enabled(g) { return g.menuStage === B.field && g.run.wave === B.wave && g.state !== 'testfield'; }
function entries(levels) {
  return levels.map(lv => { const c = CONFIG.ENEMY.levelOf(lv); return { lv, type: c.type, hp: c.hp, offset: 0.5, isBoss: false }; });
}
function setup(director) {
  const g = director.game;
  if (!enabled(g)) return false;
  // Prior-wave survivors may still be present; their IDs must not alias either twin's hit cooldowns.
  director._eid = g.enemies.reduce((next, e) => Math.max(next, Number(e.id) + 1 || 0), director._eid);
  g.run.bossLock = true; g.run.bossEnemy = null;
  g.run.bossEncounter = { id: B.id, waveNo: B.wave, phase: 1, members: [], finished: false, rewardGranted: false };
  director.plan = [{ lv: B.genLv, type: 'boss', hp: B.hp, offset: 0.5, isBoss: true, bossId: B.id }, ...entries(B.adds[0])];
  director.hasBoss = true; director.interval = B.spawnInterval;
  director.enemyTotalHp = B.hp * (1 - B.threshold) + 2 * B.hp * B.twinHpRatio
    + B.adds.flat().reduce((sum, lv) => sum + CONFIG.ENEMY.levelOf(lv).hp, 0);
  g.run.bossWaveHp = director.enemyTotalHp; g.run.bossWaveNo = B.wave;
  if (!g.run.galvinAnnounced && g.fx) {
    g.run.galvinAnnounced = true;
    const y = director.ly.areaY + director.ly.entryH + 100;
    g.fx.push({ type: 'floatText', text: '第40波 · 双生圣像登场', x: 375, y, t: 0, dur: 3, size: 30, color: '#f4cf72' });
    g.fx.push({ type: 'floatText', text: '迦尔文 · 分裂后击败两尊圣像', x: 375, y: y + 40, t: 0, dur: 3, size: 20, color: '#e5d9f6' });
  }
  return true;
}
function configure(g, e, twin) {
  e.bossId = B.id; e.bossName = B.name; e.phase = twin ? 2 : 1;
  e.hp = e.maxHp = twin ? B.hp * B.twinHpRatio : B.hp; e.delayHp = e.maxHp;
  e.armor = twin ? B.twinArmor : B.armor; e.attack = B.attack;
  e.speed = (g.wave.ly.wallY - g.wave.ly.areaY - g.wave.ly.entryH) / CONFIG.WAVE.seconds * (twin ? B.twinSpeed : B.speed) / 1.5;
  e.controlResist = B.controlResist; e.bossPlaceholder = true;
}
function spawn(g, e, id) {
  if (id !== B.id) return;
  configure(g, e, false); g.run.bossEnemy = e; g.run.bossEncounter.members = [e];
}
function transition(g, e, value) {
  const group = g.run.bossEncounter;
  if (!group || group.id !== B.id || group.phase !== 1 || e.bossId !== B.id || e.phase !== 1) return null;
  const remaining = Math.max(0, e.hp - e.maxHp * B.threshold);
  return value >= remaining ? { damage: remaining, overflow: Math.max(0, value - remaining) } : null;
}
function split(g, e) {
  const group = g.run.bossEncounter;
  if (!group || group.id !== B.id || group.phase !== 1) return [];
  group.phase = 2; group.members = [];
  // Retiring a body is not a kill: invalidate old targets, without invoking death skills/rewards.
  e.hp = 0; e._dying = true; e._bossRetired = true;
  const ly = g.wave.ly;
  for (let i = 0; i < 2; i++) {
    g.wave.pushEnemy(B.hp * B.twinHpRatio, e.y, 0, 0, true, 'boss', B.genLv);
    const child = g.enemies[g.enemies.length - 1];
    configure(g, child, true); child.bossTwinIndex = i + 1; child._bossStun = B.phaseStun;
    const half = enemySize(child, CONFIG.LAYOUT.enemy) / 2;
    const minX = ly.areaX + B.edgeInset + half, maxX = ly.areaX + ly.areaW - B.edgeInset - half;
    child.x = Math.max(minX, Math.min(maxX, e.x + (i ? 1 : -1) * B.splitSeparation / 2));
    child.y = e.y; group.members.push(child);
  }
  g.run.bossEnemy = group.members[0];
  g.wave.plan.push(...entries(B.adds[1])); g.wave.planDoneAt = null;
  g.fx.push({ type: 'floatText', text: '圣像裂生 · 两尊均需击败', x: e.x, y: e.y - 70, t: 0, dur: 2, size: 24, color: '#f4cf72' });
  return group.members;
}
function tick(g, dt) {
  const group = g.run.bossEncounter;
  if (!g.run.bossLock || !group || group.id !== B.id) return;
  for (const e of group.members) if (e.hp > 0) e._bossStun = Math.max(0, (e._bossStun || 0) - dt);
  g.run.bossEnemy = group.members.find(e => e.hp > 0) || group.members[group.members.length - 1] || null;
}
function onDeath(g, e) {
  if (e.bossId !== B.id) return true;
  const group = g.run.bossEncounter;
  if (!group || group.id !== B.id || group.phase !== 2 || !group.members.includes(e) || group.rewardGranted) return false;
  if (group.members.some(member => member.hp > 0)) return false;
  group.finished = true; group.rewardGranted = true;
  return true; // The existing Boss reward path runs exactly once for the encounter.
}
module.exports = { enabled, setup, spawn, transition, split, tick, onDeath };
