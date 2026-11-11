/** 火/炮单技能对照：六个预先选定案例筛选，再用组合候选完整复测强化路线。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const candidate = require('./garden-energy-candidates.cjs');
const name = process.argv[2], full = process.argv[3] === 'full';
assert(candidate.specs[name] && name !== 'none');
const base = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-attack-stats.json.gz'))));
assert.deepStrictEqual(base.sourceHashes, frozen.sourceHashes);
const wanted = new Set(['no_ice:41', 'no_ice:123', 'artillery_control:41', 'artillery_control:123', 'wind_artillery:41', 'wind_control:41']);
const cases = base.runs.filter(r => r.route === 'primary' && (full || wanted.has(r.profile + ':' + r.seed)));
const cached = new Map();
const screenPath = path.join(root, 'docs', `garden-energy-${name}.json.gz`);
if (full && fs.existsSync(screenPath)) {
  const screen = JSON.parse(gunzipSync(fs.readFileSync(screenPath)));
  assert.deepStrictEqual(screen.sourceHashes, frozen.sourceHashes);
  assert.deepStrictEqual(screen.parameters, candidate.specs[name]);
  for (const r of screen.runs) cached.set(r.profile + ':' + r.seed, r);
}
Object.assign(api.routes, routes.primary);
let treatment = 'none';
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument), audit = candidate.attach(g, treatment);
  return instrument ? { afterUpdate: observer.afterUpdate, finish: () => ({ ...observer.finish(), skillEnergy: audit }) } : null;
}
function options(r) {
  return { field: 'ancient', seed: r.seed, profile: r.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes.primary, 'build') };
}
const runs = [], start = performance.now();
try {
  const first = cases[0], { route, observations, ...saved } = first;
  assert.deepStrictEqual(api.collect({ ...options(first), configureGame: g => configure(g, false) }), saved);
  treatment = name;
  const plain = api.collect({ ...options(first), configureGame: g => configure(g, false) });
  const { observations: ignored, ...observed } = api.collect({ ...options(first), configureGame: configure });
  assert.deepStrictEqual(plain, observed);
  for (const row of cases) {
    const savedScreen = cached.get(row.profile + ':' + row.seed);
    if (savedScreen) { runs.push(savedScreen); continue; }
    const result = api.collect({ ...options(row), configureGame: configure });
    support.scope(GameGlobal.game);
    const a = result.observations.skillEnergy;
    assert.equal(a.bossOriginal, a.bossCharged, 'Boss fees must stay identical at every charged event');
    assert(a.regularCharged <= a.regularOriginal + 1e-8);
    runs.push({ route: 'primary', energyCandidate: name, ...result });
    console.log(JSON.stringify({ name, runs: runs.length, total: cases.length, profile: row.profile, seed: row.seed,
      wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs', `garden-energy-${name}${full ? '-full' : ''}.json.gz`), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: [], passiveReplayChecked: true,
    reproducedBaseline: true, parameters: candidate.specs[name], fullRoute: full,
    reusedScreenRuns: cached.size, newRuns: runs.length - cached.size,
    method: 'Only garden, same current base attack/growth+20%,1star relics,no shop/talents. No energy injection. Normal primary attack cost alone scales by chosen skill coefficients once when active; upgrades do not stack discounts. If any alive Boss or bossLock, every primary cost remains original. Match bonus and periodic costs unchanged. FullW1-W40/first breach. Screen six fixed cases or full12 primary route; no other map.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
