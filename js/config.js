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
    boardArea:      { w: 750, h: 420 },   // 棋盘区（7 格 ×60 = 420，塔位区即城墙后棋盘上移扩展）
    boardCell:      { size: 60, cols: 11, rows: 7, marginX: 15, marginBottom: 6 }, // 77 格（6×12 → 7×11）
    funcBar:        { h: 102, keySize: 88 }, // 底部功能键区（三消棋盘下方）
    enemy:          { normal: 72, runner: 60, tank: 96, boss: 128, elite: 92 }, // 怪物显示尺寸（按类型，放大一倍）
    pickLayer:      { w: 640, h: 660 },   // 三选一弹层（：横向三卡，上图标/中介绍/下描述）
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

  PENALTY_RATIO: 0.5,           // 惩罚色消除 → 随机已有塔经验，数值打五折（起惩罚色改为全局技能充能，此值保留作口径记录）

  DIRECT_FIRST: 2,              // 新手/标准路径：前 2 次消除定向红/绿（引导协同开局）

  STORE: require('./config/shop.js').store,
  PICK_REROLL: require('./config/shop.js').reroll,

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
    RARITY: { r: '#4aa3ff', sr: '#a86bff', ssr: '#f7c948' },   // 大卡边框/胶囊用，先登记
    TRAIL: { x0: 70, x1: 680, lineY: 404, waveMax: 60, nodeR: 10, endR: 14, flagH: 34, labelGap: 34 },
    // 时间轴关键帧（ms），与计划文档「六、动画时间轴」一致
    // 旗帜/轨迹段放慢近一倍：已走段生长 380→720，里程碑旗逐个亮起 60→120ms 间隔，
    //   末端与后续账单按新节奏顺延（末节点完成 ≈1.36s，整场演出 2.16→2.72s，仍有「点击跳过」）
    TL: {
      stage: 0, ribbon: 120, title: 140, meta: 260,
      trail: 340, trailGrow: 720, node0: 640, nodeGap: 120, endPin: 1360,
      lootTitle: 1440, card0: 1520, cardGap: 140, shardNum: 1960,
      billL: 2240, billR: 2320, mile: 2440, btn: 2720,
    },
  },

  MILESTONES: [10, 20, 30, 40, 50],   // 深度里程碑首达波次（一次性）

  KILL_DROP: {
    miniBossChestChance: 0.55,        // 深渊旧规则；普通三地图由battle-relic-drops.js固定节点发放
    majorBossChestChance: 1,          // 深渊旧规则；普通三地图W20/40固定全金
    eliteShardChance: 0.10,           // 精英10%概率掉1片
    miniBossShardChance: 0.25,        // 每5波小Boss25%概率掉碎片
    miniBossShardMin: 2,
    miniBossShardMax: 4,
    majorBossShardBase: 2,            // 每20波大Boss保底2片
    majorBossShardBonusChance: 0.55,  // 55%概率额外掉3~6片
    majorBossShardBonusMin: 3,
    majorBossShardBonusMax: 6,
    rarityWeight: { r: 0.60, sr: 0.32, ssr: 0.08 },  // 碎片稀有度权重
    // 击杀银币（随代际等级成长）：单怪 = (5~10 浮动) × 等级系数 × 类型倍率 × 战场银币倍率
    // 等级系数 goldLevelMult(lv) = 1 + 0.125×(lv-1)：Lv1=1.0（5~10）→ Lv9=2.0（10~20）→ Lv10=2.125
    // 波50 mix=Lv9 60%+Lv10 40% → 平均系数 2.05 ≈ 波1 的 2 倍（用户目标）；替代旧 1.06^w 通胀
    killGold: [5, 10],                // 普通击杀单怪银币区间（Lv1 基准）
    eliteGoldMult: 3,                 // 精英击杀银币 ×3
    bossGoldMult: 8,                  // Boss 击杀银币 ×8
    /** 代际等级银币系数（Lv1 = 1.0，每级 +0.125） */
    goldLevelMult(lv) { return 1 + 0.125 * ((lv || 1) - 1); },
  },

  DEPTH_CHEST: {
    fragmentCards: 3,           // 基础碎片分成最多3份抽取，重复圣遗物合并展示
    bonusCardShards: 5,        // 额外圣遗物卡折算碎片数
    // 单局最深波次 → 宝箱档位（50 波顶配）
    tiers: [
  {
    "key": "wood",
    "name": "木质宝箱",
    "max": 9,
    "openSec": 900,
    "gold": [
      150,
      250
    ],
    "fragments": {
      "r": [
        4,
        6
      ]
    }
  },
  {
    "key": "bronze",
    "name": "青铜宝箱",
    "max": 19,
    "openSec": 3600,
    "gold": [
      350,
      550
    ],
    "fragments": {
      "r": [
        6,
        10
      ],
      "sr": [
        1,
        2
      ]
    }
  },
  {
    "key": "silver",
    "name": "白银宝箱",
    "max": 29,
    "openSec": 10800,
    "gold": [
      700,
      1000
    ],
    "fragments": {
      "r": [
        8,
        12
      ],
      "sr": [
        4,
        6
      ]
    },
    "ssrChance": 0.25
  },
  {
    "key": "gold",
    "name": "黄金宝箱",
    "max": 39,
    "openSec": 21600,
    "gold": [
      1300,
      1800
    ],
    "fragments": {
      "r": [
        10,
        16
      ],
      "sr": [
        8,
        12
      ],
      "ssr": [
        2,
        2
      ]
    },
    "diamond": 3,
    "bonusDiamondChance": 0.1
  },
  {
    "key": "star",
    "name": "星辉宝箱",
    "max": 9999,
    "openSec": 28800,
    "gold": [
      2200,
      3200
    ],
    "fragments": {
      "r": [
        12,
        20
      ],
      "sr": [
        12,
        18
      ],
      "ssr": [
        4,
        4
      ]
    },
    "diamond": 6
  }
],
    slots: 4,                 // 同时开启上限
  },

  FIELDS: {
    ancient: { name: '圣坛花园', chapterTitle: '圣庭战场', short: '🏰 圣坛花园', tint: '#2ecc71', tintDark: '#1f8c5f',
      subtitle: '城墙防守 · 怪物攻城 · 圣坛裂痕', goldMult: 1.0, ammoCapMult: 1.0, dropAttr: 'mix', unlockWave: 0,
      // 首关后半段逐步缓和血量成长；普通、精英、小Boss及其召唤统一在出生时应用一次。
      lateEnemyHp: { startWave: 41, endWave: 59, startMultiplier: 1, endMultiplier: 0.7 },
      desc: ['城墙防守：怪物沿唯一路径推进，攻破城墙即失守',
             '无地形障碍，弹药上限与金币收益均为标准值',
             '20 / 40 / 60 波各有一场锁关 Boss 战'] },
    lava:    { name: '熔岩矿场', chapterTitle: '圣庭战场', short: '🌋 熔岩矿场', tint: '#e8603c', tintDark: '#8c2f18',
      subtitle: '高血精英 · 弹药上限 -30% · 攻击类碎片', goldMult: 1.0, ammoCapMult: 0.7, dropAttr: 'attack', unlockWave: 40, boardObstacles: [[1,3],[2,8],[3,3],[4,8]],
      desc: ['高血精英：怪物血量与护甲更厚，推进更慢但更难打穿',
             '弹药上限 -30%，棋盘固定 4 格熔岩障碍',
             '掉落偏向攻击类碎片，20 / 40 / 60 波各一场锁关 Boss 战'] },
    frost:   { name: '霜风峡谷', chapterTitle: '圣庭战场', short: '❄️ 霜风峡谷', tint: '#5dade2', tintDark: '#21618c',
      subtitle: '高速成群 · 每15波风场增速 · 控制类碎片', goldMult: 1.0, ammoCapMult: 1.0, dropAttr: 'control', unlockWave: 40, boardObstacles: [[1,4],[1,7],[3,4],[3,7]], windEvery: 15,
      desc: ['高速成群：数量多、移速快，每 15 波风场再抬一次速度',
             '棋盘固定 4 格冰障，掉落偏向控制类碎片',
             '20 / 40 / 60 波各一场锁关 Boss 战'] },
    abyss:   { name: '深渊裂隙', short: '🕳️ 深渊裂隙', tint: '#a86bff', tintDark: '#5c33a8',
      subtitle: '每10波诅咒 · 深度结算×2 · 全资源 · 计入排行', goldMult: 1.5, ammoCapMult: 1.0, dropAttr: 'all', unlockWave: 0, curseEvery: 10, deepMult: 2,
      desc: ['每 10 波叠加一层诅咒，敌人强度持续攀升',
             '深度结算 ×2，全资源掉落，成绩计入排行榜',
             'Boss 复用圣坛花园三只并按诅咒乘算'] },
    test:    { name: '测试战场', short: '🧪 测试战场', tint: '#a88bff', tintDark: '#6d5bd0',
      subtitle: '免三消直测塔技能效果', goldMult: 0, ammoCapMult: 1.0, dropAttr: 'none', unlockWave: 0,
      desc: ['免三消：跳过棋盘，直接摆塔测试技能与特效',
             '无金币收益、无掉落、无 Boss 战'] },
  },

  FIELD_ORDER: ['ancient', 'lava', 'frost', 'abyss', 'test'],

  LINE: {
    hp: 2000,                    // 防线血量（城墙）
  },

  ECONOMY: {
    goldPerWaveBase: 60,
    goldPerWaveEarlyStep: 6,
    goldPerWaveLateStep: 2,
    goldPerWaveKnee: 20,
    waveSilver(wave) {
      const w = Math.max(1, Math.floor(Number(wave) || 1));
      return this.goldPerWaveBase + Math.min(w - 1, this.goldPerWaveKnee - 1) * this.goldPerWaveEarlyStep
        + Math.max(0, w - this.goldPerWaveKnee) * this.goldPerWaveLateStep;
    },
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
    perDay: 6,                  // 每日碎片精选数量（改为碎片奖励，非整件）
    selectionVersion: 2,
    guaranteedBlue: 2,
    rarityWeight: {r:0.50,sr:0.35,ssr:0.15}, // 除保底蓝卡外，各栏位独立抽品质。
    shards: { r: 3, sr: 2, ssr: 1 },      // 各稀有度每日碎片数量
    price: { r: 750, sr: 1800, ssr: 3000 }, // 指定碎片价格，与随机混合宝箱区分。
    refreshHour: 0,             // 每日 0 点刷新
  },

  SHOP_CHEST: {
    // 奖励读取DEPTH_CHEST同级碎片规则，价格约为5个同级通关箱的平均金币。
    wood: { key:'wood', tier:'wood', name:'木质宝箱', icon:'📦', color:'#b68a62', price:1000, rarities:['r'], daily:5 },
    star: { key:'star', tier:'star', name:'星辉宝箱', icon:'✨', color:'#a8d8ff', price:13500, rarities:['ssr'], daily:1 },
    blue: { key:'blue', tier:'bronze', name:'青铜宝箱', icon:'📦', color:'#4aa3ff', price:2250, rarities:['sr'], daily:3 },
    purple: { key:'purple', tier:'silver', name:'白银宝箱', icon:'🎁', color:'#a86bff', price:4250, rarities:['sr'], daily:2 },
    gold: { key:'gold', tier:'gold', name:'黄金宝箱', icon:'👑', color:'#f7c948', price:7750, rarities:['ssr'], daily:1 },
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


// Active UR registry: the six Sanctum talent relics. Legacy field UR cards are retired.
for (const card of require('./config/red-relics.js').cards()) {
 module.exports.RELIC_RARITY[card.id]='ur';
 module.exports.RELIC_REWORK.RELIC_RARITY[card.id]='ur';
 module.exports.RELIC_RUN.ur.push({id:card.id,name:card.name,icon:'◆',desc:card.desc,star2:card.star2,star3:card.star3,talent:true,tower:card.tower,field:require('./config/red-relics.js').fieldOf(card.id)});
}

// Both configuration facades expose the same active UR list.
module.exports.RELIC_REWORK.RELIC_RUN.ur=module.exports.RELIC_RUN.ur;

// Presentation descriptors for introductory chapters; visibility remains gated by releaseReady.
for(const chapter of Object.values(require('./config/prologue.js').chapters)){
 module.exports.FIELDS[chapter.id]={name:chapter.name,short:chapter.name,chapterTitle:chapter.chapterTitle,tint:'#9bbd6d',tintDark:'#526d39',goldMult:1,ammoCapMult:1,dropAttr:'none',unlockWave:0,
 subtitle:chapter.maxWave+'波 · '+chapter.colors.length+'色选'+chapter.towerSlots+'塔',
 desc:[chapter.maxWave+'波教学章节 · '+chapter.colors.length+'色选'+chapter.towerSlots+'塔',chapter.features.branches?'开放技能分支与圣遗物':chapter.features.skills?'开放塔技能，暂不开放分支':'熟悉消除与建塔，暂不开放技能',chapter.rewards.firstClearRed?'首次通关赠随机红色圣遗物，解锁天赋':'通关解锁下一章'],
 icon:chapter.icon};
}
