'use strict';
const CONFIG = require('../config.js');
const B = require('../config/bosses.js').altar_galvin;
const enemySize = require('../enemy-size.js');
const ART = require('../config/enemy-visuals.js').bossAnimations.altar_galvin;
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
  g.run.bossEncounter = {
    id: B.id, waveNo: B.wave, phase: 1, members: [], finished: false, rewardGranted: false,
    elapsed: 0, nextEchoAt: B.echoPeriod, slowUntil: {}, attackDebt: {},
    resonanceStacks: 0, nextResonanceAt: Infinity,
    firstDeathAt: null, syncExpired: false, syncSuccess: false, syncBonusResolved: false,
  };
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
  e.controlResist = B.controlResist; e.bossPlaceholder = false;
  e.bossArtKey = twin ? 'altar_galvin_twin' : B.id;
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
  group.phase = 2; group.members = []; group.nextResonanceAt = group.elapsed + B.resonancePeriod;
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
  group.splitVisual = { t: 0, duration: B.phaseStun, x: e.x, y: e.y,
    size: enemySize(e, CONFIG.LAYOUT.enemy),
    frame: Math.floor(((g.animClock || 0) + ((e.id || 0) * 53) % 1000) / ART.frameMs) % ART.frames,
    childIds: group.members.map(child => child.id) };
  g.run.bossEnemy = group.members[0];
  g.wave.plan.push(...entries(B.adds[1])); g.wave.planDoneAt = null;
  g.fx.push({ type: 'floatText', text: '圣像裂生 · 两尊均需击败', x: e.x, y: e.y - 70, t: 0, dur: 2, size: 24, color: '#f4cf72' });
  return group.members;
}
const EPS = 1e-9;
function active(g) {
  const group = g.run && g.run.bossEncounter;
  return g.run && g.run.bossLock && group && group.id === B.id && !group.finished ? group : null;
}
function clearTemporary(g) {
  const group = g.run && g.run.bossEncounter;
  if (group && group.id === B.id) { group.slowUntil = {}; group.attackDebt = {}; }
}
function attackScale(g, key) {
  const group = active(g);
  if (!group || ['menu', 'gameover', 'testfield'].includes(g.state)) return 1;
  return (group.slowUntil[key] || 0) > group.elapsed + EPS ? 1 - B.echoSlow : 1;
}
// Boomerangs have a flight/return cadence instead of a normal attack interval.
// Accumulate lost action time while flying, then pay it before the next throw.
function attackStep(g, key, dt, flying) {
  const group = active(g), scale = attackScale(g, key);
  if (!group || scale === 1) {
    if (group) delete group.attackDebt[key];
    return dt;
  }
  if (flying) { group.attackDebt[key] = (group.attackDebt[key] || 0) + dt * (1 - scale); return 0; }
  const wait = (group.attackDebt[key] || 0) / scale;
  const used = Math.min(dt, wait);
  group.attackDebt[key] = Math.max(0, (wait - used) * scale);
  return group.attackDebt[key] > EPS ? -1 : Math.max(0, dt - used) * scale;
}
function castEcho(g, group) {
  const alive = group.members.filter(e => e.hp > 0);
  const candidates = [...new Set(g.run.slotOrder)].filter(key => {
    const t = g.run.effects.tower(key); return t && t.level > 0;
  }).map(key => {
    const pos = g.combat.towerMuzzle(key);
    return { key, distance: Math.min(...alive.map(e => Math.hypot(e.x - pos.x, e.y - pos.y))) };
  }).sort((a, b) => a.distance - b.distance).slice(0, B.echoTowerCount);
  for (const item of candidates) group.slowUntil[item.key] = group.elapsed + B.echoDuration;
  if (candidates.length) group.echoVisual = { at: group.elapsed };
  if (candidates.length) g.fx.push({ type: 'floatText', text: '圣坛回响 · 攻速 −' + Math.round(B.echoSlow * 100) + '%', x: 375, y: g.ly.wallY - 45, t: 0, dur: 1.2, size: 20, color: '#e4c88d' });
}
function tick(g, dt) {
  const group = active(g);
  if (!group || !group.members.some(e => e.hp > 0)) return;
  const alive = group.members.filter(e => e.hp > 0);
  if (group.splitVisual) group.splitVisual.t = Math.min(group.splitVisual.duration, group.splitVisual.t + Math.max(0, dt));
  for (const e of alive) e._bossStun = Math.max(0, (e._bossStun || 0) - dt);
  const end = group.elapsed + Math.max(0, dt);
  // Integrate healing between event boundaries: a long frame must not apply a new stack retroactively.
  while (group.elapsed < end - EPS) {
    const both = group.phase === 2 && alive.length === 2;
    const nextResonance = both && group.resonanceStacks < B.resonanceMax ? group.nextResonanceAt : Infinity;
    const next = Math.min(end, group.nextEchoAt, nextResonance);
    const duration = Math.max(0, next - group.elapsed);
    if (both && group.resonanceStacks > 0) for (const e of alive) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * B.resonanceHealPerStack * group.resonanceStacks * duration);
    }
    group.elapsed = next;
    if (nextResonance <= next + EPS) {
      group.resonanceStacks++;
      group.resonanceVisual = { at: next };
      for (const e of alive) e.attack = Math.round(B.attack * (1 + B.resonanceAttackPerStack * group.resonanceStacks));
      group.nextResonanceAt += B.resonancePeriod;
    }
    if (group.nextEchoAt <= next + EPS) { castEcho(g, group); group.nextEchoAt += B.echoPeriod; }
  }
  group.elapsed = end;
  if (group.firstDeathAt !== null && !group.syncExpired && end - group.firstDeathAt > B.syncWindow + EPS) {
    group.syncExpired = true;
    const survivor = alive[0];
    if (survivor) {
      group.timeoutVisual = { at: end, id: survivor.id };
      survivor.hp = Math.min(survivor.maxHp, survivor.hp + survivor.maxHp * B.survivorHealRatio);
      g.fx.push({ type: 'floatText', text: '同步超时 · 圣像回复' + Math.round(B.survivorHealRatio * 100) + '%', x: survivor.x, y: survivor.y - 55, t: 0, dur: 1.5, size: 21, color: '#a4e7b2' });
    }
  }
  g.run.bossEnemy = alive[0] || group.members[group.members.length - 1] || null;
}
function syncBonus(g, group) {
  if (group.syncBonusResolved) return;
  group.syncBonusResolved = true;
  const tier = CONFIG.DEPTH_CHEST.tiers.find(t => t.key === B.syncChestTier);
  group.syncChestGranted = !!tier && g.meta.grantDeepChest(tier);
  g.toast(group.syncChestGranted ? '同步击破 · 额外' + tier.name + '已存入' : tier ? '同步击破 · 宝箱槽位已满' : '同步击破 · 奖励配置不可用', '#f4cf72');
  if (group.syncChestGranted) g.save.save();
}
function onDeath(g, e) {
  if (e.bossId !== B.id) return true;
  const group = g.run.bossEncounter;
  if (!group || group.id !== B.id || group.phase !== 2 || !group.members.includes(e) || group.rewardGranted || e.hp > 0) return false;
  if (group.members.some(member => member.hp > 0)) {
    if (group.firstDeathAt === null) group.firstDeathAt = group.elapsed;
    return false;
  }
  group.syncSuccess = !group.syncExpired && (group.firstDeathAt === null || group.elapsed - group.firstDeathAt <= B.syncWindow + EPS);
  group.finished = true; group.rewardGranted = true;
  clearTemporary(g);
  if (group.syncSuccess) syncBonus(g, group);
  return true; // The existing Boss reward path runs exactly once for the encounter.
}
module.exports = { enabled, setup, spawn, transition, split, tick, onDeath, attackScale, attackStep, clearTemporary };
