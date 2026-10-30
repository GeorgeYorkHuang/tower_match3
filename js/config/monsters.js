// 怪物定义与波次规则。实例血量、位置、状态不得写入本表。
'use strict';
module.exports = {
  WAVE: {
    seconds: 40,                // 波时长
    matchesPerWave: 5,          // 操作模型：每波有效消除次数
    matchDist: { '3': 0.70, '4': 0.20, L5: 0.05, '5': 0.05 },  // 3连/直4/L5/直5 消占比
    maxWave: 9999,              // v1.16.76 无尽化：移除 50 波硬上限（撤离点承担终点，收益 40 波后递减）
  },

  ENEMY: {
    // v1.17 怪物代际重构（已确认 v2）：取消血量成长曲线，每 5 波一代新怪、新旧代按比例混合替换
    // levels[] 下标 0 = Lv1；hp/atk 为单只数值；spd 为设计移速（代码按 /1.5 归一化为基准系数）；armor 为减伤
    levels: [
      { type: 'normal', hp: 250,  atk: 8,  spd: 1.5, armor: 0.00 }, // Lv1 普通 波1-4
      { type: 'runner', hp: 150,  atk: 4,  spd: 2.7, armor: 0.00 }, // Lv2 快速 波3-10
      { type: 'tank',   hp: 700,  atk: 18, spd: 0.9, armor: 0.04 }, // Lv3 重坦 波4-14
      { type: 'normal', hp: 500,  atk: 10, spd: 1.6, armor: 0.08 }, // Lv4 普通 波9-19
      { type: 'runner', hp: 300,  atk: 5,  spd: 2.9, armor: 0.12 }, // Lv5 快速 波14-24
      { type: 'tank',   hp: 1400, atk: 22, spd: 1.0, armor: 0.16 }, // Lv6 重坦 波19-29
      { type: 'normal', hp: 1000, atk: 14, spd: 1.7, armor: 0.20 }, // Lv7 普通 波24-34
      { type: 'runner', hp: 600,  atk: 7,  spd: 3.1, armor: 0.24 }, // Lv8 快速 波29-39
      { type: 'tank', hp: 2380, atk: 28, spd: 1.06, armor: 0.20 }, // Lv9
      { type: 'normal', hp: 1700, atk: 18, spd: 1.80, armor: 0.24 }, // Lv10
      { type: 'runner', hp: 1020, atk: 9, spd: 3.29, armor: 0.28 }, // Lv11
      { type: 'tank', hp: 3700, atk: 36, spd: 1.12, armor: 0.32 }, // Lv12
      { type: 'normal', hp: 2650, atk: 24, spd: 1.91, armor: 0.36 }, // Lv13
      { type: 'runner', hp: 1560, atk: 12, spd: 3.60, armor: 0.40 }, // Lv14
    ],
    /** 超界等级（40 波后 Lv9+）：按 普→快→重 循环，同类型上一代 ×1.7 血量 / ×1.25 攻击 / 减伤 +4% */
    levelOf(n) {
      const i = n - 1;
      if (i < this.levels.length) return this.levels[i];
      const prev = this.levelOf(n - 3);
      return { type: prev.type, hp: Math.round(prev.hp * 1.7), atk: Math.round(prev.atk * 1.25),
               spd: Math.min(3.6, +(prev.spd * 1.06).toFixed(2)), armor: Math.min(0.6, prev.armor + 0.04) };
    },
    /** 每波代际占比（等级权重数组，投放时取模循环；已确认 v2 表格：Lv1 波1-4、Lv2 波3-10、Lv3 波4-14、Lv4 波9-19……） */
    levelMix(w) {
      if (w <= 2) return [1];
      if (w <= 60) return this._mixTbl[w] || [9, 9, 9, 10, 10];
      const base = [9, 9, 9, 10, 10];      // 40 波后：沿用 40 波比例，代际整体上移（每 5 波 +1 代）
      const shift = Math.floor((w - 41) / 5);
      return base.map((lv) => lv + shift);
    },
    _mixTbl: {
      41: [9,9,9,10,11],
      42: [9,9,10,10,11],
      43: [9,10,10,10,11],
      44: [9,10,10,11,11],
      45: [10,10,10,11,11],
      46: [10,10,11,11,11],
      47: [10,10,11,11,12],
      48: [10,11,11,11,12],
      49: [10,11,11,12,12],
      50: [11,11,11,12,12],
      51: [11,11,12,12,12],
      52: [11,11,12,12,13],
      53: [11,12,12,12,13],
      54: [11,12,12,13,13],
      55: [12,12,12,13,13],
      56: [12,12,13,13,13],
      57: [12,12,13,13,14],
      58: [12,13,13,13,14],
      59: [12,13,13,14,14],
      60: [13,13,13,14,14],

      3: [1, 1, 1, 1, 2], 4: [1, 1, 2, 2, 3], 5: [2, 2, 2, 3, 3],
      6: [2, 2, 3, 3, 3], 7: [2, 2, 3, 3, 3], 8: [2, 2, 3, 3, 3], 9: [2, 3, 3, 3, 4], 10: [2, 3, 3, 4, 4],
      11: [3, 3, 4, 4, 4], 12: [3, 4, 4, 4, 4], 13: [3, 4, 4, 4, 4], 14: [3, 4, 4, 4, 5], 15: [4, 4, 4, 5, 5],
      16: [4, 4, 5, 5, 5], 17: [4, 5, 5, 5, 5], 18: [4, 5, 5, 5, 5], 19: [4, 5, 5, 5, 6], 20: [4, 5, 5, 6, 6],
      21: [5, 5, 6, 6, 6], 22: [5, 6, 6, 6, 6], 23: [5, 6, 6, 6, 6], 24: [5, 6, 6, 6, 7], 25: [6, 6, 6, 7, 7],
      26: [6, 6, 7, 7, 7], 27: [6, 7, 7, 7, 7], 28: [6, 7, 7, 7, 7], 29: [6, 7, 7, 7, 8], 30: [6, 7, 7, 8, 8],
      31: [7, 7, 8, 8, 8], 32: [7, 8, 8, 8, 8], 33: [7, 8, 8, 8, 8], 34: [7, 8, 8, 8, 9], 35: [8, 8, 8, 9, 9],
      36: [8, 8, 9, 9, 9], 37: [8, 9, 9, 9, 9], 38: [8, 9, 9, 9, 9], 39: [8, 9, 9, 9, 10], 40: [9, 9, 9, 10, 10],
    },
    /** 本波主等级（占比最高代；精英/Boss 属性基准），并列取较新代 */
    mainLevel(w) {
      const mix = this.levelMix(w);
      const cnt = {};
      mix.forEach((lv) => { cnt[lv] = (cnt[lv] || 0) + 1; });
      let best = 1, bestN = 0;
      Object.keys(cnt).forEach((k) => { const n = cnt[k], lv = +k;
        if (n > bestN || (n === bestN && lv > best)) { best = lv; bestN = n; } });
      return best;
    },
    /** 本波怪物总血量（结算口径，与 wave.js 生成一致；curseMult = 1.15^诅咒层数） */
    waveTotalHp(w, curseMult) {
      const count = this.countForWave(w);
      const hasBoss = w >= 5 && w % this.bossEvery === 0;
      const eliteCount = Math.floor(count / 20);
      const normalCount = count - (hasBoss ? 1 : 0) - eliteCount;
      const mix = this.levelMix(w);
      const main = this.mainLevel(w);
      let hp = 0;
      for (let i = 0; i < normalCount; i++) hp += this.levelOf(mix[i % mix.length]).hp;
      hp += this.levelOf(main).hp * this.eliteHpMult * eliteCount;
      if (hasBoss) hp += this.levelOf(main).hp * this.bossHpMult;
      return hp * (curseMult || 1);
    },
    countForWave(w) { return 15 + Math.floor((w - 1) / 2) + Math.floor(w / 5) * 5; },
    countPerWave: '15 + floor((wave-1)/2) + floor(wave/5)*5',          // 每波数量（实现时按表达式解析）
    bossEvery: 5,                          // 每 5 波 1 只 Boss（5,10,15...），掉宝箱
    bossHpMult: 8,                         // Boss 血量 = 主等级 ×8
    bossAtkMult: 11.25,                    // Boss 攻击 = 主等级 ×11.25
    bossArmor: 0.25,                       // Boss 自带 25% 减伤
    elitePerWave: 1,                       // 每波固定 1 只精英怪（概率掉落圣物）
    eliteHpMult: 4,                        // 精英血量 = 主等级 ×4
    eliteAtkMult: 5,                       // 精英攻击 = 主等级 ×5
    eliteArmor: 0.10,                      // 精英自带 10% 减伤
    // 怪物种类（渲染/血条/速度系数基准；v1.17 血量/移速由 levels 直接定值，不再乘 hpMult/spdMult）
    types: {
      normal: { hpMult: 1.0, spdMult: 1.0 },
      runner: { hpMult: 0.6, spdMult: 1.8 },
      tank:   { hpMult: 2.8, spdMult: 0.6 },
      elite:  { hpMult: 4.0, spdMult: 0.85, armor: 0.10 },  // v1.16.11 精英强化：血量 3→4 倍、自带 10% 减伤
    },
    // 攻城攻击兜底（combat.js initEnemyState 使用；v1.17 生成值来自 levels.atk × 精英/Boss 倍率）
    attack: { normal: 8, runner: 4, tank: 18, boss: 90, elite: 40 },
    attackInterval: { normal: 1.0, runner: 0.7, tank: 1.6, boss: 1.2, elite: 1.1 }, // 攻击间隔（秒）
    speed: { slow: 0.9, normal: 1.5, fast: 2.1 },  // 速度三档（v1.12 调试：整体提升 50%），快怪血量减半
  },

};
