'use strict';
const Rosea = require('./rosea.js');
const Galvin = require('./galvin.js');
const Vera = require('./vera.js');
const MiniBell = require('./minibell.js');
const LavaRidge = require('./lava-ridge.js');
const FrostAlpha = require('./frost-alpha.js');
const LavaTwins = require('./lava-twins.js');
const FrostTwins = require('./frost-twins.js');
const Ignis = require('./lava-ignis.js');
const Skall = require('./frost-skall.js');
function twins(g) { const id = g.run && g.run.bossEncounter && g.run.bossEncounter.id; return id === 'frost_twins' ? FrostTwins : id === 'lava_twins' ? LavaTwins : Galvin; }
// Runtime state belongs to Run and Enemy; this registry keeps no active game reference.
function setup(director) {
  const run = director.game.run;
  run.bossLock = false; run.bossEnemy = null; run.bossEncounter = null;
  run.bossWaveHp = 0; run.bossWaveNo = 0;
  if (Vera.setup(director) || Ignis.setup(director) || Skall.setup(director) || Galvin.setup(director) || LavaTwins.setup(director) || FrostTwins.setup(director) || LavaRidge.setup(director) || FrostAlpha.setup(director)) return true;
  const active = Rosea.setup(director);
  if (active) { run.bossWaveNo = run.wave; director.interval = 0.25; }
  return active;
}
function spawn(g, e, id) { Rosea.spawn(g, e, id); Galvin.spawn(g, e, id); LavaTwins.spawn(g, e, id); FrostTwins.spawn(g, e, id); Vera.spawn(g, e, id); Ignis.spawn(g, e, id); Skall.spawn(g, e, id); LavaRidge.spawn(g, e, id); FrostAlpha.spawn(g, e, id); }
function tick(g, dt) {
  if (g.run.bossEnemy && g.run.bossEnemy.bossId === 'altar_rosea') Rosea.tick(g, dt);
  twins(g).tick(g, dt); Vera.tick(g, dt);
  Ignis.tick(g, dt);
  Skall.tick(g, dt);
  LavaRidge.tick(g, dt); FrostAlpha.tick(g, dt);
  MiniBell.tick(g, dt);   // 每 5 波小 Boss 圣坛蔓钟：敲钟召唤
}
function defeated(g) {
  if (g.run.bossEncounter) return g.run.bossEncounter.finished === true;
  return !!g.run.bossEnemy && g.run.bossEnemy.hp <= 0;
}
function clearVictory(g) {
  const wave = (g.run.bossEncounter && g.run.bossEncounter.waveNo) || g.run.bossWaveNo || g.run.wave;
  clearTemporary(g);
  g.run.bossLock = false; g.wave.plan = [];
  g.enemies = g.enemies.filter(e => e.waveNo !== wave);
  if (g._waveAlive) g._waveAlive[wave] = 0;
  g._waveCleared = g._waveCleared || {};
  if (!g._waveCleared[wave]) { g._waveCleared[wave] = true; g.run.clearedWaves++; }
}
function clearTemporary(g) {
  twins(g).clearTemporary(g); Ignis.clearTemporary(g); Skall.clearTemporary(g);
}
function moveScale(g, e) {
  if (g.run && g.run.bossEncounter && g.run.bossEncounter.id === 'frost_twins') return FrostTwins.moveScale(g, e);
  if (e && e.bossId === 'frost_alpha') return FrostAlpha.moveScale(g, e);
  const frostScale = FrostAlpha.moveScale(g, e);
  return frostScale !== 1 ? frostScale : Vera.moveScale(g);
}
function onDeath(g, e) {
  if (e.bossId === 'frost_skall') return Skall.onDeath(g, e);
  if (e.bossId === 'lava_ignis') return Ignis.onDeath(g, e);
  if (e.bossId === 'lava_ridge') return LavaRidge.onDeath(g, e);
  if (e.bossId === 'frost_alpha') return FrostAlpha.onDeath(g, e);
  return e.bossId === 'altar_vera' ? Vera.onDeath(g, e) : twins(g).onDeath(g, e);
}
module.exports = { setup, spawn, tick, defeated, clearVictory,
  attackScale: (g, ...args) => twins(g).attackScale(g, ...args) * Ignis.attackScale(g) * Skall.attackScale(g),
  attackStep: (g, ...args) => twins(g).attackStep(g, ...args) * Ignis.attackScale(g) * Skall.attackScale(g), clearTemporary,
  afterDamage: (g, e) => { Vera.afterDamage(g, e); Ignis.afterDamage(g, e); Skall.afterDamage(g, e); }, moveScale,
  towerFrozen: Skall.towerFrozen, spawnSummon: Skall.spawnSummon,
  coreAtWall: Ignis.coreAtWall,
  absorb: Rosea.absorb, transition: (g, ...args) => twins(g).transition(g, ...args), split: (g, ...args) => twins(g).split(g, ...args),
  onDeath };
