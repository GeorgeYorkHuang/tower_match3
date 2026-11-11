/** 前置三章的独立配置。数值为原型初值，不覆盖正式战场或Boss配置。 */
'use strict';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const order = ['prologue_awakening', 'prologue_trial', 'prologue_gate'];
function chapter(index, name, maxWave, colors, towerSlots, features, enemyMultipliers, bossProfile, expNeedMultiplier, enemyCurve) {
  return {
    id: order[index], name, isPrologue: true, maxWave, colors, towerSlots,
    // ID 保持不变；显示名称与图标调整不重置已有通关记录。
    chapterTitle: ['第一章', '第二章', '第三章'][index],
    icon: `assets/images/interface/home/icon_chapter_${index + 1}_v1.png`,
    features: { match4: true, match5: false, chain: true, talents: false, ...features },
    enemyMultipliers, bossProfile, expNeedMultiplier, enemyCurve,
    rewards: {
      formalMilestones: false, deepChests: false, redFragments: false,
      homeChests: false, randomShards: false,
      firstClearGold: null, // 奖励金额尚未定稿，不能擅自写入奖励。
      firstClearRed: index === 2,
    },
  };
}

module.exports = freeze({
  version: 1,
  // 待候选门控、Boss、独立结算与章节UI全部接好后再开放，防止半成品章节误发正式奖励。
  releaseReady: true,
  order,
  chapters: {
    [order[0]]: chapter(0, '圣庭初醒', 10, ['red', 'blue', 'green'], 2,
      { skills: false, branches: false, globalSkills: false, battleShop: false, relics: false },
      { count: 0.55, hp: 0.45, attack: 0.40, speed: 0.80, bossHp: 0.35, bossAttack: 0.35, wallHp: 1.50, eliteMax: 0 },
      { final: 'miniboss_bell', noSummons: true }, 0.65,
      { plateauWave: 10, runnerEvery: 4, tankEvery: 10, tankStartWave: 4,
        hp: {normal:[110,150],runner:[70,100],tank:[220,280],elite:[300,360],boss:[700,1100]},
        armor:[0,0.04] }),
    [order[1]]: chapter(1, '圣庭之门', 20, ['red', 'blue', 'green', 'orange'], 3,
      { skills: true, branches: false, globalSkills: true, battleShop: true, relics: false },
      { count: 0.65, hp: 0.55, attack: 0.50, speed: 0.85, bossHp: 0.45, bossAttack: 0.45, wallHp: 1.40, eliteMax: 1 },
      { 20: 'altar_rosea', summonCount: 0.5, scaleShield: true,
        overrides: {hp:9000,armor:0.08,shieldPerLayer:400,shieldPeriod:18} }, 0.75,
      { plateauWave: 15, runnerEvery: 4, tankEvery: 7, tankStartWave: 4,
        hp: {normal:[130,280],runner:[85,180],tank:[260,600],elite:[350,700],boss:[1000,1800]},
        armor:[0,0.08] }),
    [order[2]]: chapter(2, '圣庭试炼', 40, ['red', 'blue', 'green', 'orange', 'yellow'], 4,
      { skills: true, branches: true, globalSkills: true, battleShop: true, relics: true, relicStartWave: 5 },
      { count: 0.75, hp: 0.65, attack: 0.60, speed: 0.90, bossHp: 0.55, bossAttack: 0.55, wallHp: 1.25, eliteMax: 2 },
      { 20: 'altar_rosea', 40: 'altar_galvin', summonCount: 0.5, scaleShield: true, twinTimeoutHeal: false, attackSlow: 0.5 }, 0.85),
  },
});
