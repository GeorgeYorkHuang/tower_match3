'use strict';
const assert = require('assert'), vm = require('vm'), path = require('path');
const { execFileSync } = require('child_process'), { createRequire } = require('module');
const { CombatSystem: After } = require('../js/combat.js');
const CONFIG = require('../js/config.js'), B = require('../js/config/tower-skills.js').boomerang;
const root = path.resolve(__dirname, '..');
const box = { module: { exports: {} }, require: createRequire(path.join(root, 'js/combat.js')), console, Math, Date };
vm.runInNewContext(execFileSync('git', ['show', 'f9f1a20:js/combat.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }), box);
const Before = box.module.exports.CombatSystem, originalRandom = Math.random;
const names = ['风暴镖', '弹力镖', '猎手标记'];
function stable(value) { return JSON.stringify(value, (key, v) => key === 'visual' || key === 'projectile' || key === 'ref' ? undefined : typeof v === 'function' ? '[callback]' : v); }
function fixture(C, mask, level, axis, star, mode = 'alive') {
  const c = Object.create(C.prototype), events = [], tower = { level: 1, energy: level % 2 ? 0 : 49 };
  const enemies = mode === 'empty' ? [] : Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: 330 + i * 12, y: 420 - i * 8, hp: i === 4 ? 0 : mode === 'low' ? 40 : 100000, maxHp: 100000, armor: i * 0.05, speed: 20 + i, dots: [], hitCount: 0, slow: i % 2 ? { mult: 0.5, ttl: 2 } : null }));
  const run = {
    relic3: id => star === 3 && id.startsWith('boo_'),
    relicNum: id => star && id.startsWith('boo_') ? CONFIG.relicNum(id, star) : 0,
    effects: { synergyDone: [] }, gsState: level >= 2 ? { volley: { boomerang: true } } : {},
    armoryEnergyMax: () => 50, attackCost: () => 0.5,
    spendAttackEnergy: t => { events.push(['spend']); t.energy = Math.max(0, t.energy - 0.5); },
  };
  c.game = { run, enemies, fx: [], ly: { wallY: 500 }, playSfx: (...a) => events.push(['sound', ...a]), dmgNumbers: { clear: () => events.push(['clearNumbers']), push: e => events.push(['number', e]) } };
  c.shots = []; c.timers = {}; c.atkTimers = {}; c.bWait = {}; c.bCatch = {}; c._nextDmg = {}; c.kills = {};
  c.lv = (key, name) => key === 'boomerang' && names.includes(name) && (mask & (1 << names.indexOf(name))) ? level + 1 : 0;
  c.branchLv = (key, name, a) => c.lv(key, name) && a === axis ? level : 0;
  c.relicVal = run.relicNum; c.tower = key => key === 'boomerang' ? tower : null;
  c.towerMuzzle = () => ({ x: 375, y: 550 }); c.ly = () => c.game.ly; c.range = () => 400;
  c.interval = () => CONFIG.TOWERS.boomerang.atkInterval * (star ? 0.8 : 1);
  c.shotDmg = (...a) => { events.push(['shotDmg', ...a]); return 100; };
  c.onKill = e => events.push(['kill', e.id]);
  for (const name of ['fxFlash', 'fxParticle', 'fxRing', 'fxBeam']) c[name] = (...a) => events.push([name, ...a]);
  return { c, tower, events, snapshot: () => ({ enemies, tower, events, run, shots: c.shots, fx: c.game.fx, waits: c.bWait, catches: c.bCatch, next: c._nextDmg, trails: c.windTrails, kills: c.kills }) };
}
function seeded(seed, fn) {
  let n = 0; Math.random = () => { n++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  try { return stable({ state: fn(), rng: n }); } finally { Math.random = originalRandom; }
}
let cases = 0;
function periodic(C, mask, level, axis, star, weak, mode) {
  const f = fixture(C, mask, level, axis, star, mode === 'out' ? 'alive' : mode), { c } = f;
  c.game.ly = { areaX: 0, areaY: 100, areaW: 750, areaH: 400, wallY: 500 };
  if (mode === 'out') c.game.enemies.forEach(e => e.y += 2000);
  f.tower.energy = weak ? 0 : 49;
  c._weakPeriod = () => f.tower.energy <= 0 ? 1.5 : 1;
  c.castEnergy = (...args) => { f.events.push(['cast', ...args]); f.tower.energy = Math.max(0, f.tower.energy - 1); };
  c.power = 100; c.shotDmg = (...args) => { f.events.push(['shotDmg', ...args, c.power]); return c.power; };
  c.timers = { storm: B['风暴镖'].period * (weak ? 1.5 : 1) - 0.01, ringN: B['弹力镖'].period * (weak ? 1.5 : 1) - 0.01 };
  c.storms = []; c.windTrails = [0, 1, 2, 3].map(i => ({ x: 330, y: 420, r: 50, ttl: i ? 3 : 0.1, dps: 10 + i * 5, slow: 0.2 }));
  f.snapshot = () => ({ enemies: c.game.enemies, tower: f.tower, events: f.events, shots: c.shots, storms: c.storms, trails: c.windTrails, timers: c.timers, fx: c.game.fx, kills: c.kills });
  return f;
}
for (const mask of [0, 1, 2, 3, 7]) for (const level of [0, 1, 2, 3]) for (const axis of ['A', 'B', 'C']) for (const star of [0, 3]) for (const weak of [false, true]) for (const mode of ['alive', 'low', 'empty', 'out']) for (const seed of [1, 12345]) {
  function go(C) {
    const f = periodic(C, mask, level, axis, star, weak, mode), { c } = f;
    for (const [i, dt] of [0.005, 0.01, 0.2, 0.3, 0.8, 1, 2, 4, 20].entries()) {
      for (let j = c.shots.length - 1; j >= 0; j--) if (!c.stepShot(c.shots[j], dt)) c.shots.splice(j, 1);
      c.updateStorms(dt); c.updateWindTrails(dt); c.tickBoomerang(dt);
      if (i === 1) c.power = 500;
    }
    return f.snapshot();
  }
  assert.equal(seeded(seed, () => go(After)), seeded(seed, () => go(Before)), stable({ mask, level, axis, star, weak, mode, seed })); cases++;
}
let entities = 0;
for (const type of ['wall-x', 'wall-y', 'corner', 'enemy', 'repeat', 'delay', 'expiry', 'bounce-limit', 'storm-hit', 'storm-end', 'wind-overlap']) for (const star of [0, 3]) for (const seed of [1, 12345]) {
  function go(C) {
    const f = periodic(C, 7, 3, 'B', star, false, 'alive'), { c } = f;
    const s = { key: 'boomerang', bounce: true, x: 300, y: 300, t: 0, dur: 3, speed: 380, ang: 0, bounces: 0, maxB: 10, hitR: 22, hitIds: {}, dmg: 70 };
    const fx = { type: 'shot', kind: 'bounce', t: 0, dur: 3, ref: s }; s.fx = fx; c.shots = [s]; c.game.fx = [fx];
    if (type === 'wall-x') s.x = 749;
    if (type === 'wall-y') { s.y = 499; s.ang = Math.PI / 2; }
    if (type === 'corner') { s.x = 749; s.y = 499; s.ang = Math.PI / 4; }
    if (type === 'enemy' || type === 'repeat') { s.speed = 0; s.x = c.game.enemies[0].x + 1; s.y = c.game.enemies[0].y; }
    if (type === 'repeat') s.hitIds[c.game.enemies[0].id] = true;
    if (type === 'delay') s.t = -0.4;
    if (type === 'expiry') s.t = 2.99;
    if (type === 'bounce-limit') s.bounces = 10;
    if (type.startsWith('storm')) { const darts = [{ a: 0, spd: 0, r: 0, hitIds: {} }], sf = { t: 0, dur: 2, darts }; c.storms = [{ x: 330, y: 420, ttl: type === 'storm-end' ? 0.1 : 2, perDmg: 33, darts, fx: sf }]; c.game.fx.push(sf); }
    for (const dt of [0.2, 0.2, 0.4, 1, 3]) {
      for (let i = c.shots.length - 1; i >= 0; i--) if (!c.stepShot(c.shots[i], dt)) c.shots.splice(i, 1);
      c.updateStorms(dt); c.updateWindTrails(dt);
    }
    return f.snapshot();
  }
  assert.equal(seeded(seed, () => go(After)), seeded(seed, () => go(Before)), type + '/' + star + '/' + seed); entities++;
}
// Empty storm still consumes its cast; bounce darts launch in random directions without a target.
const empty = periodic(After, 3, 0, 'A', 0, false, 'empty'); empty.c.tickBoomerang(0.02); assert.equal(empty.c.storms.length, 0); assert.equal(empty.c.shots.length, B['弹力镖'].count); assert.equal(empty.events.filter(e => e[0] === 'cast').length, 2);
// Storm damage is a cast-time snapshot; individual darts retain their hit map and visual array identity.
const storm = periodic(After, 1, 0, 'A', 0, false, 'alive'); storm.c.tickBoomerang(0.02); const st = storm.c.storms[0], target = storm.c.game.enemies[0]; assert.strictEqual(st.darts, st.fx.darts);
st.x = target.x; st.y = target.y; st.darts = [{ a: 0, spd: 0, r: 0, hitIds: {} }]; st.fx.darts = st.darts; storm.c.power = 900;
const hp = target.hp; storm.c.updateStorms(0.01); assert.equal(hp - target.hp, st.perDmg); const after = target.hp; storm.c.updateStorms(0.01); assert.equal(target.hp, after); assert.equal(st.darts.length, 1);
// Hitting the bounce cap also ends the corresponding visual; child splitting is bounded per parent.
const split = periodic(After, 0, 0, 'A', 3, false, 'empty'); const parent = { key: 'boomerang', bounce: true, x: 100, y: 200, t: 0, dur: 3, speed: 0, ang: 0, bounces: 2, maxB: 2, hitIds: {}, dmg: 80, fx: { t: 0, dur: 3 } }; split.c.shots = [parent];
Math.random = () => 0; try { assert.equal(split.c.stepShot(parent, 0.1), false); assert.equal(split.c.shots.length, 3); assert.equal(split.c.stepShot(parent, 0.1), false); assert.equal(split.c.shots.length, 3); } finally { Math.random = originalRandom; }
assert.equal(parent.fx.t, parent.fx.dur); assert(split.c.shots.slice(1).every(s => s.dmg === 40 && s.fx.ref === s));
const a = periodic(After, 7, 3, 'C', 3, false, 'alive'), b = periodic(After, 7, 3, 'C', 3, false, 'alive'), before = stable(b.snapshot()); a.c.tickBoomerang(0.02); a.c.updateStorms(0.1); assert.equal(stable(b.snapshot()), before); a.c.reset(); assert.equal(a.c.shots.length, 0); assert.equal(a.c.storms.length, 0); assert.equal(a.c.windTrails.length, 0);
console.log('PASS ' + cases + ' boomerang periodic multi-frame scenarios + ' + entities + ' entity cases vs fixed f9f1a20; casts, snapshots, dart hit maps, bounce/split lifecycle, wind overlap, RNG/numbers and isolation');
