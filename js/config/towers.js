// 塔基础定义与成长规则。对局等级、能量和冷却留在实例中。
'use strict';
module.exports = {
  TOWER_SLOTS: 4,               // 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）

  EXP: {
    perCell: 2,                              // 每个消除方块的基础经验（三消少量）
    shape: { '3': 1.0, '4': 1.5, L5: 1.5, '5': 2.0, '6+': 2.5 }, // 形状倍率（3连/直4/L5/直5/6+）
    base: 35, growth: 1.25,                  // v1.16.89 平滑升级曲线：exp(L) = 35 × 1.25^(L-1)（原 30×1.4 后期过陡）
    towerMaxLevel: 13,                     // Lv1 建塔 + 3 个技能槽 ×（激活 1 次 + 分支升级 3 次）
    // 击杀经验（打怪为主渠道；精英/Boss 更多；三消经验=每块 2×块数×形状倍率，明显低于击杀）
    kill: { normal: 15, runner: 10, tank: 22, elite: 30, boss: 90 },
    waveBonus: 5,                            // 波末全塔额外经验（少量）
  },

  TOWERS: {
    fire:      { color: 'red',    baseDps: 22.4,  perLv: 8,   range: 830, atkInterval: 1 / 0.64, attackCost: 35 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 35 伤害/发，0.64 发/秒（攻速 -20%）
    ice:       { color: 'blue',   baseDps: 21.12, perLv: 6.4, range: 760, atkInterval: 1 / 0.88, attackCost: 24 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 24 伤害/发，0.88 发/秒（攻速 -20%）
    poison:    { color: 'green',  baseDps: 23.04, perLv: 7.2, range: 800, atkInterval: 1 / 1.44, attackCost: 16 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 16 伤害/发，1.44 发/秒（攻速 -20%）
    electric:  { color: 'yellow', baseDps: 24,    perLv: 7.2, range: 840, atkInterval: 1 / 0.8,  attackCost: 30 / 60, shot: { kind: 'bolt',  dur: 0.5  } }, // 30 伤害/发，0.8 发/秒（攻速 -20%）
    boomerang: { color: 'purple', baseDps: 14.56, perLv: 7.2, range: 880, atkInterval: 1 / 0.56, attackCost: 26 / 60, shot: { kind: 'arc',   dur: 2.4  } }, // 26 伤害/发，0.56 发/秒（攻速 -20%）
    cannon:    { color: 'orange', baseDps: 28.8,  perLv: 8,   range: 930, atkInterval: 1 / 0.48, attackCost: 60 / 60, shot: { kind: 'mortar', dur: 1.5  } }, // 60 伤害/发，0.48 发/秒（攻速 -20%）
  },

};
