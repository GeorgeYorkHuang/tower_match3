// 六塔伤害复测入口：运行node tools/retest-six-towers.cjs，更新docs中的原始复测JSON。
// 只读取游戏数值；不启动微信界面，不改动游戏逻辑。
/** Read-only six-tower retest. Output is a new data file; prior measurements are retained. */
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const core = require('./tower-balance-fixture.cjs');
const root = path.resolve(__dirname, '..');
const CONFIG = require(root + '/js/config.js');
const start = process.hrtime.bigint();
const elapsed = () => Number(process.hrtime.bigint() - start) / 1e9;
const sources = [
  'js/config.js',
  'js/config/towers.js',
  'js/config/tower-skills.js',
  'js/config/skills.js',
  'js/effects.js',
  'js/run.js',
  'js/combat.js',
  'js/config/energy-state.js',
  'js/combat/attacks.js',
  'js/combat/attack-energy.js',
  'js/combat/damage.js',
  'js/combat/statuses.js',
  'js/combat/towers/fire.js',
  'js/combat/towers/ice.js',
  'js/combat/towers/poison.js',
  'js/combat/towers/electric.js',
  'js/combat/towers/boomerang.js',
  'js/combat/towers/cannon.js',
];
const hashes = () =>
  sources.map((file) => ({
    file,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(root + '/' + file))
      .digest('hex'),
  }));
const beforeHashes = hashes();
const seeds = [41, 123];
const scenarios = ['boss', 'dense', 'spread'];
const results = [],
  constrained = [],
  naked = [],
  singles = [],
  frameChecks = [],
  patchComparisons = [];
const mean = (key, build, step, scenario, mode = 'steady') =>
  core.average(seeds.map((seed) => core.simulate(key, build, step, scenario, seed, mode)));
process.env.TOWER_BENCH_DT = String(1 / 60);
try {
  for (const key of Object.keys(CONFIG.TOWERS)) {
    for (const [role, build] of [
      ['steady', core.steady[key]],
      ['alternate', core.alternate[key]],
    ]) {
      for (const step of [0, 1, 3])
        for (const scenario of scenarios) {
          results.push({ role, ...mean(key, build, step, scenario) });
        }
      for (const scenario of scenarios)
        constrained.push({ role, ...mean(key, build, 3, scenario, 'supply') });
    }
    for (const scenario of scenarios) naked.push(mean(key, [], 0, scenario));
    console.log(JSON.stringify({ phase: 'builds', done: key, seconds: +elapsed().toFixed(1) }));
  }
  for (const key of Object.keys(CONFIG.TOWERS)) {
    for (const def of CONFIG.EFFECT_POOLS[key])
      for (const scenario of ['boss', 'dense']) {
        const base = core.simulate(key, [[def.name, 'A']], 0, scenario);
        const max = ['A', 'B', 'C'].map((branch) =>
          core.simulate(key, [[def.name, branch]], 3, scenario),
        );
        singles.push({ key, skill: def.name, scenario, base, max });
      }
    console.log(
      JSON.stringify({ phase: 'singleSkills', done: key, seconds: +elapsed().toFixed(1) }),
    );
  }
  // Check timestep sensitivity on the exact same full-investment builds and seeds.
  process.env.TOWER_BENCH_DT = String(1 / 30);
  for (const key of Object.keys(CONFIG.TOWERS))
    for (const [role, build] of [
      ['steady', core.steady[key]],
      ['alternate', core.alternate[key]],
    ])
      for (const scenario of ['boss', 'dense']) {
        const hz30 = mean(key, build, 3, scenario);
        const hz60 = results.find(
          (r) => r.key === key && r.role === role && r.level === 13 && r.scenario === scenario,
        );
        frameChecks.push({
          key,
          role,
          scenario,
          hz30,
          hz60Dps: hz60.dps,
          ratio60to30: hz60.dps / hz30.dps,
        });
      }
  console.log(JSON.stringify({ phase: 'frameChecks', seconds: +elapsed().toFixed(1) }));
  const baselineFile = root + '/docs/six-tower-balance-data.json';
  const old60 = fs.existsSync(baselineFile)
    ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')).checks60Hz || []
    : [];
  for (const previous of old60) {
    const current = results.find(
      (r) =>
        r.key === previous.key &&
        r.role === previous.role &&
        r.level === 13 &&
        r.scenario === previous.scenario,
    );
    patchComparisons.push({
      key: previous.key,
      role: previous.role,
      scenario: previous.scenario,
      oldDps: previous.dt60Dps,
      newDps: current.dps,
      change: current.dps / previous.dt60Dps - 1,
    });
  }
  // 额外5分钟供能压力：初始储备可能尚未耗尽，结果不宣称为稳态。
  process.env.TOWER_BENCH_DT = String(1 / 60);
  const longRows = [];
  for (const key of Object.keys(CONFIG.TOWERS)) {
    for (const [role, build] of [
      ['steady', core.steady[key]],
      ['alternate', core.alternate[key]],
    ]) {
      for (const scenario of ['boss', 'dense']) {
        const rows = seeds.map((seed) =>
          core.simulate(key, build, 3, scenario, seed, 'supply', null, {
            warmSeconds: 180,
            measureSeconds: 120,
          }),
        );
        longRows.push({ role, ...core.average(rows) });
      }
    }
    console.log(JSON.stringify({ phase: 'longSupply', done: key, seconds: +elapsed().toFixed(1) }));
  }
  const longSupply = {
    warmSeconds: 180,
    measureSeconds: 120,
    supplyPerSecond: 0.7,
    seeds,
    rows: longRows,
  };
  const afterHashes = hashes();
  if (JSON.stringify(beforeHashes) !== JSON.stringify(afterHashes))
    throw Error('Source changed during benchmark; rerun required.');
  const out = {
    date: '2026-11-09',
    method: {
      timeStep: 1 / 60,
      warmSeconds: 30,
      measureSeconds: 60,
      seeds,
      energySteady: 'reset to60 before each frame; no ordinary energy-state bonus',
      energySupply:
        'initial60 then add0.7/sec through warmup+measurement, capped at tower max; artificial equal supply',
      fixtures: {
        boss: 'one stationary zero-armor large Boss target at375,610, no boss phase/attacks',
        dense: '12 stationary zero-armor normal targets,4x3 at35px spacing',
        spread: '6 stationary normal targets at280px horizontal/250px vertical spacing',
      },
      targetHp: 1e10,
      legalChoices:
        'three skills with one selected branch each, equal3/6/12 choices at levels4/7/13',
      exclusions:
        'relics,talents,store,synergy,global skills,match3 shots,movement,kills,enemy attacks,wave progression',
      costs:
        'requested attack/skill cost and actual deduction are separate; unpaidSkillCasts counts casts whose cost exceeds current energy',
      frameChecks: '30Hz vs60Hz for identical full builds and seeds',
      singleSkills: 'one seed41; exploratory branches, not whole-build rankings',
    },
    growth: core.growth,
    builds: { steady: core.steady, alternate: core.alternate },
    naked,
    results,
    constrained,
    singles,
    frameChecks,
    patchComparisons,
    longSupply,
    sourceHashes: beforeHashes,
    elapsedSeconds: elapsed(),
  };
  fs.writeFileSync(root + '/docs/six-tower-retest-data.json', JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify({
      complete: true,
      resultRows: results.length,
      supplyRows: constrained.length,
      singleSkillEntries: singles.length,
      frameChecks: frameChecks.length,
      seconds: +elapsed().toFixed(1),
    }),
  );
} finally {
  core.restore();
}
