/** 六塔当前版复测：固定60能量成长参考、三图真实三消供能及配对诊断；只写docs，不改游戏数值。 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { gzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..');
const frozen = require('./freeze-runtime.cjs').freeze(root);
const CONFIG = require('../js/config.js');
const routes = require('./six-tower-current-routes.cjs');
const { attach } = require('./tower-energy-observer.cjs');
const mode = process.argv[2] || 'primary';
assert(['fixed', 'primary', 'secondary'].includes(mode));
const tag = process.argv[3] || 'current';
const conditionMode = process.argv[4] || 'paired';
assert(/^[a-z0-9-]+$/.test(tag));
assert(['normal', 'paired'].includes(conditionMode));
const started = performance.now();
const runs = [];
const seconds = () => (performance.now() - started) / 1000;

function progress(extra) {
  console.log(JSON.stringify({ mode, runs: runs.length, elapsedSeconds: +seconds().toFixed(1), ...extra }));
}
function save(extra) {
  const body = {
    date: '2026-11-10', version: require('../js/config/version.js').version, mode, tag, conditionMode,
    sourceHashes: frozen.sourceHashes, loadedSources: frozen.loaded(),
    liveChanges: frozen.liveChanges(), frozenRuntime: true, elapsedSeconds: seconds(),
    routes, towers: CONFIG.TOWERS,
    skillEnergyFactors: Object.fromEntries(Object.entries(require('../js/config/tower-skills.js')).map(([key, skills]) =>
      [key, Object.fromEntries(Object.entries(skills).filter(([, s]) => s.attackEnergyFactor != null).map(([name, s]) => [name, s.attackEnergyFactor]))])),
    ...extra, runs,
  };
  fs.writeFileSync(path.join(root, 'docs', `six-tower-${tag}-${mode}.json.gz`), gzipSync(JSON.stringify(body)));
}

if (mode === 'fixed') {
  const api = require('./tower-balance-fixture.cjs');
  try {
    const warm = 120, measured = 120, fps = 60, dt = 1 / fps;
    for (const route of Object.keys(routes)) for (const key of Object.keys(CONFIG.TOWERS))
      for (const stage of [0, 1, 3]) for (const scenario of ['boss', 'dense']) for (const seed of [41, 123]) {
        const w = api.setup(key, routes[route][key], stage, scenario, seed, 'finite');
        let measuring = false;
        const observer = attach(w.game, { neutral: true, enabled: () => measuring });
        let before;
        for (let frame = 0; frame < (warm + measured) * fps; frame++) {
          api.setClock(frame * dt * 1000);
          if (frame === warm * fps) {
            measuring = true; w.measure();
            before = JSON.parse(JSON.stringify(w.run.dmgStat[key] || { total: 0, normal: 0, dot: 0, skill: {} }));
          }
          w.tick(dt); observer.afterUpdate(dt);
        }
        const native = w.run.dmgStat[key] || { total: 0, normal: 0, dot: 0, skill: {} };
        const stat = w.stats();
        const damage = native.total - before.total;
        const asked = stat.energy + stat.castEnergy;
        const paid = stat.actualAttackEnergy + stat.actualSkillEnergy;
        assert(Number.isFinite(damage) && damage >= 0 && paid >= 0 && paid <= asked + 1e-6);
        assert.equal(w.tower.level, 4 + stage * 3);
        runs.push({ key, route, level: w.tower.level, stage, scenario, seed, seconds: measured,
          damage, dps: damage / measured, normalDps: (native.normal - before.normal) / measured,
          dotDps: (native.dot - before.dot) / measured,
          skillDps: Object.fromEntries(Object.entries(native.skill).map(([name, value]) => [name, (value - (before.skill[name] || 0)) / measured])),
          asked, paid, askedPerSecond: asked / measured, paidPerSecond: paid / measured,
          damagePerAsked: asked > 0 ? damage / asked : null,
          hardControlFraction: stat.cc / measured / w.points.length,
          slowEquivalent: stat.slow / measured / w.points.length,
          observations: observer.finish(),
        });
        if (runs.length % 12 === 0) progress({ key, route });
      }
    assert.equal(runs.length, 144);
    save({ warmSeconds: warm, measureSeconds: measured, fps,
      method: 'Fixed immortal stationary targets; neutral60 reset before combat update; no passive regen/supply added. Same two route sets as moving. Lv4/7/13, single large Boss or12normal targets, seeds41/123. Growth reference only, not real supply or player DPS.' });
    progress({ complete: true });
  } finally { api.restore(); frozen.restore(); }
} else {
  const api = require('./moving-battle-fixture.cjs');
  const originalRoutes = { ...api.routes };
  Object.assign(api.routes, routes[mode]);
  let pairedChecks = 0, pairedSteps = 0;
  function observe(g, neutral) {
    const energy = attach(g, { neutral });
    const levels = new Map();
    return {
      afterUpdate(dt) {
        energy.afterUpdate(dt);
        const wave = g.run.wave;
        for (const key of g.run.slotOrder) {
          const id = wave + '/' + key;
          if (!levels.has(id)) levels.set(id, { wave, key, seconds: 0, levelSeconds: 0 });
          const row = levels.get(id);
          row.seconds += dt; row.levelSeconds += g.combat.tower(key).level * dt;
        }
      },
      finish() { return { ...energy.finish(), levels: [...levels.values()] }; },
    };
  }
  try {
    const options = { field: 'ancient', profile: 'elements', seed: 41, cadence: 2,
      maxWave: 60, maxSeconds: 2400, stopAtFirstBreach: true };
    // 完整原生回放对照，确保新增观察器不改变战斗、棋盘或升级结果。
    const plain = api.collect(options);
    const { observations, ...instrumented } = api.collect({ ...options, configureGame: g => observe(g, false) });
    assert.deepStrictEqual(plain, instrumented, 'Energy observer changed native replay');
    const scenarios = [];
    for (const field of ['ancient', 'lava', 'frost']) for (const seed of [41, 123]) scenarios.push({ field, seed, cadence: 2 });
    for (const seed of [41, 123]) scenarios.push({ field: 'ancient', seed, cadence: 4 });
    for (const scenario of scenarios) for (const profile of Object.keys(api.profiles)) {
      let normal;
      for (const condition of conditionMode === 'normal' ? ['normal'] : ['normal', 'neutral']) {
        const result = api.collect({ ...options, ...scenario, profile, configureGame: g => observe(g, condition === 'neutral') });
        if (condition === 'normal') normal = result;
        else {
          for (let i = 0; i < Math.min(normal.moves.length, result.moves.length); i++) {
            assert.equal(normal.moves[i].board, result.moves[i].board, 'Unpaired board sequence');
            assert.deepStrictEqual(normal.moves[i].move, result.moves[i].move, 'Unpaired move');
            pairedSteps++;
          }
          pairedChecks++;
        }
        for (const wave of result.waves) for (const [key, r] of Object.entries(wave.towers)) {
          assert(r.actualAttackEnergy + r.actualSkillEnergy <= r.requestedAttackEnergy + r.requestedSkillEnergy + 1e-6, key);
          assert(r.zeroSeconds <= r.lowSeconds + 1e-6 && r.lowSeconds <= wave.seconds + 1e-6);
        }
        runs.push({ route: mode, condition, ...result });
        progress({ ...scenario, profile, condition, wave: result.wave, terminal: result.terminal });
      }
    }
    assert.equal(runs.length, conditionMode === 'normal' ? 48 : 96);
    assert.equal(pairedChecks, conditionMode === 'normal' ? 0 : 48);
    save({ profiles: api.profiles, passiveReplayChecked: true, pairedChecks, pairedSteps,
      method: 'Native moving battle; 3maps, 2seeds, 6four-towerprofiles, 2s triples; garden also4s. Normal actual matches/global energy only, no invented0.7/s regen. conditionMode=normal excludes neutral; paired additionally resets60 before update as diagnostic. No relic/shop/talents/stars; maxW60/time2400s or FIRST breach. Changed energy can change levels/enemy timing, so not a pure per-tower causal DPS ratio.' });
    progress({ complete: true, pairedChecks, pairedSteps });
  } finally { Object.assign(api.routes, originalRoutes); api.restore(); frozen.restore(); }
}
