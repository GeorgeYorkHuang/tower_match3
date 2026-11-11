/** P2回归：真实三选一队列、跨塔选择容量、功能关闭边界与分章教学进度。 */
'use strict';
const assert = require('assert');
const fixture = require('./moving-battle-fixture.cjs');
const Main = require('../js/game/main.js');
const { Meta } = require('../js/meta.js');
const PLAN = require('../js/config/prologue.js');
const CONFIG = require('../js/config.js');
const Tutorial = require('../js/game/tutorial.js');
const Guide = require('../js/game/prologue-tutorial.js');
const Shop = require('../js/economy/battle-shop.js');
const Global = require('../js/global-skills.js');
const Opening = require('../js/relics/opening-pick.js');

function game(id, colors = []) {
  const g = new Main();
  g.meta = new Meta(); g.menuStage = id;
  g.saveData = null; g.save.save = () => true; g.toast = () => {};
  g.newRun(false); g.state = 'fighting'; g.run.wave = 1;
  for (const color of colors) g.run.applyMatch(color, '3', 3);
  return g;
}
function select(g, choose = list => list[0]) {
  const group = g.pickQueue[g.pickIndex];
  assert(group && group.candidates.length);
  const card = choose(group.candidates);
  assert(g.run.applyChoice(group.tower, card).ok, '展示的候选必须能选择：' + JSON.stringify(card));
  Tutorial.chosen(g, card); g.nextPick();
  return card;
}

try {
  const first = game(PLAN.order[0], ['red', 'blue']);
  const run = first.run, tower = run.effects.tower('fire');
  assert.equal(run.gainExp(1e6), 0);
  tower.pending = 1;
  assert(!first.flushUpgrades()); assert.equal(run.effects.pendingTotal(), 0);
  assert.equal(run.expLevel, 0);
  assert(!run.applyChoice('fire', { name: tower.pool[0].name, type: 'skill', fromTower: 'fire' }).ok);
  run.gold = 1e6; const gold = run.gold;
  assert.equal(Shop.buy(run, CONFIG.STORE.items[0].id).reason, 'locked');
  assert.equal(run.gold, gold);
  run.shuffleAmmo = 90; run.freeShuffle = 1;
  assert(!first.combat.castGlobal('shuffle')); assert.equal(run.shuffleAmmo, 90); assert.equal(run.freeShuffle, 1);
  assert(!Global.cast(first.combat, 'forge')); assert(!run.gsState.forge);
  assert.deepEqual(first._rollRelicCandidates(false), []);
  first.spawnRelicPick(); assert.equal(first.pendingRelicPicks.length, 0);
  first.meta.relicStars.s_sr_cm_exp = 3;
  assert(!Opening.queue(first));
  const ctx = wx.createCanvas().getContext('2d');
  first.renderer.funcBar(ctx, first.sceneState());
  assert(!first.renderer.funcHits.some(hit => hit.key === 'shop'));
  for (const id of PLAN.order) {
    const g = game(id);
    assert.equal(g.run.board.hooks.onMatch5(), null);
  }

  // 多种跨塔选择顺序，覆盖提前生成队列中同一技能重复出现的风险。
  let choices = 0;
  for (let seed = 0; seed < 30; seed++) {
    const g = game(PLAN.order[1], ['orange', 'red', 'blue']);
    g.run.gainExp(1e6);
    assert.equal(g.run.effects.pendingTotal(), 9);
    assert(g.flushUpgrades());
    let count = 0;
    while (g.state === 'picking') {
      assert(count++ < 10, '九次激活后必须退出三选一');
      const card = select(g, list => {
        assert(list.every(item => item.type === 'skill'));
        return list.find(item => item.fromTower === ['cannon', 'fire', 'ice'][seed % 3]) || list[seed % list.length];
      });
      assert.equal(card.type, 'skill'); choices++;
    }
    assert.equal(count, 9); assert.equal(g.run.expLevel, 9);
    assert.equal(g.run.effects.pendingTotal(), 0);
    assert.equal(g.run.effects.choiceCapacity(g.run.slotOrder), 0);
    for (const key of g.run.slotOrder) {
      const t = g.run.effects.tower(key);
      assert.equal(t.activeNames.length, 3);
      assert(t.pool.every(skill => Object.values(skill.branches).every(value => value === 0)));
      assert.deepEqual(t._choices(), []);
      const old = { name: t.activeNames[0], type: 'skill', fromTower: key };
      assert(!g.run.applyChoice(key, old).ok);
      assert(!g.run.applyChoice(key, { ...old, type: 'branch', branch: 'A' }).ok);
    }
    const exp = g.run.exp, level = g.run.expLevel;
    assert.equal(g.run.gainExp(100), 0);
    assert.equal(g.run.expLevel, level); assert.equal(g.run.exp, exp + 100);
    assert(!g.flushUpgrades());
  }
  const staged = game(PLAN.order[1], ['red']);
  staged.run.gainExp(1e6); assert.equal(staged.run.effects.pendingTotal(), 3);
  staged.flushUpgrades(); while (staged.state === 'picking') select(staged);
  staged.run.applyMatch('orange', '3', 3); staged.run.gainExp(1);
  assert.equal(staged.run.effects.pendingTotal(), 3, '新塔加入后还能使用保留经验');
  const auto = game(PLAN.order[1], ['orange', 'red', 'blue']);
  auto.run.gainExp(1e6);
  assert.equal(auto.run.effects.settleAuto().activated, 9);

  // 第一章不受旧六步遮罩阻塞；提示按波次开放，不跳到技能/全局技能步骤。
  const a = game(PLAN.order[0]);
  Tutorial.begin(a); assert.equal(a._tutorial, null);
  assert.equal(Tutorial.tick(a), false);
  assert.equal(a._prologueTutorial.current.id, 'match');
  assert(Tutorial.allowSwap(a, 0, 0, 0, 1));
  a.run.applyMatch('red', '3', 3);
  Tutorial.swapped(a, { matches: [{ shape: '3' }] });
  Tutorial.tick(a); assert.equal(a._prologueTutorial.current.id, 'tower');
  Tutorial.tap(a, { x: 60, y: 300 });
  a.run.wave = 2; Tutorial.tick(a);
  a.run.applyMatch('blue', '3', 3); Tutorial.tick(a);
  a.run.wave = 3; Tutorial.tick(a);
  Tutorial.swapped(a, { matches: [{ shape: '3' }], settled: [{ gotTower: false, ammoGain: 6 }] });
  a.run.wave = 4; Tutorial.tick(a);
  Tutorial.swapped(a, { matches: [{ shape: '4' }] });
  Tutorial.tick(a); assert.equal(a._prologueTutorial.current, null);
  assert.equal(a.meta.prologue.tutorials[PLAN.order[0]].done.length, 5);
  assert.equal(a.run.effects.pendingTotal(), 0);

  const b = game(PLAN.order[1]);
  Tutorial.begin(b); Tutorial.tick(b);
  assert.equal(b.run.effects.pendingTotal(), 0, '无塔时不能发空教学奖励');
  b.run.applyMatch('red', '3', 3); Tutorial.tick(b);
  assert.equal(b.run.effects.pendingTotal(), 1);
  b.flushUpgrades(); select(b);
  b.run.wave = 3; b.run.applyMatch('blue', '3', 3); b.run.applyMatch('orange', '3', 3); Tutorial.tick(b);
  b.run.globalSlots[0] = 'forge'; b.run.wave = 5; Tutorial.tick(b);
  assert.equal(b.run.globalSlots[0], 'refill');
  assert(b.combat.castGlobal('shuffle'));
  assert.equal(b.run.globalSlots[0], 'forge', '教学释放后还原装配技能');
  b.run.wave = 8; Tutorial.tick(b); Guide.action(b, 'shop');
  assert.equal(b.meta.prologue.tutorials[PLAN.order[1]].done.length, 4);
  assert(Shop.buy(b.run, 'not-an-item').reason !== 'locked');

  const c = game(PLAN.order[2], ['red']);
  Tutorial.begin(c); Tutorial.tick(c); c.flushUpgrades();
  assert.equal(select(c).type, 'skill');
  Tutorial.tick(c); c.flushUpgrades();
  assert(c.pickQueue[c.pickIndex].candidates.every(card => card.type === 'branch'));
  assert.equal(select(c).type, 'branch');
  assert.equal(c.run._tutorialChoiceType, undefined);
  c.run.wave = 4; assert.deepEqual(c._rollRelicCandidates(false), []);
  c.run.wave = 5; Tutorial.tick(c);
  const candidates = c._rollRelicCandidates(false);
  assert(candidates.length);
  c.relicPick = { candidates }; c.relicPickChoice(0);
  assert(c.meta.prologue.tutorials[PLAN.order[2]].done.includes('relic'));
  c.run.wave = 10; Tutorial.tick(c); Tutorial.tap(c, { x: 60, y: 300 });
  const restored = Meta.fromJSON(c.meta.toJSON());
  assert.deepEqual(restored.prologue.tutorials, c.meta.prologue.tutorials);
  assert.equal(c.meta.tutorial.done, false, '前置教学不冒充旧版六步已完成');

  const skipped = game(PLAN.order[1], ['red']);
  Tutorial.begin(skipped); Tutorial.tick(skipped);
  Tutorial.tap(skipped, { x: 640, y: 245 });
  assert.equal(skipped._prologueTutorial, null);
  assert.equal(skipped.run._tutorialChoiceType, undefined);
  Tutorial.begin(skipped); assert.equal(skipped._prologueTutorial, null);
  const testing = game(PLAN.order[0]); testing.testProfile = true;
  const before = JSON.stringify(testing.meta.prologue);
  Tutorial.begin(testing); Tutorial.tick(testing);
  assert.equal(JSON.stringify(testing.meta.prologue), before);
  assert.equal(testing._prologueTutorial, null);
  console.log(`PASS P2: ${choices} native queued selections, nine-choice exhaustion, cross-tower/auto paths, feature guards and three chapter tutorials.`);
} finally { fixture.restore(); }
