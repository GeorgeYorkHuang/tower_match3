'use strict';
const Rosea = require('./rosea.js');
const Galvin = require('./galvin.js');
// Runtime state belongs to Run and Enemy; this registry keeps no active game reference.
function setup(director) {
  const run = director.game.run;
  run.bossLock = false; run.bossEnemy = null; run.bossEncounter = null;
  run.bossWaveHp = 0; run.bossWaveNo = 0;
  if (Galvin.setup(director)) return true;
  const active = Rosea.setup(director);
  if (active) { run.bossWaveNo = run.wave; director.interval = 0.25; }
  return active;
}
function spawn(g, e, id) { Rosea.spawn(g, e, id); Galvin.spawn(g, e, id); }
function tick(g, dt) {
  if (g.run.bossEnemy && g.run.bossEnemy.bossId === 'altar_rosea') Rosea.tick(g, dt);
  Galvin.tick(g, dt);
}
function defeated(g) {
  if (g.run.bossEncounter) return g.run.bossEncounter.finished === true;
  return !!g.run.bossEnemy && g.run.bossEnemy.hp <= 0;
}
function clearVictory(g) {
  const wave = (g.run.bossEncounter && g.run.bossEncounter.waveNo) || g.run.bossWaveNo || g.run.wave;
  Galvin.clearTemporary(g);
  g.run.bossLock = false; g.wave.plan = [];
  g.enemies = g.enemies.filter(e => e.waveNo !== wave);
  if (g._waveAlive) g._waveAlive[wave] = 0;
  g._waveCleared = g._waveCleared || {};
  if (!g._waveCleared[wave]) { g._waveCleared[wave] = true; g.run.clearedWaves++; }
}
module.exports = { setup, spawn, tick, defeated, clearVictory,
  attackScale: Galvin.attackScale, attackStep: Galvin.attackStep, clearTemporary: Galvin.clearTemporary,
  absorb: Rosea.absorb, transition: Galvin.transition, split: Galvin.split, onDeath: Galvin.onDeath };
