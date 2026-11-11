/** 强化普攻移动补测：仅在离线进程切换系数1/技能配置值，不写游戏配置或存档。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..');
const api = require('./moving-battle-fixture.cjs');
const { attach } = require('./tower-energy-observer.cjs');
const skills = require('../js/config/tower-skills.js');
const rows = Object.values(skills).flatMap(defs => Object.values(defs)).filter(s => s.attackEnergyFactor != null);
const original = rows.map(s => s.attackEnergyFactor);
const previousRoutes = { ...api.routes };
const routes = {
  fire: [['多重火球', 'A'], ['大火球', 'B'], ['灼烧', 'C']],
  ice: [['多重冰锥', 'C'], ['冰穿刺', 'A'], ['碎冰', 'B']],
  poison: [['剧毒', 'A'], ['瘟疫', 'A'], ['毒爆', 'A']],
  electric: [['连锁', 'A'], ['活电', 'A'], ['麻痹', 'A']],
  boomerang: [['多镖', 'A'], ['接镖', 'A'], ['风痕', 'B']],
  cannon: [['重炮', 'B'], ['双管齐射', 'A'], ['碎裂弹', 'C']],
};
function hashes() {
  const out = {};
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (file.endsWith('.js')) out[path.relative(root, file).replaceAll('\\', '/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  walk(root + '/js'); return out;
}
const sourceHashes = hashes(), start = performance.now(), runs = [];
let pairedSteps = 0, pairedChecks = 0;
try {
  Object.assign(api.routes, routes);
  for (const seed of [41, 123]) {
    for (const profile of Object.keys(api.profiles)) {
      let baseline;
      for (const condition of ['factor1', 'skillFactors', 'neutral']) {
        rows.forEach((s, i) => { s.attackEnergyFactor = condition === 'factor1' ? 1 : original[i]; });
        const result = api.collect({ field: 'ancient', cadence: 2, seed, profile, maxSeconds: 2400,
          stopAtFirstBreach: true, configureGame: g => attach(g, { neutral: condition === 'neutral' }) });
        if (condition === 'factor1') baseline = result;
        else {
          for (let i = 0; i < Math.min(baseline.moves.length, result.moves.length); i++) {
            if (baseline.moves[i].board !== result.moves[i].board || JSON.stringify(baseline.moves[i].move) !== JSON.stringify(result.moves[i].move)) throw Error('Unpaired primary-route actions');
            pairedSteps++;
          }
          pairedChecks++;
        }
        runs.push({ condition, ...result });
        console.log(JSON.stringify({ primary: true, runs: runs.length, seed, profile, condition, wave: result.wave, terminal: result.terminal, elapsed: (performance.now() - start) / 1000 }));
      }
    }
  }
  if (JSON.stringify(sourceHashes) !== JSON.stringify(hashes())) throw Error('Runtime files changed during primary collection');
  const body = { date: '2026-11-10', version: require('../js/config/version.js').version, sourceHashes,
    routes, profiles: api.profiles, pairedSteps, pairedChecks, elapsedSeconds: (performance.now() - start) / 1000,
    method: 'Same current runtime/primary routes, no relics; factor1=all per-skill cost coefficients temporarily set to1 in isolated memory; skillFactors=configured values; neutral=configured values plus60energy reference. No configuration files or user storage written.', runs };
  fs.writeFileSync(root + '/docs/six-tower-energy-skill-factors-primary-raw.json.gz', zlib.gzipSync(JSON.stringify(body)));
  fs.writeFileSync(root + '/docs/six-tower-energy-skill-factors-primary.json', JSON.stringify({ ...body,
    runs: runs.map(({ moves, waves, upgrades, ...r }) => ({ ...r, moveCount: moves.length, waveCount: waves.length, upgradeCount: upgrades.length })) }, null, 2));
  console.log(JSON.stringify({ complete: true, primary: true, runs: runs.length, pairedChecks, pairedSteps, elapsed: body.elapsedSeconds }));
} finally {
  rows.forEach((s, i) => { s.attackEnergyFactor = original[i]; });
  Object.assign(api.routes, previousRoutes);
  api.restore();
}
