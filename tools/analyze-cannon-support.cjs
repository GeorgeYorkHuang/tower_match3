// 只读炮火支援测算：真实施放、延迟命中、地面伤害和移动；不运行其他塔攻击。
const fs = require('fs'),
  crypto = require('crypto'),
  assert = require('assert');
const root = require('path').resolve(__dirname, '..');
const { Run } = require(root + '/js/run.js');
const { Meta } = require(root + '/js/meta.js');
const { CombatSystem, initEnemyState } = require(root + '/js/combat.js');
const { layout } = require(root + '/js/game/render.js');
const Main = require(root + '/js/game/main.js');
const Cannon = require(root + '/js/combat/towers/cannon.js');
const Areas = require(root + '/js/combat/areas.js');
const CONFIG = require(root + '/js/config.js');
const BAL = require(root + '/js/config/tower-skills.js').cannon['炮火支援'];
const originalRandom = Math.random,
  originalNow = Date.now;
let state = 1,
  now = 0;
Math.random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
Date.now = () => now * 1000;
const close = (a, b) => assert(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
const definitions = [
  { branch: null, level: 0 },
  ...['A', 'B', 'C'].flatMap((branch) => [1, 2, 3].map((level) => ({ branch, level }))),
];

function positions(scene, ly) {
  const y = ly.wallY - 700;
  if (scene === 'boss') return [[375, y]];
  if (scene === 'scatter6')
    return Array.from({ length: 6 }, (_, i) => [155 + (i % 3) * 220, y + Math.floor(i / 3) * 220]);
  const step = scene === 'dense12' ? 35 : 70;
  return Array.from({ length: 12 }, (_, i) => [
    375 + ((i % 4) - 1.5) * step,
    y + Math.floor(i / 4) * step,
  ]);
}

function volley({
  branch = null,
  level = 0,
  scene = 'boss',
  speed = 0,
  seed = 41,
  fixedPower = true,
  hp = 1e9,
  armor = 0,
}) {
  state = seed;
  now = 0;
  const run = new Run({ seed }),
    meta = new Meta();
  run.metaRef = meta;
  run.slotOrder = ['cannon'];
  run.effects.setActiveKeys(['cannon']);
  const tower = run.effects.tower('cannon');
  tower.unlock();
  tower.energy = 60;
  // 归一化实验只选支援；实装Lv13实验用相同三技能投入，但不施放其他技能。
  const choices = fixedPower
    ? [['炮火支援', branch]]
    : [
        ['炮台', 'B'],
        ['炮火支援', branch],
        ['地雷阵', 'A'],
      ];
  for (const [name, selectedBranch] of choices) {
    tower.pending++;
    assert(tower.applyChoice({ name, type: 'skill', fromTower: 'cannon' }, { cannon: tower }).ok);
    const count = fixedPower ? level : 3;
    for (let i = 0; i < count; i++) {
      tower.pending++;
      assert(
        tower.applyChoice(
          { name, type: 'branch', branch: selectedBranch || 'A', fromTower: 'cannon' },
          { cannon: tower },
        ).ok,
      );
    }
  }
  const ly = layout(),
    points = positions(scene, ly);
  const game = {
    run,
    meta,
    ly,
    state: 'fighting',
    fx: [],
    enemies: points.map(([x, y], i) =>
      initEnemyState({
        id: i + 1,
        x,
        y,
        hp,
        maxHp: hp,
        armor,
        speed,
        isBoss: scene === 'boss',
        type: 'normal',
        genLv: 1,
      }),
    ),
    playSfx() {},
    toast() {},
  };
  game.enemyMoveSpeed = Main.prototype.enemyMoveSpeed;
  game.predictEnemyPosition = Main.prototype.predictEnemyPosition;
  game.moveEnemy = Main.prototype.moveEnemy;
  const c = new CombatSystem(game);
  game.combat = c;
  c.reset();
  for (const name of ['fxParticle', 'fxRing', 'fxFlash', 'fxBeam']) c[name] = () => {};
  let kills = 0,
    direct = 0,
    ground = 0,
    rawDamage = 0,
    directHits = 0,
    groundHits = 0;
  // 不执行经验、金币和其他击杀奖励；零圣物/天赋的炮塔没有额外死亡伤害钩子。
  c.onKill = () => {
    kills++;
  };
  const damage = c.damage.bind(c);
  c.damage = (e, amount, key, kind, skill) => {
    const before = Math.max(0, e.hp);
    damage(e, amount, key, kind, skill);
    const effective = Math.min(before, Math.max(0, before - e.hp));
    if (!(before > 0)) return;
    rawDamage += Math.max(0, before - e.hp);
    if ((typeof kind === 'object' ? kind.kind : kind) === 'dot') {
      ground += effective;
      groundHits++;
    } else {
      direct += effective;
      directHits++;
    }
  };
  if (fixedPower) c.shotDmg = () => 100;
  const power = c.shotDmg('cannon', false, true);
  c.timers.support = BAL.period;
  Cannon.tickCannon(c, 0); // 只触发这一轮支援；地雷和炮台的计时保持0，未部署。
  assert.equal(c.mines.length, 0);
  assert.equal(c.turrets.length, 0);
  const shells = c.delayed.map((d) => ({ target: d.target.id, delay: d.delay, damage: d.dmg }));
  assert.equal(shells.length, BAL.count + (branch === 'A' ? level : 0));
  const energySpent = 60 - tower.energy;
  for (let frame = 1; frame <= 360; frame++) {
    now = frame / 60;
    Areas.updateDelayed(c, 1 / 60);
    Areas.updateGroundDots(c, 1 / 60);
    game.enemies = game.enemies.filter((e) => e.hp > 0);
    for (const e of game.enemies) game.moveEnemy(e, 1 / 60);
    game.fx = game.fx.filter((f) => (f.t += 1 / 60) < f.dur);
  }
  assert.equal(c.delayed.length, 0);
  assert.equal(c.groundDots.length, 0);
  const total = direct + ground;
  return {
    branch,
    branchLevel: level,
    scene,
    speed,
    hp,
    armor,
    fixedPower,
    towerLevel: tower.level,
    power,
    shellCount: shells.length,
    shellTargets: shells.map((s) => s.target),
    firstImpactDelay: shells[0].delay,
    lastImpactDelay: shells.at(-1).delay,
    energySpent,
    direct,
    ground,
    total,
    equivalentDps: total / BAL.period,
    rawDamage,
    overkill: Math.max(0, rawDamage - total),
    directHits,
    groundHits,
    kills,
    remaining: game.enemies.length,
  };
}

function mean(rows) {
  const out = { ...rows[0] };
  delete out.shellTargets;
  for (const k of [
    'direct',
    'ground',
    'total',
    'equivalentDps',
    'rawDamage',
    'overkill',
    'directHits',
    'groundHits',
    'kills',
    'remaining',
  ])
    out[k] = rows.reduce((n, r) => n + r[k], 0) / rows.length;
  out.samples = rows.length;
  return out;
}
const sources = [
  'js/config/tower-skills.js',
  'js/config/skills.js',
  'js/config/towers.js',
  'js/effects.js',
  'js/combat/towers/cannon.js',
  'js/combat/areas.js',
  'js/combat/damage.js',
  'js/game/main.js',
];
const hashes = () =>
  sources.map((file) => ({
    file,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(root + '/' + file))
      .digest('hex'),
  }));
const startHashes = hashes();
const stationary = [],
  mobile = [],
  finite = [];
try {
  for (const def of definitions) {
    const r = volley(def);
    const count = 3 + (def.branch === 'A' ? def.level : 0);
    close(r.direct, count * 120 * (def.branch === 'B' ? 1 + 0.4 * def.level : 1));
    close(r.ground, def.branch === 'C' ? 3 * 100 * 0.24 * def.level * 2 : 0);
    close(r.energySpent, 2);
    stationary.push(r);
  }
  console.log(
    'PASS normalized base and all9 branch tiers: exact volley damage,2energy, impact timing.',
  );
  const seeds = Array.from({ length: 16 }, (_, i) => 41 + i * 997);
  for (const scene of ['boss', 'dense12', 'medium12', 'scatter6'])
    for (const speed of [0, 60, 120])
      for (const branch of [null, 'A', 'B', 'C']) {
        mobile.push(
          mean(seeds.map((seed) => volley({ branch, level: branch ? 3 : 0, scene, speed, seed }))),
        );
      }
  console.log('Normalized stationary/moving formations complete.');
  const profiles = [
    { hp: 1000, armor: 0 },
    { hp: 2380, armor: 0.2 },
  ];
  const finiteSeeds = Array.from({ length: 64 }, (_, i) => 73 + i * 577);
  for (const profile of profiles)
    for (const scene of ['dense12', 'medium12', 'scatter6'])
      for (const speed of [0, 60])
        for (const branch of ['A', 'B', 'C']) {
          finite.push(
            mean(
              finiteSeeds.map((seed) =>
                volley({ branch, level: 3, scene, speed, seed, fixedPower: false, ...profile }),
              ),
            ),
          );
        }
  const endHashes = hashes();
  assert.deepEqual(endHashes, startHashes, 'Source changed during analysis');
  const nativeReference = ['A', 'B', 'C'].map((branch) =>
    mean(seeds.map((seed) => volley({ branch, level: 3, fixedPower: false, seed }))),
  );
  const out = {
    date: '2026-11-09',
    method: {
      dt: 1 / 60,
      oneVolley: true,
      runSeconds: 6,
      normalization: 'shotDmg=100 for formula and movement control; nativeLv13 for finiteHP',
      period: 12,
      cost: 2,
      radius: 80,
      seeds,
      finiteSeeds,
      movement:
        'actual Main.enemyMoveSpeed,predictEnemyPosition,moveEnemy; no enemy attacks,waves or other tower attacks',
      fixtures:
        'boss=one large target; dense12=4x3 spacing35; medium12=4x3 spacing70; scatter6=3x2 spacing220; all move down together',
      finite:
        'nativeLv13 same three skills fully upgraded, but only support is cast; effectiveHP loss clamped to survivingHP; deaths remove target before next movement',
      excludes: 'relics,talents,store,synergy,other attacks,rewards; no modifications to game data',
    },
    stationary,
    mobile,
    finite,
    nativeReference,
    sourceHashes: startHashes,
  };
  fs.writeFileSync(root + '/docs/cannon-support-analysis-data.json', JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify({
      stationary: stationary.length,
      mobile: mobile.length,
      finite: finite.length,
      nativeReference: nativeReference.length,
    }),
  );
} finally {
  Math.random = originalRandom;
  Date.now = originalNow;
}
