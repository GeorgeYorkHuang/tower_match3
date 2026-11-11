/** 城墙归零不能被波末回血复活；真实战斗停在当前波，广告复活保留原 Boss。 */
'use strict';
const assert = require('assert');
const fixture = require('./moving-battle-fixture.cjs');
const Main = require('../js/game/main.js');
const { Meta } = require('../js/meta.js');
const WaveRelics = require('../js/relics/wave-hooks.js');
const Ads = require('../js/game/flows/ad-actions.js');
const Video = require('../js/ads/rewarded-video.js');

function create(field, wave, regenStar, wallStar = 0) {
  const g = new Main();
  g.meta = new Meta();
  g.meta.tutorial.done = true;
  g.meta.relicStars.s_sr_cm_regen = regenStar;
  g.meta.relicStars.s_sr_cm_wall = wallStar;
  g.menuStage = field;
  g.saveData = null;
  g.save.save = () => {};
  g.toast = () => {};
  g.newRun(true);
  g.run.runRelic.s_sr_cm_regen = regenStar ? 1 : 0;
  g.run.runRelic.s_sr_cm_wall = wallStar ? 1 : 0;
  if (wave !== 1) {
    g.run.wave = wave - 1;
    g.wave.start();
  }
  return g;
}

async function main() {
  const originalShow = Video.show;
  try {
    // 走原生 update→waveEnd→finishRun，不使用采集器的「首次破防即停止」保护。
    for (const field of ['ancient', 'lava', 'frost']) {
      for (const wave of [1, 20, 40, 60]) {
        for (const regen of [0, 1, 2, 3]) {
          for (const wall of [0, 3]) {
            const g = create(field, wave, regen, wall);
            g.wave.spawnOne();
            const boss = g.run.bossEnemy;
            const locked = g.run.bossLock;
            g.run.lineHp = regen % 2 ? -1 : 0;
            g.run.broken = true;
            g.update(1 / 60);
            const label = `${field}/W${wave}/自愈${regen}/磐石${wall}`;
            assert(g.run.lineHp <= 0, label + '：波末不能回血复活');
            assert.equal(g.run.broken, true, label);
            assert.equal(g.state, 'reviveOffer', label + '：进入破防复活流程');
            assert.equal(g.run.wave, wave, label + '：不得跳波');
            assert.equal(g.run.bossLock, locked, label + '：不得解锁 Boss');
            assert.equal(g.run.bossEnemy, boss, label + '：不得更换 Boss');
            assert(!g.run.finalVictory, label + '：不得误判通关');
            if (boss) assert(g.enemies.includes(boss) && boss.hp > 0, label);
          }
        }
      }
    }

    // 血量仍为正时保留正常回血、上限截断和已经赚取的波末银币。
    for (const [hp, regen, wall, expected] of [
      [100, 1, 0, 140], [100, 2, 0, 160], [100, 3, 0, 260],
      [100, 0, 3, 200], [100, 3, 3, 360], [1999, 3, 3, 2000],
      [0, 3, 3, 0], [-10, 3, 3, -10],
    ]) {
      const g = create('ancient', 1, regen, wall);
      g.run.lineMaxHp = 2000;
      g.run.lineHp = hp;
      g.run._waveGold = 37;
      const before = g.run.gold;
      WaveRelics.endWave(g.run);
      assert.equal(g.run.lineHp, expected, '回血不改变存活条件和上限');
      assert.equal(g.run.gold - before, 37, '破防不吞掉已赚取银币');
    }

    // 只有明确成功的广告复活才恢复城墙；原 Boss 和未投放计划保持不变。
    // 测试中替代广告返回值，不配置广告位，也不连接真实广告平台。
    const revived = create('ancient', 20, 3, 3);
    revived.wave.spawnOne();
    const boss = revived.run.bossEnemy;
    const plan = revived.wave.plan;
    revived.run.lineHp = 0;
    revived.run.broken = true;
    revived.update(1 / 60);
    Video.show = async () => ({ ok: false, reason: 'incomplete' });
    assert.equal(await Ads.watch(revived, 'revive'), false);
    assert.equal(revived.run.lineHp, 0);
    assert.equal(revived.state, 'reviveOffer');
    Video.show = async () => ({ ok: true });
    assert.equal(await Ads.watch(revived, 'revive'), true);
    assert(revived.run.lineHp > 0 && !revived.run.broken);
    assert.equal(revived.state, 'fighting');
    assert.equal(revived.run.wave, 20);
    assert.equal(revived.run.bossEnemy, boss);
    assert.equal(revived.wave.plan, plan);
    assert.equal(revived.run.bossLock, true);
    revived.update(1 / 60);
    assert.equal(revived.run.wave, 20, '复活后继续原 Boss 战');
    revived.run.lineHp = 0;
    revived.run.broken = true;
    revived.update(1 / 60);
    assert.equal(revived.state, 'gameover', '同局第二次破防正常结算');

    const declined = create('ancient', 20, 3);
    declined.run.lineHp = 0;
    declined.run.broken = true;
    declined.update(1 / 60);
    declined.run.adReviveDeclined = true;
    declined.finishRun(false);
    assert.equal(declined.state, 'gameover', '放弃复活正常结算');

    console.log('PASS: 96 native breach cases, living-wall regen and cap, silver preservation, incomplete/successful ad revival, same Boss continuation, second breach and decline.');
  } finally {
    Video.show = originalShow;
    fixture.restore();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
