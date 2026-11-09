/** 验证历练升金、开局三选一、重复发放保护，以及新手引导与原有宝箱的兼容。 */
const assert = require('assert');
// 复用离线画布和内存存储，测试不接触真实账号存档。
const fixture = require('./moving-battle-fixture.cjs');
const Main = require('../js/game/main.js');
const CONFIG = require('../js/config.js');
const { Meta } = require('../js/meta.js');
const Opening = require('../js/relics/opening-pick.js');
const Art = require('../js/config/relic-art.js');
const ID = 's_sr_cm_exp';

function game(star, tutorialDone = true) {
  const g = new Main();
  g.meta = new Meta();
  g.meta.relicStars[ID] = star;
  g.meta.tutorial = { version: 1, done: tutorialDone };
  g.menuStage = 'ancient';
  g.saveData = null;
  g.save.save = () => {};
  g.toast = () => {};
  g.newRun(false);
  return g;
}

try {
  const def = CONFIG.relicRunDef(ID);
  assert.equal(CONFIG.relicRarity(ID), 'ssr');
  assert.deepEqual(CONFIG.RELIC_RUN.common.filter(d => CONFIG.relicRarity(d.id) === 'ssr').map(d => d.id), [ID]);
  assert(Art.cards[ID].frame.endsWith('/gold.png'));
  assert(!def.star3.includes('自动拾取'));
  assert.deepEqual([1, 2, 3].map(star => CONFIG.relicNum(ID, star)), [15, 25, 35]);
  assert.deepEqual([1, 2, 3].map(star => CONFIG.relicValue(ID, 'openingPick', star)), [0, 0, 1]);

  for (const star of [0, 1, 2]) {
    const g = game(star);
    g.enterBattle();
    assert.equal(g.pendingRelicPicks.length, 0, 'Only three stars grant an opening reward');
  }

  const g = game(3);
  g.enterBattle();
  assert.equal(g.run.slotOrder.length, 0);
  assert.equal(g.pendingRelicPicks.length, 1);
  assert.equal(g.pendingRelicPicks[0].candidates.length, 3);
  assert.equal(new Set(g.pendingRelicPicks[0].candidates.map(c => c.id)).size, 3);
  assert(g.pendingRelicPicks[0].candidates.every(c => CONFIG.relicRarity(c.id) !== 'ur'));
  assert.equal(Opening.queue(g), false);
  assert.equal(g.pendingRelicPicks.length, 1);
  const before = { waveTime: g.waveTime, enemies: g.enemies.length };
  g.update(0.016);
  assert.equal(g.state, 'relicpick');
  assert.equal(g.waveTime, before.waveTime, 'Opening choice pauses wave simulation');
  assert.equal(g.enemies.length, before.enemies);
  assert(g.relicPick.opening);

  // 开局池能够抽到塔系卡；普通零塔宝箱仍然只取通用池。
  const random = Math.random;
  Math.random = () => 0;
  assert(g._rollRelicCandidates(false, { opening: true }).every(c => c.tint === 'fire'));
  assert(g._rollRelicCandidates(false).every(c => c.tint === 'common'));
  g.run.gold = 10000;
  assert(g.rerollRelicPick());
  assert(g.relicPick.opening);
  assert(g.relicPick.candidates.every(c => c.tint === 'fire'));
  Math.random = random;
  const selected = g.relicPick.candidates[0];
  g.relicPickChoice(0);
  assert.equal(g.state, 'fighting');
  assert.equal(g.run.runRelic[selected.id], 1);
  assert.equal(g.meta.starOf(selected.id), 1, 'Selected relic follows normal codex unlocking');
  assert.equal(g.pendingRelicPicks.length, 0);
  assert.equal(Opening.queue(g), false);
  g.relicPickChoice(0);
  assert.equal(g.run.runRelic[selected.id], 1, 'Repeated taps cannot award twice');
  g.newRun(true);
  assert.equal(g.pendingRelicPicks.length, 1, 'A fresh run grants its own opening choice');

  const teaching = game(3, false);
  teaching.enterBattle();
  assert.equal(teaching._tutorial, null, 'Tutorial must not cover the opening choice');
  teaching.update(0.016);
  assert.equal(teaching.state, 'relicpick');
  teaching.relicPickChoice(0);
  assert.equal(teaching._tutorial.step, 1, 'Tutorial begins after the reward is selected');

  const wall = game(3);
  wall.enterBattle();
  wall.update(0.016);
  wall.meta.relicStars.s_sr_cm_wall = 2;
  wall.relicPick.candidates = [{ ...CONFIG.relicRunDef('s_sr_cm_wall'), run: true, tint: 'common' }];
  wall.relicPickChoice(0);
  assert.equal(wall.run.lineMaxHp, Math.round(CONFIG.LINE.hp * 1.30));
  assert.equal(wall.run.lineHp, wall.run.lineMaxHp);

  const excluded = game(3);
  excluded.menuStage = 'test';
  assert.equal(Opening.queue(excluded), false);
  console.log('PASS: unique common SSR, gold frame, retained experience, opening pool, pause, reroll, single grant, restart, tutorial and wall bonus.');
} finally {
  fixture.restore();
}
