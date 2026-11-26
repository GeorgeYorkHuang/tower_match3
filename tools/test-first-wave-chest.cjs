/** W2首次构筑宝箱回归：原生波次入口、落地点击、开箱三选一与每局去重。 */
const assert = require('assert');
const fixture = require('./balance/fixtures/moving-battle-fixture.cjs');
const Main = require('../js/game/main.js');
const { Meta } = require('../js/meta.js');
const CONFIG = require('../js/config.js');
const Chests = require('../js/game/flows/board-chests.js');
const Timing = require('../js/config/board-chests.js');

function create(field, star = 0) {
  const g = new Main();
  g.meta = new Meta();
  g.meta.tutorial.done = true;
  g.meta.relicStars.s_sr_cm_exp = star;
  g.menuStage = field;
  g.saveData = null;
  g.save.save = () => {};
  g.toast = () => {};
  g.newRun(true);
  return g;
}

try {
  for (const field of ['ancient','lava','frost','abyss']) {
    const g = create(field);
    assert.equal(g.run.wave, 1);
    assert.equal(g.fieldChests.length, 0, 'No W1 chest without three-star experience relic');
    g.startNextWave();
    assert.equal(g.run.wave, 2);
    assert.equal(g.fieldChests.length, 1, field + ' must receive its W2 chest');
    assert.equal(g.fieldChests[0].kind, 'firstWave');
    assert.equal(Chests.grantFirstReward(g), false);
    assert.equal(g.fieldChests.length, 1);
    const chest = g.fieldChests[0];
    Chests.tick(g, Timing.ground);
    assert.equal(chest.stage, 'ground');
    assert.equal(g._chestBusy, false, '掉落宝箱不应锁定抽卡');
    assert.equal(g.pendingRelicPicks.length, 0, '等待玩家点击开启');
    assert(Chests.tap(g,{x:chest.x,y:chest.y}));
    assert.equal(g.fieldChests.length, 0);
    assert.equal(g.pendingRelicPicks.length, 1);
    assert(g.pendingRelicPicks[0].candidates.length > 0);
    g.update(0.016);
    assert.equal(g.state, 'relicpick');
    const chosen = g.relicPick.candidates[0].id;
    g.relicPickChoice(0);
    assert.equal(g.run.runRelic[chosen], 1);
    assert.equal(g.state, 'fighting');
    g.startNextWave();
    assert.equal(g.fieldChests.length, 0, 'W3 does not repeat first reward');
    g.newRun(true);
    g.startNextWave();
    assert.equal(g.fieldChests.length, 1, 'Fresh run gets a fresh W2 reward');
  }

  const extra = create('ancient', 3);
  assert.equal(extra.pendingRelicPicks.length, 1);
  extra.update(0.016);
  extra.relicPickChoice(0);
  extra.startNextWave();
  assert.equal(extra.fieldChests.length, 1, 'Opening relic choice must not replace W2 reward');

  const testing = create('ancient');
  testing.menuStage = 'test';
  testing.startNextWave();
  assert.equal(testing.fieldChests.length, 0);
  console.log('PASS: W2 grant, all fields, ground drop, click-to-open collection, actual selection, deduplication, restart, opening reward independence and test exclusion.');
} finally {
  fixture.restore();
}
