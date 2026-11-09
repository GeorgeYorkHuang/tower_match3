const assert = require('assert');
const api = require('./moving-battle-fixture.cjs');
try {
  const opts = {
    field: 'ancient',
    profile: 'elements',
    seed: 41,
    cadence: 2,
    startLevel: 4,
    fixedLevel: true,
    windowEnd: 1,
    maxSeconds: 120,
  };
  const a = api.collect(opts);
  assert(
    GameGlobal.game.run.effects.synergyDone[0],
    'Preloaded ice/electric skills must activate native synergy immediately',
  );
  const b = api.collect(opts);
  assert.deepEqual(a, b, 'Repeated replay must be deterministic');
  assert.equal(a.terminal, 'window_complete');
  assert.equal(a.waves.at(-1).remainingEnemies, 0);
  assert(a.totals.matchEnergy > 0);
  assert(a.totals.kills > 0);
  const paired = api.collect({ ...opts, profile: 'artillery_control' });
  for (let i = 0; i < Math.min(a.moves.length, paired.moves.length); i++) {
    assert.equal(a.moves[i].board, paired.moves[i].board);
    assert.deepEqual(a.moves[i].move, paired.moves[i].move);
  }
  const capped = api.collect({ ...opts, maxSeconds: 1 });
  assert.equal(capped.terminal, 'time_cap');
  assert.notEqual(capped.terminal, 'window_complete');
  console.log(
    'PASS replay determinism, paired board actions, real clear with no residuals, actual match-energy capture and time-cap censoring.',
  );
} finally {
  api.restore();
}
