'use strict';
const assert = require('assert'), vm = require('vm'), path = require('path');
const { execFileSync } = require('child_process'), { createRequire } = require('module');
const { CombatSystem: After } = require('../js/combat.js');
const CONFIG = require('../js/config.js'), B = require('../js/config/tower-skills.js').boomerang;
const root = path.resolve(__dirname, '..');
const box = { module: { exports: {} }, require: createRequire(path.join(root, 'js/combat.js')), console, Math, Date };
vm.runInNewContext(execFileSync('git', ['show', '1232eb750ca43630072d1ca545317c20aabf9d0c:js/combat.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }), box);
const Before = box.module.exports.CombatSystem, originalRandom = Math.random;
const names = ['折返增伤', '多镖', '接镖', '猎手标记', '放血', '风痕'];
function stable(value) { return JSON.stringify(value, (key, v) => key === 'visual' || key === 'projectile' ? undefined : typeof v === 'function' ? '[callback]' : v); }
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
  c.game = { run, enemies, fx: [], ly: { wallY: 500 }, playSfx: (...a) => events.push(['sound', ...a]), dmgNumbers: { push: e => events.push(['number', e]) } };
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
for (const mask of [0, 1, 2, 4, 8, 16, 32, 63]) for (const level of [0, 1, 2, 3]) for (const axis of ['A', 'B', 'C']) for (const star of [0, 1, 2, 3]) for (const mode of ['alive', 'low', 'empty']) for (const seed of [1, 12345]) {
  function go(C) {
    const f = fixture(C, mask, level, axis, star, mode), { c } = f;
    if (c.game.enemies[0]) c.hitBoomerang(c.game.enemies[0], 100);
    for (const dt of [0, 0.05, 0.2, 0.4, 0.5, 0.8, 0.05, 1]) {
      c.tickTower('boomerang', dt);
      const first = c.shots.find(s => s.sweep);
      if (first) { const pos = c.sweepPos(first, Math.min(1, (first.t + dt) / first.dur)); const live = c.game.enemies.find(e => e.hp > 0); if (live) { live.x = pos.x; live.y = pos.y; } }
      for (let i = c.shots.length - 1; i >= 0; i--) if (!c.stepShot(c.shots[i], dt)) c.shots.splice(i, 1);
    }
    return f.snapshot();
  }
  assert.equal(seeded(seed, () => go(After)), seeded(seed, () => go(Before)), stable({ mask, level, axis, star, mode, seed })); cases++;
}
// Each blade is linked to its own visual; neither energy cost nor catch boost is multiplied by blade count.
const multi = fixture(After, 2 | 4, 3, 'C', 0); multi.c.game.run.gsState = {}; multi.c._nextDmg.boomerang = 0.3; multi.c.attackOnce('boomerang');
assert.equal(multi.events.filter(e => e[0] === 'spend').length, 1); assert.equal(multi.c._nextDmg.boomerang, 0);
assert.equal(multi.c.shots.length, B['多镖'].baseCount + 4); assert(multi.c.shots.every(s => s.visual.projectile === s && s.visual === multi.c.game.fx.find(f => f.projectile === s)));
// No target does not consume energy, launch, or leave a waiting flag set.
const empty = fixture(After, 63, 3, 'A', 3, 'empty'); empty.c.bWait.boomerang = true; empty.c.attackOnce('boomerang'); assert.equal(empty.c.shots.length, 0); assert.equal(empty.c.bWait.boomerang, false); assert(!empty.events.some(e => e[0] === 'spend'));
// Flying blades block throws. With no catch skill, return starts the existing half-second cooldown.
const cadence = fixture(After, 0, 0, 'A', 0); let throws = 0; cadence.c.attackOnce = () => throws++;
cadence.c.shots = [{ key: 'boomerang', sweep: true }]; cadence.c.tickTower('boomerang', 3); assert.equal(throws, 0);
cadence.c.shots = []; cadence.c.bWait.boomerang = true; cadence.c.tickTower('boomerang', 0.2); assert.equal(throws, 0); cadence.c.tickTower('boomerang', 0.3); assert.equal(throws, 1);
const caught = fixture(After, 4, 3, 'C', 3); caught.c.bWait.boomerang = true; caught.c.attackOnce = () => { throws++; }; const prior = throws; caught.c.tickTower('boomerang', 0); assert.equal(throws, prior + 1); assert.equal(caught.c.game.run._wallInvT, 0.3); assert(caught.c._nextDmg.boomerang >= 0.3);
// Without return relics, repeated sampling cannot damage an enemy twice with one blade.
const sweep = fixture(After, 0, 0, 'A', 0); sweep.c.game.enemies.splice(1); const enemy = sweep.c.game.enemies[0]; sweep.c.sweepPos = () => ({ x: enemy.x, y: enemy.y }); const shot = { t: 0.5, dur: 1, dmg: 100, hitIds: {}, windLv: 0 }; sweep.c.sweepDamage(shot); const hp = enemy.hp; sweep.c.sweepDamage(shot); assert.equal(enemy.hp, hp); assert.equal(shot.hitIds[enemy.id], true);
// Spatial trail samples retain the existing spacing and cap.
const wind = fixture(After, 32, 3, 'C', 0); wind.c.game.enemies = []; wind.c.sweepPos = () => ({ x: 0, y: 0 }); const windShot = { t: 0.5, dur: 1, dmg: 100, hitIds: {}, windLv: 1 }; wind.c.sweepDamage(windShot); wind.c.sweepDamage(windShot); assert.equal(wind.c.windTrails.length, 1); wind.c.windTrails = Array(B['风痕'].maxTrails).fill({}); windShot._wLast = null; wind.c.sweepDamage(windShot); assert.equal(wind.c.windTrails.length, B['风痕'].maxTrails);
// Direct hits establish the hunter mark before damage; sweep hits preserve their separate path.
const mark = fixture(After, 8, 3, 'B', 0); const marked = mark.c.game.enemies[0]; let seenMark = 0; mark.c.damage = e => { seenMark = e._mark || 0; }; mark.c.hitBoomerang(marked, 100); assert.equal(seenMark, 1); for (let i = 0; i < 30; i++) mark.c.hitBoomerang(marked, 100); assert.equal(marked._mark, B['猎手标记'].stackCap + B['猎手标记'].stacksPerBranch * 3);
// The three-star capped bleed failure still applies bleed, converting the failed roll to duration.
const bleed = fixture(After, 16, 3, 'A', 3); Math.random = () => 0.99; try { bleed.c.tryAttackDebuff('boomerang', bleed.c.game.enemies[0], 100); } finally { Math.random = originalRandom; } assert.equal(bleed.c.game.enemies[0].bleedT, B['放血'].duration + 1);
const a = fixture(After, 63, 3, 'C', 3), b = fixture(After, 63, 3, 'C', 3), before = stable(b.snapshot()); a.c.attackOnce('boomerang'); a.c.hitBoomerang(a.c.game.enemies[0], 100); assert.equal(stable(b.snapshot()), before);
console.log('PASS ' + cases + ' boomerang 1232eb7 baseline multi-frame scenarios; attack/catch, multi-target arcs, direct/sweep damage, mark/bleed, RNG/numbers, trail sampling and context isolation');
