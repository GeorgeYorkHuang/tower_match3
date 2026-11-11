/** W15–20专项：同棋盘前14波，随后仅给火/炮提供60能量参考；游戏配置保持不变。 */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), assert = require('assert');
const { performance } = require('perf_hooks');
const api = require('./moving-battle-fixture.cjs');
const { attach } = require('./wave15-20-observer.cjs');
const root = path.resolve(__dirname, '..'), start = performance.now();
const routes = { fire: [['多重火球', 'A'], ['大火球', 'B'], ['灼烧', 'C']],
  ice: [['多重冰锥', 'C'], ['冰穿刺', 'A'], ['碎冰', 'B']],
  poison: [['剧毒', 'A'], ['瘟疫', 'A'], ['毒爆', 'A']],
  electric: [['连锁', 'A'], ['活电', 'A'], ['麻痹', 'A']],
  boomerang: [['多镖', 'A'], ['接镖', 'A'], ['风痕', 'B']],
  cannon: [['重炮', 'B'], ['双管齐射', 'A'], ['碎裂弹', 'C']] };
const previous = { ...api.routes };
function hashes() {
  const out = {};
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) out[path.relative(root, file).replaceAll('\\', '/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } }
  walk(root + '/js'); return out;
}
const sourceHashes = hashes(), runs = [];
let pairedChecks = 0, pairedSteps = 0;
try {
  Object.assign(api.routes, routes);
  for (const seed of [41, 123]) for (const profile of ['elements', 'artillery_control', 'summon_control', 'wind_artillery']) {
    let baseline;
    const keys = api.profiles[profile];
    const conditions = { normal: [], fire60: ['fire'], ...(keys.includes('cannon') ? { cannon60: ['cannon'], both60: ['fire', 'cannon'] } : {}) };
    for (const [condition, targets] of Object.entries(conditions)) {
      const result = api.collect({ field: 'ancient', cadence: 2, seed, profile, maxSeconds: 2400,
        maxWave: 20, windowEnd: 20, stopAtFirstBreach: true, configureGame: g => attach(g, targets) });
      if (condition === 'normal') baseline = result;
      else {
        assert.deepEqual(baseline.waves.filter(w => w.wave < 15), result.waves.filter(w => w.wave < 15), 'W1–14 changed');
        for (let i = 0; i < Math.min(baseline.moves.length, result.moves.length); i++) {
          assert.equal(baseline.moves[i].board, result.moves[i].board);
          assert.deepEqual(baseline.moves[i].move, result.moves[i].move); pairedSteps++;
        }
        pairedChecks++;
      }
      const obs = result.observations;
      let hit = 0, missed = 0;
      for (const w of obs.waves) for (const row of Object.values(w.towers)) { hit += row.hitProjectiles; missed += row.missedProjectiles; }
      assert.equal(hit + missed + obs.pendingProjectiles, obs.launchedProjectiles);
      runs.push({ condition, ...result });
      console.log(JSON.stringify({ runs: runs.length, seed, profile, condition, terminal: result.terminal,
        wave: result.wave, hp: result.wallHp, elapsed: (performance.now() - start) / 1000 }));
    }
  }
  assert.deepEqual(hashes(), sourceHashes, 'Runtime changed during collection');
  const body = { date: '2026-11-10', version: require('../js/config/version.js').version,
    sourceHashes, routes, pairedChecks, pairedSteps, elapsedSeconds: (performance.now() - start) / 1000,
    method: 'Native primary routes, no relics/talents/shop; ordinary triple every2s, seeds41/123. First14waves identical; fromW15 only selected tower(s) held at60 before combat update. Stop afterW20 cleared or first breach. In-memory observer only, no runtime edits.', runs };
  fs.writeFileSync(root + '/docs/wave15-20-diagnosis-raw.json.gz', zlib.gzipSync(JSON.stringify(body)));
  fs.writeFileSync(root + '/docs/wave15-20-diagnosis.json', JSON.stringify({ ...body,
    runs: runs.map(({ moves, upgrades, ...r }) => ({ ...r, moves: moves.length, upgrades })) }, null, 2));
  console.log(JSON.stringify({ complete: true, runs: runs.length, pairedChecks, pairedSteps, elapsed: body.elapsedSeconds }));
} finally { Object.assign(api.routes, previous); api.restore(); }
