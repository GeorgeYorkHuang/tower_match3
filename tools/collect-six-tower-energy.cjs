/** 六塔供能对照：固定投入靶场 + 三地图真实移动回放；只写docs，不改游戏数值。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { performance } = require('perf_hooks');
const { attach } = require('./tower-energy-observer.cjs');
const CONFIG = require('../js/config.js');
const root = path.resolve(__dirname, '..'), mode = process.argv[2] || 'moving';
// 可选标签隔离不同规则的复测数据，例如 fixed after-fee；默认文件名兼容旧报告。
const tag = process.argv[3] || '';
if (tag && !/^[a-z0-9-]+$/.test(tag)) throw Error('Invalid result tag');
const stem = 'six-tower-energy' + (tag ? '-' + tag : '');
const start = performance.now();
const seconds = () => (performance.now() - start) / 1000;
function hashes() {
  const out = {};
  function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) out[path.relative(root, p).replaceAll('\\', '/')] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } }
  walk(root + '/js'); return out;
}
const source = hashes();
const skillEnergyFactors = Object.fromEntries(Object.entries(require('../js/config/tower-skills.js')).map(([key, skills]) =>
  [key, Object.fromEntries(Object.entries(skills).filter(([, s]) => s.attackEnergyFactor != null).map(([name, s]) => [name, s.attackEnergyFactor]))]));
function save(data, final = false) {
  const body = { date: '2026-11-10', version: require('../js/config/version.js').version, mode,
    runLabel: tag || 'baseline', elapsedSeconds: seconds(), sourceHashes: source, skillEnergyFactors, ...data };
  fs.writeFileSync(root + '/docs/' + stem + '-' + mode + (final ? '.json' : '-checkpoint.json'), JSON.stringify(body, null, final ? 2 : 0));
}
if (mode === 'fixed') {
  const api = require('./tower-balance-fixture.cjs'), runs = [];
  try {
    for (const key of Object.keys(CONFIG.TOWERS))
      for (const route of ['steady', 'alternate'])
        for (const stage of [0, 1, 3])
          for (const scenario of ['boss', 'dense'])
            for (const supply of stage === 3 ? ['neutral', 0.7, 0.35] : ['neutral', 0.7])
              for (const seed of [41, 123]) {
                const state = api.setup(key, api[route][key], stage, scenario, seed, 'finite');
                let measuring = false;
                const observer = attach(state.game, { neutral: supply === 'neutral', enabled: () => measuring });
                const warm = 120, measured = 120, fps = 60, dt = 1 / fps;
                let damageBefore;
                for (let frame = 0; frame < (warm + measured) * fps; frame++) {
                  api.setClock(frame * dt * 1000);
                  if (frame === warm * fps) { state.measure(); measuring = true; damageBefore = JSON.parse(JSON.stringify(state.run.dmgStat[key] || { total: 0, normal: 0, dot: 0, skill: {} })); }
                  if (supply !== 'neutral') state.tower.energy = Math.min(state.run.armoryEnergyMax(key), state.tower.energy + supply * dt);
                  state.tick(dt); observer.afterUpdate(dt);
                }
                const s = state.stats();
                const native = state.run.dmgStat[key] || { total: 0, normal: 0, dot: 0, skill: {} };
                runs.push({ key, route, stage, level: state.tower.level, scenario, supply, seed,
                  seconds: measured, dps: (native.total - damageBefore.total) / measured,
                  normalDps: (native.normal - damageBefore.normal) / measured, dotDps: (native.dot - damageBefore.dot) / measured,
                  skillDps: Object.fromEntries(Object.entries(native.skill).map(([k, v]) => [k, (v - (damageBefore.skill[k] || 0)) / measured])),
                  requestedEnergyPerSecond: (s.energy + s.castEnergy) / measured,
                  actualEnergyPerSecond: (s.actualAttackEnergy + s.actualSkillEnergy) / measured,
                  hardControlFraction: s.cc / measured / state.points.length,
                  endEnergy: state.tower.energy, observations: observer.finish() });
                if (runs.length % 12 === 0) {
                  save({ runs });
                  console.log(JSON.stringify({ mode, runs: runs.length, key, elapsed: +seconds().toFixed(1) }));
                }
              }
    if (JSON.stringify(source) !== JSON.stringify(hashes())) throw Error('Runtime source changed during fixed collection');
    save({ runs, routes: { steady: api.steady, alternate: api.alternate }, warmSeconds: 120, measureSeconds: 120, fps: 60 }, true);
    console.log(JSON.stringify({ complete: true, mode, runs: runs.length, elapsed: seconds() }));
  } finally { api.restore(); }
} else if (mode === 'moving') {
  const api = require('./moving-battle-fixture.cjs'), runs = [], raw = [];
  let pairedChecks = 0, pairedSteps = 0;
  const scenarios = [
    { field: 'ancient', cadence: 2, seed: 41 }, { field: 'ancient', cadence: 2, seed: 123 },
    { field: 'lava', cadence: 2, seed: 41 }, { field: 'frost', cadence: 2, seed: 41 },
    { field: 'ancient', cadence: 4, seed: 41 },
  ];
  try {
    for (const scenario of scenarios)
      for (const profile of Object.keys(api.profiles)) {
        let baseline;
        for (const condition of ['normal', 'neutral', 'relics']) {
          const result = api.collect({ ...scenario, profile, maxSeconds: 2400, stopAtFirstBreach: true,
            relics: condition === 'relics', configureGame: g => attach(g, { neutral: condition === 'neutral' }) });
          if (condition === 'normal') baseline = result;
          if (condition === 'neutral') {
            for (let i = 0; i < Math.min(baseline.moves.length, result.moves.length); i++) {
              if (baseline.moves[i].board !== result.moves[i].board || JSON.stringify(baseline.moves[i].move) !== JSON.stringify(result.moves[i].move))
                throw Error('Unpaired board actions: ' + JSON.stringify({ scenario, profile, i }));
              pairedSteps++;
            }
            pairedChecks++;
          }
          raw.push({ condition, ...result });
          const { moves, upgrades, waves, ...summary } = result;
          runs.push({ condition, ...summary, moveCount: moves.length, upgradeCount: upgrades.length });
          save({ runs, pairedChecks, pairedSteps });
          console.log(JSON.stringify({ mode, condition, ...scenario, profile, wave: result.wave,
            terminal: result.terminal, relics: result.relicChoices?.length || 0, runs: runs.length, elapsed: +seconds().toFixed(1) }));
        }
      }
    if (JSON.stringify(source) !== JSON.stringify(hashes())) throw Error('Runtime source changed during moving collection');
    fs.writeFileSync(root + '/docs/' + stem + '-moving-raw.json.gz', zlib.gzipSync(JSON.stringify({ sourceHashes: source, runs: raw })));
    save({ runs, pairedChecks, pairedSteps, routes: api.routes, profiles: api.profiles,
      method: 'Native moving battle, stop at FIRST zero wall HP before wave-end healing, ordinary 3-match priority, first relic candidate selected instantly, no shop/talents/permanent stars; neutral=60/cap before combat update, not 100.' }, true);
    console.log(JSON.stringify({ complete: true, mode, runs: runs.length, elapsed: seconds() }));
  } finally { api.restore(); }
} else throw Error('Expected fixed or moving');
