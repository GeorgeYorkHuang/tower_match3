/**
 * config.js —— 《消消防线》数值单源（策划数据表）
 * =====================================================================
 * 本文件是全部数值与设计的唯一配置源，UI/逻辑/模拟脚本均以它为准。
 * 与 tools/sim_effects.py 的 CONFIG 同步维护；与飞书 GDD 保持口径一致。
 * 口径版本：机制 v6（回旋镖塔/4 塔位/难度 4-5-6/惩罚色/主界面定版 v6）
 *
 * 运行环境：微信小游戏（CommonJS）
 */
module.exports = {

  /* ================= 设计稿与主界面布局（定版 v7：iPhone 15 比例 750×1626） ================= */
  DESIGN: { W: 750, H: 1626 },            // 竖屏设计稿：750×1626 = iPhone 15 物理 1179×2556 比例（0.461）
  /* 三消下落速度（格/秒）：14 格/秒 = 60×14 = 840px/s（全局统一速度，恢复原定节奏） */
  FALL_SPEED: 14,

  LAYOUT: {
    statusBar:      { h: 72   },          // 状态条：金币/离线/设置
    actionArea:     { w: 700, h: 970, x: 25 },  // 怪物行动区（两侧留白 25）= 入口68 + 移动822 + 城墙75
    entryBand:      { w: 700, h: 68   },  // 入口/波次带
    wall:           { w: 700, h: 75, crenel: 12 }, // 城墙=防线（75 = 主体60 + 血条区10居中砖面 + 底空隙5）
    towerRow:       { h: 122  },          // 塔位区（紧贴城墙下方）
    towerSlot:      { size: 100, gap: 28, count: 4 }, // 槽 100×100，间距 28，整体 484 居中
    towerIcon:      { size: 98, badge: 16, expBar: { w: 98, h: 6 } }, // 图标近占满槽位
    boardArea:      { w: 750, h: 360 },   // 棋盘区（6 格 ×60 = 360，素材近原尺寸）
    boardCell:      { size: 60, cols: 12, rows: 6, marginX: 15, marginBottom: 6 }, // 72 格
    funcBar:        { h: 102, keySize: 88 }, // 底部功能键区（三消棋盘下方）
    enemy:          { normal: 72, runner: 60, tank: 96, boss: 128, elite: 92 }, // 怪物显示尺寸（按类型，v1.5 放大一倍）
    pickLayer:      { w: 640, h: 660 },   // 三选一弹层（v1.7：横向三卡，上图标/中介绍/下描述）
    menu:           { tabY: 150, tabH: 84, tabW: 165, gap: 15 }, // 主界面页签区（4 页签：战斗/配置/商店/圣物）
  },

  /* ================= 颜色 → 塔映射与难度 ================= */
  // 6 色棋盘对应 6 座塔池；橙=炮塔（P1 未实现，P0 中为无塔惩罚色）
  COLORS: {
    red:    { tower: 'fire',       name: '火塔' },
    blue:   { tower: 'ice',        name: '冰塔' },
    green:  { tower: 'poison',     name: '毒塔' },
    yellow: { tower: 'electric',   name: '电塔' },
    purple: { tower: 'boomerang',  name: '回旋镖塔' },
    orange: { tower: 'cannon',     name: '炮塔（P1）' },
  },
  // 棋盘生成权重（按难度自动归一化）
  COLOR_WEIGHT: { red: 1/6, green: 1/6, blue: 1/6, yellow: 1/6, purple: 1/6, orange: 1/6 }, // 6 色均等出现
  DIFFICULTY: {
    default: 6,                 // 棋盘活跃色数：4/5/6
    activeColors: {             // 各难度活跃色（4 色=火冰毒电，5 色加回旋镖，6 色加橙）
      4: ['red', 'blue', 'green', 'yellow'],
      5: ['red', 'blue', 'green', 'yellow', 'purple'],
      6: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'],
    },
  },
  TOWER_SLOTS: 4,               // 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）
  PENALTY_RATIO: 0.5,           // 惩罚色消除 → 随机已有塔经验，数值打五折
  DIRECT_FIRST: 2,              // 新手/标准路径：前 2 次消除定向红/绿（引导协同开局）

  /* ================= 消除经验与升级曲线 ================= */
  /* 塔经验按消除方块计算：每块基础经验 × 块数 × 形状倍率。
     三消经验远少于打怪（perCell=2 → 3连 6 经验 vs 击杀 normal 15）。 */
  EXP: {
    perCell: 2,                              // 每个消除方块的基础经验（三消少量）
    shape: { '3': 1.0, '4': 1.5, L5: 1.5, '5': 2.0, '6+': 2.5 }, // 形状倍率（3连/直4/L5/直5/6+）
    base: 30, growth: 1.4,                  // 升级需求 exp(L) = 30 × 1.4^(L-1)
    towerMaxLevel: 20,
    // 击杀经验（打怪为主渠道；精英/Boss 更多；三消经验=每块 2×块数×形状倍率，明显低于击杀）
    kill: { normal: 15, runner: 10, tank: 22, elite: 30, boss: 90 },
    waveBonus: 5,                            // 波末全塔额外经验（少量）
  },

  /* ================= 特效系统（roguelike 核心） ================= */
  EFFECT: {
    maxLevel: 3,                // Lv1 激活，Lv3 满级
    activeSlots: 3,             // 每塔单局激活槽
    pickSize: 3,                // 三选一候选数
    pendingCap: 5,              // 待选可攒上限（跨波）
    poolP0: false,              // 全池口径：每塔 8 特效全部可入池（原 P0 前 5 已全部实现，P1 一并开放）
    p0PoolSize: 5,              // P0 口径时的池大小（与模拟器校验对齐用；poolP0=false 时忽略）
    targetWeight: 2,            // 目标特效候选加权 ×2
    swapOnFull: true,           // 槽满可替换（roguelike 换装）
    firstPickGuarantee: true,   // 每塔本局首次三选一必含标志特效
    bonusPerLv: 0.15,           // 已激活特效每 1 级对塔 DPS 的乘区加成
    synergyBonus: 0.5,          // 协同达成后的乘区加成
  },

  /* ================= 塔属性（DPS 与等级成长 + 弹道表现参数） ================= */
  TOWERS: {
    fire:      { color: 'red',    baseDps: 30, grow: 1.25, range: 830, atkInterval: 0.9,  shot: { kind: 'line',  dur: 1.0  } }, // 火球弹道（直线慢速）
    ice:       { color: 'blue',   baseDps: 20, grow: 1.22, range: 760, atkInterval: 1.1,  shot: { kind: 'line',  dur: 1.0  } }, // 冰锥弹道
    poison:    { color: 'green',  baseDps: 25, grow: 1.23, range: 800, atkInterval: 1.0,  shot: { kind: 'line',  dur: 1.0  } }, // 毒液弹道
    electric:  { color: 'yellow', baseDps: 25, grow: 1.23, range: 700, atkInterval: 1.0,  shot: { kind: 'bolt',  dur: 0.5  } }, // 闪电折线
    boomerang: { color: 'purple', baseDps: 22, grow: 1.24, range: 880, atkInterval: 1.3,  shot: { kind: 'arc',   dur: 2.4  } }, // 回旋弧线（v1.7 慢一倍 + 接镖再投）
    cannon:    { color: 'orange', baseDps: 38, grow: 1.26, range: 930, atkInterval: 1.8,  shot: { kind: 'mortar', dur: 1.5  } }, // 抛物线炮弹
  },

  /* ================= 特效池完整表（每塔 8 特效 × 2 分支） =================
   * p0: 是否 P0 实现（每塔前 5 个为 P0，余 3 个 P1 补）
   * desc: 基础效果；a/b: 分支文案（参数化实现时按数值模板解析）
   * color: 三选一界面技能卡专属色（v1.5：按技能属性区分，不再整卡同塔色）
   */
  EFFECT_POOLS: {
    fire: [
      { name: '点燃',       icon: '🔥', color: '#ff6b35', desc: '命中附带灼烧 DoT',          p0: true,  a: '灼烧时间 +50%',       b: '灼烧伤害 +50%' },
      { name: '溅射',       icon: '💥', color: '#ff9f43', desc: '命中溅射邻近敌人',          p0: true,  a: '溅射半径 +30%',       b: '溅射伤害 +40%' },
      { name: '连击',       icon: '⚔️', color: '#e67e22', desc: '连续命中同目标递增',        p0: true,  a: '叠加上限 +2 层',      b: '每层加成 +10%' },
      { name: '燃爆',       icon: '💣', color: '#e74c3c', desc: '点燃目标死亡爆炸',          p0: true,  a: '爆炸伤害 +50%',       b: '爆炸范围 +40%' },  // 协同：与毒爆
      { name: '灼烧层数',   icon: '🌋', color: '#ff4757', desc: '点燃可叠层',                p0: true,  a: '叠层上限 +2',         b: '满层触发小爆炸' },
      { name: '攻速爆发',   icon: '⏩', color: '#ff8c42', desc: '攻速提升',                  p0: false, a: '攻速 +25%',            b: '每次命中回血 1%' },
      { name: '射程',       icon: '🎯', color: '#f39c12', desc: '攻击距离提升',              p0: false, a: '射程 +30%',            b: '优先攻击最远敌人' },
      { name: '火雨',       icon: '🌧️', color: '#d63031', desc: '周期性全屏火雨',            p0: false, a: '间隔 -30%',            b: '火雨伤害 +40%' },
    ],
    ice: [
      { name: '减速场',     icon: '🥶', color: '#5dade2', desc: '攻击附带减速光环',          p0: true,  a: '减速幅度 +15%',       b: '减速范围 +30%' },
      { name: '冰冻',       icon: '🧊', color: '#3498db', desc: '攻击概率冻结目标',          p0: true,  a: '冻结概率 +15%',       b: '冻结时长 +0.5 秒' }, // 协同：与电连锁
      { name: '冰锥穿透',   icon: '🏹', color: '#85c1e9', desc: '弹体穿透多个敌人',          p0: true,  a: '穿透目标 +2',         b: '穿透伤害 +30%' },
      { name: '寒潮',       icon: '🌬️', color: '#7fb3d5', desc: '周期性范围减速波',          p0: true,  a: '间隔 -30%',           b: '范围 +40%' },
      { name: '霜星',       icon: '❄️', color: '#a9cce3', desc: '冻结目标死亡溅射冻结',      p0: true,  a: '溅射半径 +30%',       b: '溅射冻结概率 +20%' },
      { name: '冻结率',     icon: '🎲', color: '#4ea8de', desc: '全塔冻结概率提升',          p0: false, a: '冻结率 +15%',         b: '冻结目标受伤 +20%' },
      { name: '低温全塔',   icon: '🧣', color: '#6fa8dc', desc: '全塔攻速光环',              p0: false, a: '全塔攻速 +10%',       b: '冰塔额外攻速 +15%' },
      { name: '永冻',       icon: '⛄', color: '#2e86de', desc: '冰冻目标不随时间解除',      p0: false, a: '冰冻不可被攻击解除',  b: '冰塔对冰冻目标伤害 +40%' },
    ],
    poison: [
      { name: '剧毒',       icon: '☠️', color: '#27ae60', desc: '命中附加中毒 DoT',          p0: true,  a: '中毒时间 +50%',       b: '中毒伤害 +50%' },
      { name: '扩散',       icon: '🦠', color: '#2ecc71', desc: '中毒目标死亡向邻近传播',    p0: true,  a: '传播次数 +2',         b: '传播保留 50% 强度' },
      { name: '毒爆',       icon: '💨', color: '#1abc9c', desc: '中毒目标死亡爆炸',          p0: true,  a: '爆炸伤害 +50%',       b: '爆炸范围 +40%' },  // 协同：与燃爆
      { name: '腐蚀',       icon: '🧪', color: '#52be80', desc: '攻击降低目标防御',          p0: true,  a: '减防 +20%',           b: '减防持续 +2 秒' },
      { name: '毒雾',       icon: '🌫️', color: '#58d68d', desc: '周期性释放毒雾区域',        p0: true,  a: '毒雾范围 +30%',       b: '毒雾伤害 +40%' },
      { name: '瘟疫',       icon: '😷', color: '#45b39d', desc: '中毒敌人相互传染',          p0: false, a: '传染间隔 -30%',       b: '传染概率 +20%' },
      { name: '致死',       icon: '💀', color: '#7dcea0', desc: '中毒目标低血直接死亡',      p0: false, a: '致死阈值 +10%',       b: '可作用于 Boss（限伤）' },
      { name: '毒性强化',   icon: '⚗️', color: '#a3e4d7', desc: '全 DoT 效果提升',           p0: false, a: 'DoT 总伤害 +25%',     b: 'DoT 触发频率 +25%' },
    ],
    electric: [
      { name: '连锁',       icon: '⚡', color: '#f4d03f', desc: '攻击弹跳多个目标',          p0: true,  a: '连锁目标 +2',         b: '连锁衰减 -20%' },  // 协同：与冰冻
      { name: '麻痹',       icon: '😵', color: '#f7dc6f', desc: '命中概率麻痹（停止攻击）',  p0: true,  a: '麻痹概率 +15%',       b: '麻痹时长 +0.3 秒' },
      { name: '过载',       icon: '🔋', color: '#f5b041', desc: '连续命中同目标增伤',        p0: true,  a: '增伤叠层上限 +3',     b: '每层增伤 +15%' },
      { name: '电弧',       icon: '💡', color: '#fad390', desc: '周期性放电路径伤害',        p0: true,  a: '电弧伤害 +50%',       b: '电弧宽度 +30%' },
      { name: '雷暴',       icon: '🌩️', color: '#f9e79f', desc: '周期性全屏落雷',            p0: true,  a: '落雷间隔 -30%',       b: '落雷伤害 +40%' },
      { name: '弹跳',       icon: '🏓', color: '#ffd24a', desc: '弹体弹跳次数提升',          p0: false, a: '弹跳次数 +2',         b: '弹跳保留伤害 +20%' },
      { name: '充能',       icon: '🔌', color: '#f1c40f', desc: '攻速随攻击次数提升',        p0: false, a: '充能叠层上限 +5',     b: '每层攻速 +10%' },
      { name: '电磁场',     icon: '🧲', color: '#f7e27e', desc: '全塔概率触发微型连锁',      p0: false, a: '触发概率 +10%',       b: '微型连锁伤害 +30%' },
    ],
    boomerang: [
      { name: '穿透',       icon: '🗡️', color: '#a569bd', desc: '回旋镖多穿透 1 个敌人',     p0: true,  a: '穿透目标数 +1',       b: '穿透伤害 -10%' },
      { name: '折返增伤',   icon: '🪃', color: '#9b59b6', desc: '折返段伤害提升',            p0: true,  a: '折返伤害 +50%',       b: '折返命中减速 20%' },
      { name: '飞距',       icon: '📏', color: '#bb8fce', desc: '回旋镖飞行距离提升',        p0: true,  a: '飞距 +30%',           b: '更快折返（双段节奏加快）' },
      { name: '攻速',       icon: '⏰', color: '#8e44ad', desc: '投掷频率提升',              p0: true,  a: '攻速 +25%',           b: '每次命中回能 1%' },
      { name: '回收',       icon: '♻️', color: '#af7ac5', desc: '击杀敌人缩短下一镖冷却',    p0: true,  a: '击杀冷却 -30%',       b: '击杀恢复防线 1%' },
      { name: '双镖',       icon: '🥏', color: '#c39bd3', desc: '同时投掷两枚回旋镖',        p0: false, a: '双镖伤害各 100%',     b: '双镖合击同一目标增伤 30%' },
      { name: '暴击',       icon: '🎯', color: '#d2b4de', desc: '折返段概率暴击',            p0: false, a: '暴击率 +15%',         b: '暴击伤害 +50%' },
      { name: '范围回旋',   icon: '🌀', color: '#a966c2', desc: '回旋镖吸附范围扩大',        p0: false, a: '吸附半径 +30%',       b: '命中附带小溅射' },
    ],
    cannon: [
      { name: '溅射',       icon: '💥', color: '#b5651d', desc: '炮弹爆炸范围溅射',          p0: true,  a: '爆炸半径 +30%',       b: '爆炸伤害 +40%' },
      { name: '重击',       icon: '🔨', color: '#c0392b', desc: '命中单体高伤',              p0: true,  a: '重击伤害 +50%',       b: '重击概率 +15%' },
      { name: '穿透弹',     icon: '🎯', color: '#d35400', desc: '炮弹贯穿路径',              p0: true,  a: '穿透敌人 +3',         b: '穿透伤害 +25%' },
      { name: '炮台座',     icon: '🏰', color: '#a04000', desc: '攻速提升',                  p0: true,  a: '攻速 +20%',           b: '概率双发' },
      { name: '震击',       icon: '👊', color: '#e67e22', desc: '爆炸击退敌人',              p0: true,  a: '击退距离 +40%',       b: '击退后减速 1 秒' },
      { name: '引信',       icon: '⏱️', color: '#f39c12', desc: '爆炸延迟但伤害更高',        p0: false, a: '延迟 -50%',           b: '爆炸伤害 +60%' },
      { name: '弹幕',       icon: '🛡️', color: '#b03a2e', desc: '周期性全屏炮击',            p0: false, a: '炮击间隔 -30%',       b: '炮击伤害 +40%' },
      { name: '阵地加固',   icon: '🧱', color: '#8e6e23', desc: '防线与炮塔防御加成',        p0: false, a: '防线血量 +20%',       b: '炮塔防御 +30%' },
    ],
  },

  /* 协同组：旗舰组合（达成后触发 synergyBonus 乘区） */
  SYNERGIES: [
    { a: { tower: 'fire',    effect: '燃爆' }, b: { tower: 'poison', effect: '毒爆' } },
    { a: { tower: 'ice',     effect: '冰冻' }, b: { tower: 'electric', effect: '连锁' } },
    { a: { tower: 'cannon',  effect: '溅射' }, b: { tower: 'fire',  effect: '溅射' } }, // 炮火联动：双溅射 → 爆炸伤害 +50%
  ],

  /* ================= 波次 / 敌人 / 防线 ================= */
  WAVE: {
    seconds: 40,                // 波时长
    matchesPerWave: 5,          // 操作模型：每波有效消除次数
    matchDist: { '3': 0.70, '4': 0.20, L5: 0.05, '5': 0.05 },  // 3连/直4/L5/直5 消占比
    maxWave: 50,                // 模拟/关卡上限
  },
  ENEMY: {
    hpBase: 1000, hpGrowth: 1.30,          // 敌人血量 = 1000 × 1.30^(w-1)（v7 追平塔 DPS 成长，避免秒杀）
    countPerWave: '6 + 3 × wave',          // 每波数量（实现时按表达式解析）
    bossEvery: 5,                          // 每 5 波 1 只 Boss（5,10,15...），掉宝箱
    bossHpMult: 5,
    elitePerWave: 1,                       // 每波固定 1 只精英怪（概率掉落圣物）
    // 怪物种类（P0）：血量/移速系数；混合投放见 wave.js _typeMix（波3+ 出快速怪、波6+ 加重甲怪）
    types: {
      normal: { hpMult: 1.0, spdMult: 1.0 },
      runner: { hpMult: 0.6, spdMult: 1.8 },
      tank:   { hpMult: 2.8, spdMult: 0.6 },
      elite:  { hpMult: 3.0, spdMult: 0.85 },  // 精英：高血慢速，概率掉圣物
    },
    // 攻城攻击（怪物到城墙攻击范围后停止前进，按攻击力×攻击频率持续扣防线血）
    attack: { normal: 8, runner: 4, tank: 18, boss: 60, elite: 30 }, // 每次攻击伤害
    attackInterval: { normal: 1.0, runner: 0.7, tank: 1.6, boss: 1.2, elite: 1.1 }, // 攻击间隔（秒）
    speed: { slow: 0.6, normal: 1.0, fast: 1.4 },  // 速度三档，快怪血量减半
  },
  LINE: {
    hp: 2000,                    // 防线血量（城墙）
  },

  /* ================= 经济 / 囤积 / 离线 ================= */
  ECONOMY: {
    goldPerWaveBase: 60, goldPerWaveGrowth: 1.08,   // 每波基础金币 = 60 × 1.08^(w-1)（全局，不绑塔）
    goldTargetCap: 100000,      // 30 分钟期末囤积上限断言
  },
  OFFLINE: {
    maxSeconds: 7200,           // 离线上限 2 小时，超出截断
    baseRate: 12,               // 基准金币速率（金币/s，随全局塔等级成长）
    rate50: 0.5,                // 默认 50%，看广告补足 100%（翻倍，不叠加）
    idempotent: true,           // 时间戳幂等：每次结算后更新 lastTs
  },

  /* ================= 广告位（IAA） ================= */
  AD: {
    rewarded: [
      { id: 'offline_double',  name: '离线收益翻倍', reward: '离线收益 50% → 100%',          note: '主收入位' },
      { id: 'revive',          name: '破防复活',     reward: '防线回满 + 当前波敌人清空一次', note: '单局限 1 次' },
    ],
  },

  /* ================= 主界面：商店 / 圣物 / 宝箱 ================= */
  /* 技能卡系统已移除（v1.4.0）：技能 = 每塔默认 3 个 + 战斗中升级三选一解锁/升级；
     宝箱与圣物卡成为唯一养成资源。 */
  /* ===== 圣物养成（v1.4.0）：宝箱/精英掉落获取，无需装备，拥有即常驻加成 ===== */
  RELIC: {
    // 圣物表：掉落权重 / 升级金币基础与成长 / 每级效果描述
    list: [
      { id: 'gold',   name: '招财符',   icon: '💰', drop: 10, costBase: 200, costGrowth: 1.5, desc: (lv) => `波末金币 +${20 * lv}%` },
      { id: 'exp',    name: '经验珠',   icon: '✨', drop: 10, costBase: 200, costGrowth: 1.5, desc: (lv) => `击杀经验 +${20 * lv}%` },
      { id: 'speed',  name: '疾风戒',   icon: '💨', drop: 10, costBase: 200, costGrowth: 1.5, desc: (lv) => `全塔攻速 +${8 * lv}%` },
      { id: 'wall',   name: '磐石印',   icon: '🛡️', drop: 8,  costBase: 250, costGrowth: 1.6, desc: (lv) => `城墙血量 +${10 * lv}%` },
      { id: 'dmg',    name: '利刃符',   icon: '🗡️', drop: 8,  costBase: 250, costGrowth: 1.6, desc: (lv) => `全塔伤害 +${8 * lv}%` },
      { id: 'chest',  name: '寻宝罗盘', icon: '🧭', drop: 5,  costBase: 300, costGrowth: 1.7, desc: (lv) => `精英圣物掉率 +${10 * lv}%` },
    ],
    dropChance: 0.35,           // 击杀精英的圣物宝箱基础掉落概率（寻宝罗盘加成后）
    chestOpenSec: 30,           // 宝箱开启等待时长（秒，便于真机验收，可配置调大）
  },
  CHEST: {
    // 宝箱开启奖励：随机 1 张圣物卡（按掉率权重，优先低拥有数）
  },

  /* ===== 商店：广告 / 钻石 / 每日精选 ===== */
  AD_REWARD: {
    rewardedId: '',             // 激励视频广告位（未配置时按钮提示"广告未配置"）
    gold: 100,                  // 看广告得金币
    card: true,                 // 看广告得 1 张随机圣物卡（金币/卡片二选一发放）
  },
  DIAMOND: {
    chestPrice: 1,              // 1 钻石 = 1 宝箱
    goldPrice: 500,             // 1 钻石 = 500 金币
  },
  DAILY: {
    perDay: 3,                  // 每日精选圣物卡数量
    price: 100,                 // 精选圣物卡金币价
    refreshHour: 0,             // 每日 0 点刷新
  },

  /* ================= 存档字段 ================= */
  SAVE: {
    fields: ['gold', 'towerUnlocks', 'towerGlobalLevel', 'lastTs'],
    writeOn: ['gold/level change', 'exit'],
  },
};
