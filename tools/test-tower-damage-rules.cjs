// 塔伤害规则回归：直伤/溅射、灼烧独立计时、碎冰继承、连锁攻速及军火库倍率。
// 在项目根目录运行：node tools/test-tower-damage-rules.cjs
const assert = require('assert'),
  root = require('path').resolve(__dirname, '..');
const { Run } = require(root + '/js/run.js'),
  { Meta } = require(root + '/js/meta.js'),
  { CombatSystem, initEnemyState } = require(root + '/js/combat.js');
const Cannon = require(root + '/js/combat/towers/cannon.js'),
  Electric = require(root + '/js/combat/towers/electric.js'),
  Ice = require(root + '/js/combat/towers/ice.js'),
  { layout } = require(root + '/js/game/render.js');
function close(a, b) {
  assert(Math.abs(a - b) < 1e-5, a + ' != ' + b);
}
function world(keys) {
  const meta = new Meta(),
    run = new Run({ seed: 41 });
  run.metaRef = meta;
  run.slotOrder = keys;
  run.effects.setActiveKeys(keys);
  for (const key of keys) {
    run.effects.tower(key).unlock();
    run.effects.tower(key).energy = 60;
  }
  const g = {
    run,
    meta,
    ly: layout(),
    state: 'fighting',
    fx: [],
    enemies: [],
    playSfx() {},
    toast() {},
  };
  const c = new CombatSystem(g);
  g.combat = c;
  c.reset();
  for (const key of ['fxParticle', 'fxRing', 'fxFlash', 'fxBeam']) c[key] = () => {};
  return { g, c, run };
}
function skill(run, key, name, branch = null, level = 3) {
  const t = run.effects.tower(key),
    ef = t.pool.find((x) => x.name === name);
  assert(ef);
  ef.act = true;
  ef.branches = { A: 0, B: 0, C: 0 };
  if (branch) ef.branches[branch] = level;
  return ef;
}
function enemy(id = 1, x = 375, y = 600) {
  return initEnemyState({
    id,
    x,
    y,
    hp: 10000,
    maxHp: 10000,
    type: 'normal',
    genLv: 1,
    armor: 0,
    speed: 0,
  });
}
// Main tower: one direct hit; summon:80% direct; both splash only other enemies.
{
  const { g, c } = world(['cannon']);
  const main = enemy(),
    near = enemy(2, 385, 590),
    far = enemy(3, 700, 300);
  g.enemies = [main, near, far];
  Cannon.hitCannon(c, main, 100);
  close(main.hp, 9900);
  close(near.hp, 9980);
  close(far.hp, 10000);
  for (const e of g.enemies) e.hp = 10000;
  c.turrets = [{ x: 375, y: 600, ttl: 10, atkT: 0, atkI: 1, dmg: 80, r: 100 }];
  Cannon.updateTurrets(c, 1);
  close(main.hp, 9920);
  close(near.hp, 9960);
  close(far.hp, 10000);
  // Pure area attacks have no separate direct hit; their center target still receives AOE once.
  for (const e of g.enemies) e.hp = 10000;
  c.explode(main.x, main.y, 100, 70, 'cannon', 0, false, undefined, '碎裂弹');
  close(main.hp, 9930);
  close(near.hp, 9930);
}
// 100 attack →20/sec burn, regardless of all poison-strength branches.
for (const durationStep of [1 / 30, 1 / 60, 1 / 120])
  for (const boost of [false, true]) {
    const { g, c, run } = world(['fire', 'poison']);
    if (boost) skill(run, 'poison', '毒性强化', 'A');
    const e = enemy();
    g.enemies = [e];
    c.applyBurn(e, 100, 'fire');
    close(e.dots[0].dps, 20);
    for (let i = 0; i < Math.round(1 / durationStep); i++) c.tickStatus(e, durationStep);
    close(e.hp, 9980);
  }
// Poison retains its own10%/24% per-stack baseline, with no duplicate multiplier.
for (const boost of [false, true]) {
  const { g, c, run } = world(['poison']);
  if (boost) skill(run, 'poison', '毒性强化', 'A');
  const e = enemy();
  g.enemies = [e];
  c.applyPoison(e, 100, 'poison', 1);
  close(e.dots[0].stackDps, boost ? 24 : 10);
  c.tickStatus(e, 1 / 60);
  close(e.hp, 10000 - (boost ? 24 : 10));
  for (let i = 1; i < 60; i++) c.tickStatus(e, 1 / 60);
  close(e.hp, 10000 - 2 * (boost ? 24 : 10));
}
// Burn starts after0.5s, pays all six half-second ticks, and catches up at lower frame rates.
for (const dt of [1 / 30, 1 / 60, 1 / 120, 0.4, 4]) {
  const { g, c } = world(['fire']);
  const e = enemy();
  g.enemies = [e];
  c.applyBurn(e, 100, 'fire');
  c.tickStatus(e, 0.49);
  close(e.hp, 10000);
  let elapsed = 0.49;
  while (elapsed < 3.1) {
    const step = Math.min(dt, 3.1 - elapsed);
    c.tickStatus(e, step);
    elapsed += step;
  }
  close(e.hp, 9940);
  assert.equal(e.dots.length, 0);
}
// Ember expiry includes the final valid burn tick before its30% accumulated-damage burst.
for (const level of [1, 2, 3]) {
  const { g, c, run } = world(['fire']);
  skill(run, 'fire', '点燃', 'C', level);
  const e = enemy();
  g.enemies = [e];
  c.applyBurn(e, 100, 'fire');
  const total = 20 * (1 + 0.2 * level) * (3 - 0.5 * level);
  for (let i = 0; i < 240; i++) c.tickStatus(e, 1 / 60);
  close(e.hp, 10000 - total * 1.3);
  assert.equal(e.dots.length, 0);
}
// Every shard derives from its own ordinary/tiny/multiple cone, with B applied once.
for (const parentDamage of [100, 10, 55])
  for (const branchB of [0, 1, 2, 3]) {
    const { g, c, run } = world(['ice']);
    skill(run, 'ice', '碎冰', branchB ? 'B' : null, branchB);
    const main = enemy();
    g.enemies = [main];
    c.shotDmg = () => {
      throw Error('Shatter must inherit cone damage');
    };
    Ice.hitIce(c, main, parentDamage);
    close(main.hp, 10000 - parentDamage);
    assert.equal(c.shots.length, 3);
    const shard = c.shots[0],
      expected = parentDamage * 0.65 * (1 + 0.15 * branchB);
    for (const shot of c.shots) close(shot.dmg, expected);
    // Use the real scatter collision/damage callback for the derived projectile.
    const victim = enemy(2, shard.sx, shard.sy);
    g.enemies = [victim];
    c.stepShot(shard, shard.dur / 10);
    close(victim.hp, 10000 - expected);
    assert.equal(c.shots.length, 3, 'shards cannot recursively shatter');
  }
// Actual multi-shot emitters supply55%/10%, rather than recalculating full tower damage.
for (const mode of ['normal', 'swarm']) {
  const { g, c, run } = world(['ice']);
  skill(run, 'ice', '多重冰锥', mode === 'swarm' ? 'C' : null, 1);
  skill(run, 'ice', '碎冰');
  const e = enemy();
  g.enemies = [e];
  Ice._iceMultiShot(c, e, 100);
  const parent = c.shots[0],
    expected = mode === 'swarm' ? 10 : 55;
  close(parent.dmg, expected);
  c.shots = [];
  parent.onHit(e, parent.dmg, parent);
  assert.equal(c.shots.length, 3);
  for (const shard of c.shots) close(shard.dmg, expected * 0.65);
}
// Pierce waits until the final cone hit; its amplified hit also scales derived shards.
{
  const { g, c, run } = world(['ice']);
  skill(run, 'ice', '冰穿刺', 'B', 3);
  skill(run, 'ice', '碎冰');
  const e = enemy();
  g.enemies = [e];
  Ice.launchIcePiercingShot(c, e, 55);
  const parent = c.shots[0];
  c.shots = [];
  parent.pierceHitCount = 1;
  parent.onHit(e, 55, parent, false);
  assert.equal(c.shots.length, 0);
  parent.pierceHitCount = 2;
  parent.onHit(e, 55, parent, true);
  assert.equal(c.shots.length, 3);
  for (const shard of c.shots) close(shard.dmg, 55 * 1.9 * 0.65);
}
// ArmoryC: same fixed base stat, only1.1/1.2/1.3 at high energy; no RNG doubling.
for (const level of [1, 2, 3]) {
  const { g, c, run } = world(['cannon']);
  skill(run, 'cannon', '军火库', 'C', level);
  run.effects.towerDps = () => 48;
  const t = run.effects.tower('cannon');
  const cap = run.armoryEnergyMax('cannon');
  t.energy = cap * 0.8;
  const E = require(root + '/js/config/energy-state.js').evaluate(t.energy, cap).attack;
  const normal = c.shotDmg('cannon', false),
    towerSkill = c.shotDmg('cannon', false, true),
    explicitSkill = c.shotDmg('cannon', true);
  close(normal, 100 * E * (1 + 0.1 * level));
  close(towerSkill, 100 * E);
  close(explicitSkill, 100 * E);
  const main = enemy(),
    near = enemy(2, 385, 590);
  g.enemies = [main, near];
  const random = Math.random;
  try {
    Math.random = () => 0;
    Cannon.hitCannon(c, main, normal);
  } finally {
    Math.random = random;
  }
  close(10000 - main.hp, normal);
  close(10000 - near.hp, normal * 0.2);
  t.energy = cap * 0.8 - 0.01;
  const weakE = require(root + '/js/config/energy-state.js').evaluate(t.energy, cap).attack;
  close(c.shotDmg('cannon', false), 100 * weakE);
}
// Each actual extra chain hit advances the elapsed timer. No hit means no credit.
for (const level of [1, 2, 3]) {
  const { g, c, run } = world(['electric']);
  skill(run, 'electric', '连锁', 'C', level);
  g.enemies = [enemy(), enemy(2, 400, 600), enemy(3, 420, 600)];
  c.atkTimers.electric = 0.6;
  const iv = c.interval('electric');
  Electric.hitElectric(c, g.enemies[0], 1);
  close(c.atkTimers.electric, 0.6 + iv * 0.03 * level * 2);
  let attacks = 0;
  c.attackOnce = () => attacks++;
  c.tickTower('electric', iv - c.atkTimers.electric + 0.0001);
  assert.equal(attacks, 1);
  g.enemies = [enemy()];
  c.atkTimers.electric = 0.6;
  Electric.hitElectric(c, g.enemies[0], 1);
  close(c.atkTimers.electric, 0.6);
}
console.log(
  'PASS primary/splash separation; pure AOE intact; burn20/sec at30/60/120Hz with expiry/catch-up; poison10/24 per tick and cadence intact; shards100/10/55 ×65% ×B and real collisions, multi-shot/pierce; armoryC1.1/1.2/1.3 without double hit or skill leakage; chainC actual faster attack.',
);
