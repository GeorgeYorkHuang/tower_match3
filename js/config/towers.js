// 塔基础定义与成长规则。对局等级、能量和冷却留在实例中。
'use strict';
module.exports = {
  TOWER_SLOTS: 4,               // 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）

  EXP: {
    perCell: 2,                              // 每个消除方块的基础经验（三消少量）
    shape: { '3': 1.0, '4': 1.5, L5: 1.5, '5': 2.0, '6+': 2.5 }, // 形状倍率（3连/直4/L5/直5/6+）
    base: 35, growth: 1.25,                  // v1.16.89 平滑升级曲线：exp(L) = 35 × 1.25^(L-1)（原 30×1.4 后期过陡）
    towerMaxLevel: 20,
    // 击杀经验（打怪为主渠道；精英/Boss 更多；三消经验=每块 2×块数×形状倍率，明显低于击杀）
    kill: { normal: 15, runner: 10, tank: 22, elite: 30, boss: 90 },
    waveBonus: 5,                            // 波末全塔额外经验（少量）
  },

  TOWERS: {
    fire:      { color: 'red',    baseDps: 32, perLv: 10, range: 830, atkInterval: 0.9,  attackCost: 0.5, shot: { kind: 'line',  dur: 1.0  } }, // 火球弹道（直线慢速）；v1.13.18 平衡：纯输出塔上调
    ice:       { color: 'blue',   baseDps: 20, perLv: 8,  range: 760, atkInterval: 1.1,  attackCost: 0.4, shot: { kind: 'line',  dur: 1.0  } }, // 冰锥弹道
    poison:    { color: 'green',  baseDps: 25, perLv: 9,  range: 800, atkInterval: 1.0,  attackCost: 0.4, shot: { kind: 'line',  dur: 1.0  } }, // 毒液弹道
    electric:  { color: 'yellow', baseDps: 23, perLv: 9,  range: 700, atkInterval: 1.0,  attackCost: 0.4, shot: { kind: 'bolt',  dur: 0.5  } }, // 闪电折线；v1.13.18 平衡：控制型塔下调纯伤、上调成长
    boomerang: { color: 'purple', baseDps: 22, perLv: 9,  range: 880, atkInterval: 1.3,  attackCost: 0.5, shot: { kind: 'arc',   dur: 2.4  } }, // 回旋弧线（v1.7 慢一倍 + 接镖再投）
    cannon:    { color: 'orange', baseDps: 38, perLv: 10, range: 930, atkInterval: 1.8,  attackCost: 1.1, shot: { kind: 'mortar', dur: 1.5  } }, // 抛物线炮弹
  },

};
