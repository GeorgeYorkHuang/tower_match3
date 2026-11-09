// 新风痕的固定结算、曲线采样、倍速与驻场预算回归。
const assert = require('assert');
const root = require('path').resolve(__dirname, '..');
const Wind = require(root + '/js/combat/wind-trails.js');
const { Run } = require(root + '/js/run.js');
const { Meta } = require(root + '/js/meta.js');
const { CombatSystem, initEnemyState } = require(root + '/js/combat.js');
const { layout } = require(root + '/js/game/render.js');
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function stub({ stacked = false, expiry = false } = {}) {
  const target = { x: 0, y: 0, hp: 1e9 };
  const hits = [],
    bursts = [],
    slows = [];
  const c = {
    windTrails: [],
    pendingWindTrails: [],
    windClock: 0,
    game: {
      run: { relic3: (id) => (id === 'boo_wind' && stacked) || (id === 'boo_trail' && expiry) },
    },
    enemies: () => [target],
    branchLv: () => 0,
    shotDmg: () => 100,
    damage(e, damage, key, kind, skill) {
      e.hp -= damage;
      hits.push({ damage, key, kind, skill });
    },
    explode(...args) {
      bursts.push(args);
    },
    applySlow(...args) {
      slows.push(args);
    },
  };
  return { c, target, hits, bursts, slows };
}
// First damage at0.2s; every tick isDPS×0.2, not fullDPS. No frame-by-frame damage.
{
  const { c, hits } = stub();
  c.windTrails.push({ x: 0, y: 0, r: 34, ttl: 1, dps: 10 });
  Wind.advance(c, 0.199);
  assert.equal(hits.length, 0);
  Wind.advance(c, 0.001);
  assert.equal(hits.length, 1);
  close(hits[0].damage, 2);
  Wind.advance(c, 0.39);
  assert.equal(hits.length, 2);
  Wind.advance(c, 0.41);
  assert.equal(hits.length, 5);
  close(
    hits.reduce((n, h) => n + h.damage, 0),
    10,
  );
  assert.equal(c.windTrails.length, 0);
  assert.equal(hits[0].skill, '风痕');
  assert.equal(hits[0].kind.kind, 'dot');
}
// Low frame rate /1x2x4x catch-up and expiry boundary all produce the same damage.
for (const dt of [1 / 30, 1 / 60, 1 / 120, 0.1, 0.4, 2]) {
  const { c, hits, bursts } = stub({ expiry: true });
  c.windTrails.push({ x: 0, y: 0, r: 34, ttl: 1, dps: 10 });
  let now = 0;
  while (now < 2 - 1e-9) {
    const step = Math.min(dt, 2 - now);
    Wind.advance(c, step);
    now += step;
  }
  assert.equal(hits.length, 5);
  close(
    hits.reduce((n, h) => n + h.damage, 0),
    10,
  );
  assert.equal(bursts.length, 1);
}
// Existing relic overlap and slow effects still apply on the scheduled ticks.
{
  const { c, hits, slows } = stub({ stacked: true });
  c.windTrails = Array.from({ length: 4 }, () => ({
    x: 0,
    y: 0,
    r: 34,
    ttl: 0.4,
    dps: 10,
    slow: 0.3,
  }));
  Wind.advance(c, 0.4);
  assert.equal(hits.length, 8);
  for (const h of hits) close(h.damage, 3.8);
  assert.equal(slows.length, 8);
  for (const slow of slows) close(slow[2], 0.2);
}
const path = { sx: 0, sy: 0, tx: 320, ty: 0, cx: 100, cy: 180, rcx: 540, rcy: -180, dur: 2.4 };
function trajectory(dt) {
  const { c, hits } = stub();
  c.enemies = () => [{ x: 140, y: 80, hp: 1e9 }];
  const shot = { ...path, t: 0 };
  const seen = [];
  let time = 0;
  while (time < 4 - 1e-9) {
    const step = Math.min(dt, 4 - time);
    if (shot.t < shot.dur - 1e-9) {
      shot.t = Math.min(shot.dur, shot.t + step);
      Wind.stage(c, shot, shot.t / shot.dur);
      seen.push(...c.pendingWindTrails.map((w) => [w.x, w.y, w.born]));
    }
    Wind.advance(c, step);
    time += step;
  }
  return { seen, damage: hits.reduce((n, h) => n + h.damage, 0), hits: hits.length };
}
const reference = trajectory(1 / 120);
assert(reference.seen.length > 10);
assert(reference.hits > 0);
for (const dt of [1 / 60, 1 / 30, 0.1, 0.4]) {
  const result = trajectory(dt);
  assert.deepEqual(result.seen, reference.seen);
  close(result.damage, reference.damage);
  assert.equal(result.hits, reference.hits);
}
// Capacity stays bounded, including simultaneous expiry and creation.
{
  const { c } = stub();
  c.windTrails = Array.from({ length: 240 }, () => ({ x: 1000, y: 0, r: 34, ttl: 0.1, dps: 10 }));
  c.pendingWindTrails = Array.from({ length: 400 }, () => ({
    x: 1000,
    y: 0,
    r: 34,
    ttl: 1,
    dps: 10,
    born: 0.1,
    expires: 1.1,
    nextTick: 0.3,
  }));
  Wind.advance(c, 0.2);
  assert.equal(c.windTrails.length, 240);
  assert.equal(c.pendingWindTrails.length, 0);
}
function world(key, branch = null, branchLevel = 0) {
  const run = new Run({ seed: 41 }),
    meta = new Meta();
  run.metaRef = meta;
  run.slotOrder = [key];
  run.effects.setActiveKeys([key]);
  const tower = run.effects.tower(key);
  tower.unlock();
  tower.energy = 60;
  const name = key === 'cannon' ? '炮台' : '毒棒',
    ef = tower.pool.find((e) => e.name === name);
  ef.act = true;
  ef.branches = { A: 0, B: 0, C: 0 };
  if (branch) ef.branches[branch] = branchLevel;
  const game = {
    run,
    meta,
    ly: layout(),
    state: 'fighting',
    fx: [],
    enemies: [initEnemyState({ id: 1, x: 375, y: 600, hp: 1e9, maxHp: 1e9, armor: 0 })],
    playSfx() {},
    toast() {},
  };
  const c = new CombatSystem(game);
  game.combat = c;
  c.reset();
  c.inTowerRange = () => true;
  for (const f of ['fxParticle', 'fxRing', 'fxFlash', 'fxBeam']) c[f] = () => {};
  c.shotDmg = () => 100;
  return { c, run, game };
}
for (const key of ['cannon', 'poison'])
  for (const level of [0, 1, 2, 3]) {
    const { c, run } = world(key, 'B', level),
      cannon = key === 'cannon',
      period = cannon ? 12 : 6;
    const tick = cannon ? c.tickCannon.bind(c) : c.tickPoison.bind(c);
    const queue = () => (cannon ? c.turrets : c.poisonSticks);
    tick(period - 0.01);
    assert.equal(queue().length, 0);
    tick(0.01 + 1e-8);
    assert.equal(queue().length, 2);
    for (const summon of queue()) {
      close(summon.ttl, (cannon ? 6 : 8) + level);
      close(summon.dmg, cannon ? 80 : 100);
      close(summon.atkI, 1);
    }
    tick(period - 0.02);
    assert.equal(queue().length, 2);
    tick(0.02 + 1e-8);
    assert.equal(queue().length, 4, 'B must not accelerate deployment');
    c.pendingWindTrails.push({});
    c.windClock = 10;
    c.reset();
    assert.equal(c.windClock, 0);
    assert.equal(c.pendingWindTrails.length, 0);
    assert.equal(queue().length, 0);
  }
for (const key of ['cannon', 'poison']) {
  const { c } = world(key, 'A', 3);
  key === 'cannon' ? c.tickCannon(12) : c.tickPoison(6);
  assert.equal((key === 'cannon' ? c.turrets : c.poisonSticks).length, 5);
}
{
  const { c } = world('cannon', 'C', 3);
  c.tickCannon(12);
  for (const summon of c.turrets) close(summon.atkI, 0.7);
  const { c: poison } = world('poison', 'C', 3);
  poison.tickPoison(6);
  for (const summon of poison.poisonSticks) assert.equal(summon.targets, 4);
  const { c: paused, hits } = stub();
  paused.windTrails.push({ x: 0, y: 0, r: 34, ttl: 1, dps: 10 });
  Wind.advance(paused, 0);
  assert.equal(paused.windClock, 0);
  assert.equal(hits.length, 0);
}
console.log(
  'PASS0.2s wind tick amount/cadence,30/60/120Hz and4x catch-up, equal-distance trajectory samples/timestamps, relic/slow/expiry/capacity/reset, real summon periods/lifetimes/A count and80%/40% direct damage rules.',
);
