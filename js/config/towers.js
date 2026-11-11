// 塔基础定义与成长规则。对局等级、能量和冷却留在实例中。
'use strict';
module.exports = {
  TOWER_SLOTS: 4,               // 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）

  EXP: {
    perCell: 2,                              // 每个消除方块的基础经验（三消少量）
    shape: { '3': 1.0, '4': 1.5, L5: 1.5, '5': 2.0, '6+': 2.5 }, // 形状倍率（3连/直4/L5/直5/6+）
    ...require('./experience.js'), // 三段整体经验曲线 + 逐波击杀经验增长
    towerMaxLevel: 13,                     // Lv1 建塔 + 3 个技能槽 ×（激活 1 次 + 分支升级 3 次）
    // 击杀经验（打怪为主渠道；精英/Boss 更多；三消经验=每块 2×块数×形状倍率，明显低于击杀）
    kill: { normal: 15, runner: 10, tank: 22, elite: 30, boss: 90 },
    waveBonus: 5,                            // 波末全塔额外经验（少量）
  },

  TOWERS: {
    // 用DPS存储：单发攻击=baseDps×atkInterval，每级单发成长=perLv×atkInterval。
    // 本次直接调整基础单发攻击，保留每级单发成长；火塔加速后同步换算DPS。attackCost独立定价。
    fire:      { color: 'red',    baseDps: 31.82,  perLv: 11.1, range: 830, atkInterval: 1 / 0.74, attackCost: 35 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 43 伤害/发，每级+15；0.74 发/秒
    ice:       { color: 'blue',   baseDps: 27.104, perLv: 7.68, range: 760, atkInterval: 1 / 0.88, attackCost: 24 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 30.8 伤害/发，0.88 发/秒
    poison:    { color: 'green',  baseDps: 29.088, perLv: 8.64, range: 800, atkInterval: 1 / 1.44, attackCost: 16 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 20.2 伤害/发，1.44 发/秒
    electric:  { color: 'yellow', baseDps: 30.4,   perLv: 8.64, range: 840, atkInterval: 1 / 0.8,  attackCost: 30 / 60, shot: { kind: 'bolt',  dur: 0.5  } }, // 38 伤害/发，0.8 发/秒
    boomerang: { color: 'purple', baseDps: 19.152, perLv: 8.64, range: 880, atkInterval: 1 / 0.56, attackCost: 26 / 60, shot: { kind: 'arc',   dur: 2.4  } }, // 34.2 伤害/发，0.56 发/秒
    cannon:    { color: 'orange', baseDps: 34.56,  perLv: 9.6,  range: 930, atkInterval: 1 / 0.48, attackCost: 60 / 60, shot: { kind: 'mortar', dur: 1.5  } }, // 72 伤害/发，0.48 发/秒
  },

};
