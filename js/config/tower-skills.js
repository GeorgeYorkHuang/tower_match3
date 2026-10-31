// 技能分支行为数值。数组下标为分支等级0~3；单位沿用原实现。
module.exports = {
  fire: {
    '大火球': { mainDamage:1.1, radius:130, radiusPerBranch:0.30, splashDamage:0.48, damagePerBranch:0.20, ignitePerBranch:0.50 },
    '火柱': { period:10, damage:1.2, damagePerBranch:0.30, radius:120, radiusPerBranch:0.20, delay:0.6, effectDuration:2.4, emberDuration:3, emberDamagePerBranch:0.15 },
    '灼烧':   { baseStackCap:2, burstDamage:0.6, burst: [0, 0.15, 0.30, 0.50],      // B 燃尽：每跳爆炸概率
                trueFire: [0, 0.10, 0.20, 0.30],   // C 真火：每层灼烧目标受伤加成
                burnRadius: [0, 30, 60, 90] },     // B 燃尽：爆炸范围
    '点燃':   { baseProbability:0.20, learnedProbability:0.25, probabilityPerBranch:0.15, damagePerSecond:0.20, duration:3, minDuration:0.5, tickInterval:0.5, emberDmg: [0, 0.20, 0.40, 0.60],   // C 余烬：灼烧伤害加成
                heatTtl: [0, 2, 3, 4],             // B 炽热：灼烧时长
                emberTtlCut: [0, 0.5, 1, 1.5] },   // C 余烬：灼烧时长缩减
    '爆燃':   { deathProbability:0.40, baseRadius:80, baseDamage:0.96, tickBurstRadius:50, tickBurstDamage:0.30, radius: [0, 0.2, 0.4, 0.6],        // B 扩张：爆炸范围
                dmg: [0, 0.3, 0.6, 0.9] },         // A 爆裂：爆炸伤害
    '多重火球': { count:5, damage:0.44, hitRadius:45, fanStep:0.08, splitDamage:0.25, splitDurationRatio:0.8, splitHitRadius:30, condense: [0, 0.15, 0.30, 0.50], // B 凝火：火球增伤
                scatterSplit: [0, 3, 4, 5] },      // C 散射：分裂小火球数
    '烈焰墙': { period:15, width:180, height:45, impactDamage:0.50, duration:6, tickInterval:0.5, slowDuration:0.6, range: [0, 0.2, 0.4, 0.6],         // B 引燃：墙范围
                dmg: [0, 0.2, 0.4, 0.6],           // A 神火：墙伤害
                slow: [0, 0.1, 0.2, 0.3] },        // C 迟滞：墙内减速
    '火雨':   { period:12, baseRadius:140, waveDamage:0.24, baseWaves:3, waveGap:0.5, fallDuration:0.5, spawnWindow:0.1, radius: [0, 0.2, 0.4, 0.6],        // C 扩张：火雨圈范围
                segDmg: [0, 0.4, 0.8, 1.2] },      // B 猛烈：每段伤害
  },
  ice: {
    '寒霜':   { baseProbability:0.20, learnedProbability:0.25, probabilityPerBranch:0.15, baseSlow:0.30, duration:3, slowMult: [0, 0.1, 0.2, 0.3],      // C 深寒：减速幅度
                ttl: [0, 1, 2, 3] },               // B 凝结：冰缓时长
    '冰冻':   { shatterRadius:120, bossDurationRatio:0.6, baseProbability:0.20, baseDuration:2, prob: [0, 0.15, 0.30, 0.45],       // A 冻结：冰冻概率
                dur: [0, 1, 1.5, 2],               // B 深结：冻结时长
                shatter: [0, 0.30, 0.40, 0.50] },  // C 碎冰：击杀爆炸伤害
    '冰穿刺': { baseTargets:1, minProjection:20, coneLength:60, coneWidthRatio:1, pierceDmg: [0, 0.3, 0.6, 0.9],     // B 透射：穿透后伤害
                cone: [0, 0.3, 0.4, 0.5] },        // C 冰霜透射：身后扇形伤害
    '多重冰锥': { count:3, damage:0.55, damagePerBranch:0.15, hitRadius:45, swarmDamage:0.10, swarmHitRadius:30, fanStep:0.08, swarm: [0, 10, 14, 18] },        // C 增殖：超小型冰锥数
    '碎冰':   { count:3, baseDamage:0.45, spawnOffset:55, hitRadius:45, freezeDuration:2, halfAngle:Math.PI/6, dmg: [0, 0.15, 0.30, 0.45],        // B 碎劲：碎冰伤害
                frz: [0, 0.05, 0.10, 0.15] },      // C 冻结：命中冻结概率
    '冰花':   { period:8, baseCount:1, baseDamage:0.8, baseRadius:100, n: [0, 1, 2, 3],                   // C 繁花：冰花数量
                dmg: [0, 0.2, 0.4, 0.6],           // B 霜力：冰花伤害
                radius: [0, 0.2, 0.4, 0.6] },      // A 扩张：爆炸范围
    '冬珠':   { period:10, baseRadius:110, defaultTickInterval:0.8, damage:0.44, duration:5, targetCount:1, slowDuration:1, slowMult: [0, 0.2, 0.3, 0.4],      // A 寒域：范围减速
                radius: [0, 0.2, 0.4, 0.6],        // B 扩张：范围
                tickI: [0, 0.7, 0.55, 0.4] },      // C 凝华：伤害频率
    '冰墙':   { period:20, duration:10, absorb:300, attackerSlow:0.4, attackerSlowDuration:2, attackDelay:0.5, ttl: [0, 2, 4, 6],                 // A 凝壁：冰盾持续
                reflect: [0, 0.3, 0.6, 0.9],       // B 霜反：反伤
                heal: [0, 50, 100, 150] },         // C 融暖：结束回血
  },
  poison: {
    '毒池': { period:5, radius:130, radiusPerBranch:0.2, damage:0.20, damagePerBranch:0.4, duration:4, durationPerBranch:2, stacksPerSecond:1 },
    '毒棒': { period:4, minPeriod:1.5, periodReduction:0.5, count:1, duration:10, durationPerBranch:2, attackInterval:1, radius:200, damage:0.24, targets:1 },
    '毒藤': { period:6, targets:1, duration:3 },
    '剧毒':   { baseProbability:0.20, learnedProbability:0.25, probabilityPerBranch:0.15, baseDuration:5, durationPerBranch:2, baseDamage:0.10, freq: [0, 0.1, 0.2, 0.3] },        // C 频发：每跳间隔缩减
    '毒性强化': { stackCap:5, stacksPerBranch:2, damage:[0.15,0.18,0.21,0.24], ttlAdd: [0, 2, 4, 6] },          // B 延毒：中毒时长
    '瘟疫':   { speedMultiplier:0.8, slowDuration:1, defaultInterval:2, baseProbability:0.30, probabilityPerBranch:0.10, radius:50, radiusPerBranch:25, iv: [0, 2, 1.7, 1.5, 1.3] },   // A 快疫：传染判定间隔；C 强疫 = 0.30+0.10×C（30/40/50/60%）
    '瘴气':   { wallOffset:50, halfHeight:20, heightPerBranch:0.2, tickInterval:2, stacksPerTick:1, dotMult: [0, 1.2, 1.3, 1.4],       // B 浓瘴：中毒 DoT 伤害倍率
                atkCut: [0, 0.2, 0.35, 0.5] },     // C 弱化：瘴内中毒敌攻击削减
    '毒爆':   { targets:3, radius:200, inherit: [0, 0.30, 0.40, 0.50],    // B 继承：附带死亡层数概率
                swampTtl: [0, 4, 5, 6],            // C 毒沼：持续时间
                swampR: 60, swampSlow: 0.25,       // C 毒沼：半径 / 泥沼减速
                spreadP: 0.30 },                   // 基础：传染 30% 概率
  },
  electric: {
    '活电': { count:5, countPerBranch:2, damage:0.5, damagePerBranch:0.2, duration:1.4, durationPerBranch:0.4, minSpeed:150, randomSpeed:80, speedMultiplier:1.3, angleJitter:0.9, turnJitter:3.2, hitRadius:34 },
    '连锁': { extraTargets:2, targetsPerBranch:1, decay:0.30, decayReductionPerBranch:0.2, cooldownRefundPerBranch:0.03 },
    '电磁场': { probability:0.10, probabilityPerLevel:0.10, probabilityPerBranch:0.10, radius:110, damage:0.4, damagePerLevel:0.3, damagePerBranch:0.3, targets:1 },
    '雷暴': { period:10, periodReductionPerBranch:1, targetCount:3, targetsPerBranch:2, damage:0.64, damagePerLevel:0.25, chainProbability:[0,0.30,0.45,0.60], chainRadius:90, chainDamage:0.5 },
    '极光电击': { period:8, damage:0.80, damagePerBranch:0.20, branchRadius:100, radiusPerBranch:20, branchCount:3, branchDamage:0.4 },                     // 周期固定 8s（v1.16.51 分叉范围/数量由 A/C 分支内联）
    '过载':   { stackCap:3, duration:2, triggerStacks:3, burstDamage:0.8, burstRadius:150, paralysisDuration:1.5, burstSlow:0.5, deton: [0, 0.20, 0.30, 0.40] },    // A 弹载：消耗层数伤害
    '麻痹':   { spreadRadius:100, spreadDuration:1, spreadSlow:0.5, spreadDecay:0.05, baseProbability:0.20, learnedProbability:0.20, probabilityPerBranch:0.15, duration:2, durationPerBranch:0.5, slow:0.5, cond: [0, 0.20, 0.30, 0.40] },     // C 导电：邻近传导概率
  },
  boomerang: {
    '折返增伤': { damage:0.65, damagePerBranch:0.25, slow:0.20, slowDuration:1 },
    '放血': { baseProbability:0.20, learnedProbability:0.25, probabilityPerBranch:0.15, duration:4, durationPerBranch:1, distancePerTick:100, damage:0.40, damagePerBranch:0.20 },
    '多镖': { baseCount:1, damageDecayPerLevel:0.12, branchDecayMultiplier:0.5 },
    '风暴镖': { hitCooldown:0.3, hitRadius:14, period:12, damage:0.10, damagePerBranch:0.2, speedPerBranch:0.25, duration:3, rings:[{r:40,base:2.6},{r:80,base:-2.0},{r:120,base:2.4}], ringCounts:[4,6,8] },
    '弹力镖': { period:8, count:2, damage:0.60, damagePerBranch:0.25, bounces:10, bouncesPerBranch:5, duration:8, speed:400, hitRadius:30, spreadStep:0.5 },
    '接镖':   { speedPerBranch:0.20, catchCd: 0.5, catchRegain: 0.30 },  // 基础：未学接镖时接镖后冷却 / B 回能概率（v1.16.42）
    '猎手标记': { spreadRadius:100, stackCap:3, stacksPerBranch:2, markDur: 5,                      // 基础：标记持续秒
                deep: [0, 0.08, 0.16, 0.24] },     // A 深镖：受标记敌人受伤加成
    '风痕':   { sampleDistance:32, maxTrails:240, duration:1.5, durationPerBranch:0.5, damage:0.30, damagePerBranch:0.3, radius:34, slow: [0, 0.10, 0.20, 0.30] },     // C 卷痕：风痕内减速
  },
  cannon: {
    '重炮': { radius:100, radiusPerLevel:0.25, radiusPerBranch:0.15, splashDamage:0.40, damagePerBranch:0.15 },
    '震击': { probability:0.40, probabilityPerBranch:0.20, knockback:60, knockbackPerBranch:0.4, slowDuration:0.5, slowDurationPerBranch:0.5 },
    '炮火支援': { period:12, count:3, damage:0.60, damagePerBranch:0.4, radius:130 },
    '炮台': { count:1, duration:8, durationPerBranch:2, attackInterval:0.9, damage:0.68, radius:100, radiusPerBranch:0.3, period:10, minPeriod:4, periodReductionPerBranch:1 },
    '贯穿弹': { targets:2, damage:0.7, damagePerBranch:0.20, targetHalfHeight:60, targetHalfWidth:85, slowDuration:1, slow: [0, 0.15, 0.30, 0.45] },     // C 贯透：被贯穿减速
    '地雷阵': { radius:100, damage:1.2, damagePerBranch:0.5, duration:20, period:6, count:3, countPerBranch:2, shards: [0, 5, 6, 7],              // C 碎雷：弹片数
                shardR: 130, shardDmg: 0.30, shardSpeed: 500 }, // C 碎雷：范围/每片伤害/飞行速度
  },
};
