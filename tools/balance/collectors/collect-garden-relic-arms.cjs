/** 圣坛花园圣遗物四臂摸底：A 无圣物 / B 局内圣物 / C1 红卡1★ / C3 红卡3★；只读、不改数值。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '../../..'), frozen = require('../fixtures/freeze-runtime.cjs').freeze(root);
const api = require('../fixtures/moving-battle-fixture.cjs');
const routes = require('../scenarios/six-tower-current-routes.cjs');
const policy = require('../fixtures/relic-only-policy.cjs');

const route = 'primary';
const ARMS = {
  A: { relics: false, talentStar: 0, label: '无圣物' },
  B: { relics: true, talentStar: 0, label: '局内圣物' },
  C1: { relics: true, talentStar: 1, label: '红卡1★' },
  C3: { relics: true, talentStar: 3, label: '红卡3★' },
  // 隔离对照：1★ 只保留单发攻击（+6），或只保留绿点（charge/dot/skill 等）
  C1A: { relics: true, talentStar: 1, talentOnly: ['attack'], label: '红卡1★仅攻击' },
  C1G: {
    relics: true, talentStar: 1, talentOnly: ['speed', 'charge', 'damage', 'skill', 'dot', 'duration'],
    label: '红卡1★仅绿点',
  },
};
const arm = process.argv[2];
assert(ARMS[arm], 'arm must be A|B|C1|C3|C1A|C1G');
const seeds = (process.argv[3] ? process.argv[3].split(',') : Array.from({ length: 12 }, (_, i) => i + 1)).map(Number);
Object.assign(api.routes, routes[route]);

const base = {
  field: 'ancient', profile: 'elements', cadence: 2,
  maxWave: 60, windowEnd: 60, maxSeconds: 3600, stopAtFirstBreach: true,
  ...ARMS[arm],
  ...(ARMS[arm].relics
    ? { selectRelic: (g, candidates) => policy.select(g, candidates, routes[route], 'build') }
    : {}),
};

const start = performance.now(), runs = [];
try {
  for (const seed of seeds) {
    const r = api.collect({ ...base, seed });
    runs.push({
      seed, arm, talentStar: r.talentStar || 0, talentOnly: r.talentOnly || null,
      wave: r.wave, clearedWaves: r.clearedWaves, terminal: r.terminal,
      seconds: +r.seconds.toFixed(1), wallHp: r.wallHp, wallMax: r.wallMax,
      levels: r.levels, relics: r.relicChoices ? r.relicChoices.length : 0,
      relicIds: (r.relicChoices || []).map(c => c.id),
      talentGold: (r.talentGold || []).length, talentPurple: (r.talentPurple || []).length,
      waves: r.waves.map(w => ({ wave: w.wave, reason: w.reason, wallHp: w.wallHp,
        wallMax: w.wallMax, remaining: w.remainingEnemies, levels: w.levels })),
    });
    console.log(JSON.stringify({ arm, seed, wave: r.wave, cleared: r.clearedWaves, terminal: r.terminal,
      relics: runs[runs.length - 1].relics, s: runs[runs.length - 1].seconds,
      elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  const out = path.join(root, 'docs', `garden-relic-arms-${arm}-2026-11-16.json.gz`);
  fs.writeFileSync(out, gzipSync(JSON.stringify({
    date: '2026-11-16', arm, label: ARMS[arm].label, route, routes: routes[route], seeds,
    method: 'ancient W1-60, cadence 2s, pure towers, no shop/talents except red cards, first-breach stop, '
      + 'in-run relics via native 12 chest nodes + build policy; red cards equipped at native slots (testing.snapshot).',
    sourceHashes: frozen.sourceHashes, frozenRuntime: true, runs,
  })));
  console.log(JSON.stringify({ arm, done: runs.length, file: path.basename(out),
    totalSec: +((performance.now() - start) / 1000).toFixed(0) }));
} finally { api.restore(); frozen.restore(); }
