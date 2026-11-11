/** W2首次构筑宝箱回归：原生波次入口、入盘、相邻三消、开箱三选一与每局去重。 */
const assert = require('assert');
const fixture = require('./moving-battle-fixture.cjs');
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
    assert.equal(chest.stage, 'toBoard');
    Chests.tick(g, Timing.flight);
    assert.equal(chest.stage, 'board');
    assert.equal(g.run.board.grid[chest.r][chest.c].id, chest.id);
    assert.equal(g._chestBusy, false, 'Input unlocks after chest lands');

    // 在宝箱邻格放入同色三连，使用原生resolve验证宝箱确实会被收集。
    const board = g.run.board;
    // 构造无已有匹配的普通底盘，避免随机原盘把测试三连延伸成四连并保留邻格特殊块。
    const colors = board.activeColors;
    board.grid = board.grid.map((line, r) => line.map((v, c) =>
      typeof v === 'string' ? colors[(r * 2 + c) % colors.length] : v));
    const row = chest.r > 0 ? chest.r - 1 : chest.r + 1;
    const col = Math.max(0, Math.min(board.cols - 3, chest.c - 1));
    for (let c = col; c < col + 3; c++) board.grid[row][c] = 'red';
    for (const c of [col - 1, col + 3]) if (c >= 0 && c < board.cols && typeof board.grid[row][c] === 'string') board.grid[row][c] = 'green';
    const result = board.resolve();
    const collected = result.stepList.flatMap(s => s.chestsCollected || []);
    assert(collected.some(c => c.id === chest.id), 'Adjacent match must collect W2 chest');
    Chests.schedule(g, result.stepList);
    Chests.reveal(g, collected);
    Chests.tick(g, 0);
    assert.equal(chest.stage, 'open');
    Chests.tick(g, Timing.open);
    Chests.tick(g, Timing.rewardFly);
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
  console.log('PASS: W2 grant, all fields, board landing, adjacent match collection, actual selection, deduplication, restart, opening reward independence and test exclusion.');
} finally {
  fixture.restore();
}
