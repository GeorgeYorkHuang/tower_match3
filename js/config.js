/**
 * 配置兼容入口：基础布局、战场、经济与存档规则暂留此处。
 * 怪物 → config/monsters.js；塔 → config/towers.js；技能 → config/skills.js。
 * 圣遗物 → config/relics.js；查询函数 → relics/queries.js。
 * 业务代码继续使用 CONFIG，子模块禁止反向 require 本入口。
 */
module.exports = {
  DESIGN: { W: 750, H: 1626 },            // 竖屏设计稿：750×1626 = iPhone 15 物理 1179×2556 比例（0.461）

  FALL_SPEED: 14,

  LAYOUT: {
    statusBar:      { h: 72   },          // 状态条：金币/离线/设置
    actionArea:     { w: 700, h: 970, x: 25 },  // 怪物行动区（两侧留白 25）= 入口68 + 移动822 + 城墙75
    entryBand:      { w: 700, h: 68   },  // 入口/波次带
    wall:           { w: 700, h: 75, crenel: 12 }, // 城墙=防线（75 = 主体60 + 血条区10居中砖面 + 底空隙5）
    towerRow:       { h: 122  },          // 塔位区（紧贴城墙下方）
    towerSlot:      { size: 100, gap: 28, count: 4 }, // 槽 100×100，间距 28，整体 484 居中
    towerIcon:      { size: 98, badge: 16, expBar: { w: 98, h: 6 } }, // 图标近占满槽位
    boardArea:      { w: 750, h: 420 },   // 棋盘区（7 格 ×60 = 420，v1.17.11 塔位区即城墙后棋盘上移扩展）
    boardCell:      { size: 60, cols: 11, rows: 7, marginX: 15, marginBottom: 6 }, // 77 格（v1.17.11 6×12 → 7×11）
    funcBar:        { h: 102, keySize: 88 }, // 底部功能键区（三消棋盘下方）
    enemy:          { normal: 72, runner: 60, tank: 96, boss: 128, elite: 92 }, // 怪物显示尺寸（按类型，v1.5 放大一倍）
    pickLayer:      { w: 640, h: 660 },   // 三选一弹层（v1.7：横向三卡，上图标/中介绍/下描述）
    menu:           { tabY: 150, tabH: 84, tabW: 165, gap: 15 }, // 主界面页签区（4 页签：战斗/配置/商店/圣物）
  },

  COLORS: {
    red:    { tower: 'fire',       name: '火塔' },
    blue:   { tower: 'ice',        name: '冰塔' },
    green:  { tower: 'poison',     name: '毒塔' },
    yellow: { tower: 'electric',   name: '电塔' },
    purple: { tower: 'boomerang',  name: '回旋镖塔' },
    orange: { tower: 'cannon',     name: '炮塔（P1）' },
  },

  COLOR_WEIGHT: { red: 1/6, green: 1/6, blue: 1/6, yellow: 1/6, purple: 1/6, orange: 1/6 }, // 6 色均等出现

  DIFFICULTY: {
    default: 6,                 // 棋盘活跃色数：4/5/6
    activeColors: {             // 各难度活跃色（4 色=火冰毒电，5 色加回旋镖，6 色加橙）
      4: ['red', 'blue', 'green', 'yellow'],
      5: ['red', 'blue', 'green', 'yellow', 'purple'],
      6: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'],
    },
  },

  PENALTY_RATIO: 0.5,           // 惩罚色消除 → 随机已有塔经验，数值打五折（v1.12 起惩罚色改为全局技能充能，此值保留作口径记录）

  DIRECT_FIRST: 2,              // 新手/标准路径：前 2 次消除定向红/绿（引导协同开局）

  STORE: {
    items: [
      { id: 'atk',    icon: '⚔️', name: '攻击强化', desc: '本局全塔攻击 +20%',  cost: [120, 240],        max: 2 },
      { id: 'spd',    icon: '⏩', name: '攻速强化', desc: '本局全塔攻速 +15%',  cost: [100, 200],        max: 2 },
      { id: 'energy', icon: '⚡', name: '能量补给', desc: '所有塔能量 +15',     cost: [80, 160, 240],    max: 3 },
      { id: 'wall',   icon: '🛡️', name: '城墙修复', desc: '城墙回复 30% 最大血量', cost: [150, 300],        max: 2 },
    ],
  },

  DEBUG_ACCOUNT: false,    // 调试账号开关：true 时主菜单显示 🛠 测试工具（金币/钻石/碎片/解锁/星辉箱）——正式发布必须为 false

  EVAC: {
    interval: 10,            // 每隔 10 波出现一次撤离决策
    depthMult: 1.30,         // 每通过一个撤离点，深度收益倍率 ×1.30
    depthMultLate: 1.10,     // 40 波后倍率降档（引导多打几局）
    lateWave: 40,
    poolShare: 0.5,          // 每波金币的一半进入「深度收益池」，撤离拿池 100%，阵亡拿 30%
    deadRatio: 0.30,
  },

  SHARD_SETTLE: {
    deadRatio: 0.30,         // 失守 / 中途退出：10→3、9→2、8→2、4→1、3→0
  },

  GO: {
    THEME: {
      win:  { accent: '#f7c948', soft: 'rgba(247,201,72,0.20)', dim: 'rgba(247,201,72,0.16)', btn: '#2b6d4f' },
      lose: { accent: '#ff6b6b', soft: 'rgba(231,76,60,0.20)', dim: 'rgba(231,76,60,0.16)', btn: '#3a6ea5' },
    },
    RARITY: { r: '#4aa3ff', sr: '#a86bff', ssr: '#f7c948' },   // v1.17.22 大卡边框/胶囊用，先登记
    TRAIL: { x0: 70, x1: 680, lineY: 404, waveMax: 50, nodeR: 10, endR: 14, flagH: 34, labelGap: 34 },
    // 时间轴关键帧（ms），与计划文档「六、动画时间轴」一致
    TL: {
      stage: 0, ribbon: 120, title: 140, meta: 260,
      trail: 340, trailGrow: 380, node0: 520, nodeGap: 60, endPin: 760,
      lootTitle: 900, card0: 980, cardGap: 140, shardNum: 1400,
      billL: 1760, billR: 1840, mile: 1960, btn: 2160,
    },
  },

  MILESTONES: [10, 20, 30, 40, 50],   // 深度里程碑首达波次（一次性）

  KILL_DROP: {
    eliteShardChance: 0.25,           // 精英掉碎片概率
    eliteShardMax: 2,                 // 精英掉落数量 1~2
    bossShardBase: 4,                 // Boss 基础碎片
    bossShardBonusChance: 0.5,        // Boss 50% 概率额外 +2
    rarityWeight: { r: 0.60, sr: 0.32, ssr: 0.08 },  // 碎片稀有度权重
    // v1.17 击杀银币（随代际等级成长）：单怪 = (5~10 浮动) × 等级系数 × 类型倍率 × 战场银币倍率
    // 等级系数 goldLevelMult(lv) = 1 + 0.125×(lv-1)：Lv1=1.0（5~10）→ Lv9=2.0（10~20）→ Lv10=2.125
    // 波50 mix=Lv9 60%+Lv10 40% → 平均系数 2.05 ≈ 波1 的 2 倍（用户目标）；替代旧 1.06^w 通胀
    killGold: [5, 10],                // 普通击杀单怪银币区间（Lv1 基准）
    eliteGoldMult: 3,                 // 精英击杀银币 ×3
    bossGoldMult: 8,                  // Boss 击杀银币 ×8
    /** 代际等级银币系数（Lv1 = 1.0，每级 +0.125） */
    goldLevelMult(lv) { return 1 + 0.125 * ((lv || 1) - 1); },
  },

  DEPTH_CHEST: {
    // 单局最深波次 → 宝箱档位（50 波顶配）
    tiers: [
      { key: 'wood',   name: '木质宝箱', max: 9,   openSec: 15 * 60,      speedDiamond: 2,  gold: [100, 200], shards: [2, 4],  cardChance: 0.20, cardRarity: 'r',    diamond: 0, stone: 0 },
      { key: 'bronze', name: '青铜宝箱', max: 19,  openSec: 1 * 3600,     speedDiamond: 6,  gold: [250, 450], shards: [5, 9],  cardChance: 0.35, cardRarity: 'r',    diamond: 0, stone: 0 },
      { key: 'silver', name: '白银宝箱', max: 29,  openSec: 3 * 3600,     speedDiamond: 15, gold: [500, 800], shards: [10, 16], cardChance: 1.0, cardRarity: 'sr',   diamond: 0, stone: 0 },
      { key: 'gold',   name: '黄金宝箱', max: 39,  openSec: 8 * 3600,     speedDiamond: 30, gold: [900, 1500], shards: [18, 30], cardChance: 1.0, cardRarity: 'sr',  diamond: 3, stoneChance: 0.10, goldCardChance: 0.25 },
      { key: 'star',   name: '星辉宝箱', max: 9999, openSec: 12 * 3600,   speedDiamond: 50, gold: [1800, 3000], shards: [35, 60], cardChance: 1.0, cardRarity: 'ssr', diamond: 5, stone: 1 },
    ],
    slots: 4,                 // 同时开启上限
  },

  FIELDS: {
    ancient: { name: '圣坛花园', short: '🏰 圣坛花园', tint: '#2ecc71', tintDark: '#1f8c5f',
      subtitle: '城墙防守 · 怪物攻城 · 圣坛裂痕', goldMult: 1.0, ammoCapMult: 1.0, dropAttr: 'mix', unlockWave: 0 },
    lava:    { name: '熔岩矿场', short: '🌋 熔岩矿场', tint: '#e8603c', tintDark: '#8c2f18',
      subtitle: '高血精英 · 弹药上限 -30% · 攻击类碎片', goldMult: 1.0, ammoCapMult: 0.7, dropAttr: 'attack', unlockWave: 0 },
    frost:   { name: '霜风峡谷', short: '❄️ 霜风峡谷', tint: '#5dade2', tintDark: '#21618c',
      subtitle: '高速成群 · 每15波风场增速 · 控制类碎片', goldMult: 1.0, ammoCapMult: 1.0, dropAttr: 'control', unlockWave: 0, windEvery: 15 },
    abyss:   { name: '深渊裂隙', short: '🕳️ 深渊裂隙', tint: '#a86bff', tintDark: '#5c33a8',
      subtitle: '每10波诅咒 · 深度结算×2 · 全资源 · 计入排行', goldMult: 1.5, ammoCapMult: 1.0, dropAttr: 'all', unlockWave: 25, curseEvery: 10, deepMult: 2 },
    test:    { name: '测试战场', short: '🧪 测试战场', tint: '#a88bff', tintDark: '#6d5bd0',
      subtitle: '免三消直测塔技能效果', goldMult: 0, ammoCapMult: 1.0, dropAttr: 'none', unlockWave: 0 },
  },

  FIELD_ORDER: ['ancient', 'lava', 'frost', 'abyss', 'test'],

  LINE: {
    hp: 2000,                    // 防线血量（城墙）
  },

  ECONOMY: {
    goldPerWaveBase: 60, goldPerWaveGrowth: 1.08,   // 每波基础银币 = 60 × 1.08^(w-1)（全局，不绑塔）
    goldTargetCap: 100000,      // 30 分钟期末囤积上限断言
  },

  OFFLINE: {
    maxSeconds: 7200,           // 离线上限 2 小时，超出截断
    baseRate: 12,               // 基准金币速率（金币/s，随全局塔等级成长）
    rate50: 0.5,                // 默认 50%，看广告补足 100%（翻倍，不叠加）
    idempotent: true,           // 时间戳幂等：每次结算后更新 lastTs
  },

  AD: {
    rewarded: [
      { id: 'offline_double',  name: '离线收益翻倍', reward: '离线收益 50% → 100%',          note: '主收入位' },
      { id: 'revive',          name: '破防复活',     reward: '防线回满 + 当前波敌人清空一次', note: '单局限 1 次' },
    ],
  },

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
    perDay: 3,                  // v5.3c 每日碎片精选数量（改为碎片奖励，非整件）
    shards: { r: 3, sr: 2, ssr: 1 },      // 各稀有度每日碎片数量
    price: { r: 300, sr: 600, ssr: 1200 }, // 各稀有度精选金币价
    refreshHour: 0,             // 每日 0 点刷新
  },

  SHOP_CHEST: {
    blue:   { key: 'blue',   name: '圣物宝箱·蓝', icon: '📦', color: '#4aa3ff', price: 300,  shards: [2, 3], rarities: ['r'],   daily: 5 },
    purple: { key: 'purple', name: '圣物宝箱·紫', icon: '🎁', color: '#a86bff', price: 700,  shards: [2],    rarities: ['sr'],  daily: 3 },
    gold:   { key: 'gold',   name: '圣物宝箱·金', icon: '👑', color: '#f7c948', price: 1300, shards: [1, 2], rarities: ['ssr'], daily: 2 },
  },

  SAVE: {
    fields: ['gold', 'towerUnlocks', 'towerGlobalLevel', 'lastTs'],
    writeOn: ['gold/level change', 'exit'],
  },
};

// Compatibility facade: shared object references, no cloned second source of truth.
for (const domain of [
  require('./config/monsters.js'),
  require('./config/towers.js'),
  require('./config/skills.js'),
  require('./config/relics.js'),
  require('./relics/queries.js'),
]) {
  for (const key of Object.keys(domain)) {
    if (Object.prototype.hasOwnProperty.call(module.exports, key)) throw new Error('Duplicate config key: ' + key);
    module.exports[key] = domain[key];
  }
}
