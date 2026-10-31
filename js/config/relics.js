// 圣遗物定义、稀有度、升星与抽取规则。拥有数量和星级留在 Meta/Run 中。
'use strict';
module.exports = {
  STAR_UP: {
    cost: { 2: { shards: 10, gold: 500 }, 3: { shards: 30, gold: 2000, stone: 1 } },
    goldStarExtraStone: true, // 金级圣遗物升 3★ 额外需要星辉石
  },

  STAR3_ENABLED: true,          // 3★ 质变行为灰度开关：false 时效果不生效（图鉴仍可查看文本），true 时接入 effects 挂点（v1.16.104 全 112 条接入后统一开启）

  RELIC_PICK_WEIGHT: { r: 0.50, sr: 0.38, ssr: 0.12 },   // 三选一稀有度权重（设计文档 2.2：蓝50/紫38/金12）

  RELIC_REROLL: { costs: [200, 400, 800, 1600] },

  RELIC_FX: { cooldown: 0.8 },

  DUPLICATE_SHARDS: { r: 2, sr: 4, ssr: 8, ur: 10 },     // 重复获得已解锁圣遗物局末折算碎片 / 未解锁碎片直接解锁阈值（蓝/紫/金/红）

  RELIC_ATTR: {
    attack: ['cm_power', 'cm_speed', 'cm_combo'],
    // control = ice/poison/electric 全类 + 其余通用（cm_wall/cm_guard/cm_stasis/cm_freeze/cm_regen/cm_vault/cm_triple/cm_exp/cm_tome/cm_ammobox/cm_charge/cm_bounty）
  },

  RELIC_RARITY: {
    fire_seed: 'ssr', fire_inferno: 'ssr', fire_burnall: 'ssr',
    fire_core: 'sr', fire_chain: 'sr', fire_rain: 'sr', fire_skyfire: 'sr', fire_ember: 'sr', fire_wall: 'sr',
    ice_glacier: 'ssr', ice_avalanche: 'ssr', ice_frostburst: 'ssr',
    ice_forever: 'sr', ice_blizzard: 'sr', ice_domain: 'sr', ice_armor: 'sr', ice_wallshift: 'sr', ice_fog: 'sr',
    poison_all: 'ssr', poison_corrode: 'ssr', poison_source: 'ssr',
    poison_gland: 'sr', poison_essence: 'sr', poison_fen: 'sr', poison_nest: 'sr', poison_cloud: 'sr', poison_burst: 'sr',
    elec_super: 'ssr', elec_boost: 'ssr', elec_overload: 'ssr',
    elec_arc: 'sr', elec_chain: 'sr', elec_storm: 'sr', elec_magnet: 'sr', elec_domain: 'sr', elec_conduit: 'sr',
    boo_hunt: 'ssr', boo_cyclone: 'ssr', boo_tip: 'ssr',
    boo_return: 'sr', boo_blood: 'sr', boo_multi: 'sr', boo_eye: 'sr', boo_mark: 'sr', boo_wind: 'sr',
    can_war: 'ssr', can_armory: 'ssr', can_incend: 'ssr',
    can_heavy: 'sr', can_pierce: 'sr', can_airstrike: 'sr', can_minefield: 'sr', can_powder: 'sr', can_knock: 'sr',
    cm_power: 'ssr', cm_shuffle: 'ssr', cm_bounty: 'ssr',
    cm_vault: 'sr', cm_wall: 'sr', cm_ammobox: 'sr', cm_guard: 'sr', cm_stasis: 'sr', cm_freeze: 'sr',
    // v1.17.47 红色（ur）战场专属：不进随机池，只由对应战场 Boss 掉落
    ur_altar_rose: 'ur', ur_altar_seed: 'ur',
    ur_forge_heart: 'ur', ur_slag_hammer: 'ur',
    ur_frost_eye: 'ur', ur_wind_lantern: 'ur',
  },

  RELIC: {
    // 圣物表：掉落权重 / 升级金币基础与成长 / 每级效果描述
    list: [
      { id: 'gold',   name: '招财符',   icon: '💰', drop: 10, costBase: 200, costGrowth: 1.5, desc: (lv) => `战斗结算金币 +${20 * lv}%` },
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

  RELIC_RUN: {
    tower: {
      fire: [
        { id: 'fire_seed',   name: '火种',       icon: '🌱', desc: '灼烧每秒造成的伤害提升50%', star2: '灼烧每秒造成的伤害提升80%', star3: '灼烧目标死亡时留下火焰地面 3 秒，每秒 50% 攻击伤害' },
        { id: 'fire_seal',   name: '赤印',       icon: '🔴', desc: '灼烧叠加上限提升1层', star2: '灼烧叠加上限提升2层', star3: '灼烧叠满层时触发爆发：80% 攻击伤害，半径 60码' },
        { id: 'fire_core',   name: '熔心',       icon: '🫀', desc: '火柱造成的伤害提升50%', star2: '火柱造成的伤害提升80%', star3: '火柱命中后使目标受到的火伤 +15%，持续 5 秒（可叠 2 层）' },
        { id: 'fire_nuke',   name: '爆核',       icon: '🎆', desc: '大火球爆炸半径扩大30%', star2: '大火球爆炸半径扩大45%', star3: '大火球爆炸边缘敌人被击退 40码 并点燃' },
        { id: 'fire_chain',  name: '连锁爆破',   icon: '💢', desc: '点燃目标死亡时的爆炸概率提升至70%', star2: '点燃目标死亡时的爆炸概率提升至100%', star3: '连锁爆破的爆炸可传染：命中敌人 30% 概率带 1 层灼烧' },
        { id: 'fire_rain',   name: '焰雨',       icon: '🌧️', desc: '每次攻击射出的火球数量提升2枚', star2: '每次攻击射出的火球数量提升3枚', star3: '火球命中同一目标 3 次后，下次攻击必为三连火球' },
        { id: 'fire_wall',   name: '火墙增烈',   icon: '🧱', desc: '火焰墙持续时间延长3秒', star2: '火焰墙持续时间延长4.5秒', star3: '火墙内敌人每停留 1 秒，受到的伤害递增 10%（上限 +50%）' },
        { id: 'fire_skyfire', name: '天火',      icon: '☄️', desc: '每波火雨造成的伤害提升40%', star2: '每波火雨造成的伤害提升60%', star3: '火雨最后一波升级为天火一击：单点 120% 伤害' },
        { id: 'fire_forge',  name: '熔炉之息',   icon: '⚒️', desc: '火塔攻击间隔缩短15%', star2: '火塔攻击间隔缩短24%', star3: '攻速加成期间，每 5 次普攻附带一次免费火柱' },
        { id: 'fire_fuel',   name: '薪柴',       icon: '🪵', desc: '普攻附加灼烧的概率提升20%', star2: '普攻附加灼烧的概率提升30%', star3: '灼烧概率触顶（≥80%）时，多余的判定转为 +10% 灼烧伤害' },
        { id: 'fire_ember',  name: '余烬风暴',   icon: '💨', desc: '灼烧目标死亡时有25%概率再次爆炸', star2: '灼烧目标死亡时有40%概率再次爆炸', star3: '余烬爆炸留下 1 枚余烬弹，1 秒后自动射向最近敌人' },
        { id: 'fire_bounce', name: '火焰弹射',   icon: '🏓', desc: '普攻有25%概率额外发射一枚火球', star2: '普攻有40%概率额外发射一枚火球', star3: '弹射火球命中时 50% 概率返还 1 点能量' },
        { id: 'fire_inferno', name: '炼狱',      icon: '⚱️', desc: '所有灼烧类伤害提升25%', star2: '所有灼烧类伤害提升40%', star3: '场上每存在 1 个灼烧敌人，全塔火伤 +3%（上限 +45%）' },
        { id: 'fire_tongue', name: '火舌',       icon: '🔥', desc: '火焰墙长度延长50%', star2: '火焰墙长度延长80%', star3: '火墙命中塔攻击范围外的敌人时，伤害 ×1.5' },
        { id: 'fire_hasten', name: '燃尽加速',   icon: '⏩', desc: '火雨每波间隔缩短0.2秒', star2: '火雨每波间隔缩短0.4秒', star3: '火雨每波落地时，对处于灼烧状态的敌人额外引发一次小爆炸（50% 伤害，半径 80 码）' },
        { id: 'fire_burnall', name: '焚天',      icon: '🌇', desc: '火柱、火焰墙、火雨的冷却时间缩短20%', star2: '火柱、火焰墙、火雨的冷却时间缩短30%', star3: '火柱/火墙/火雨施放后 3 秒内，全塔攻速 +25%' },
      ],
      ice: [
        { id: 'ice_spike',    name: '霜刺',     icon: '🪡', desc: '冰缓的减速幅度提升10%', star2: '冰缓的减速幅度提升15%', star3: '冰缓的敌人被击杀时，减速光环扩散至周围 80码' },
        { id: 'ice_forever',  name: '永冻',     icon: '🧊', desc: '冰冻持续时间延长1秒', star2: '冰冻持续时间延长1.5秒', star3: '被冰冻超过 1.5 秒的敌人防御 -20%（冻得越久越脆）' },
        { id: 'ice_pierce',   name: '穿透凝冰', icon: '📌', desc: '冰锥穿透的敌人数量提升1名', star2: '冰锥穿透的敌人数量提升2名', star3: '冰锥贯穿 2 名以上敌人时，对最后一名敌人造成冰冻 1 秒' },
        { id: 'ice_blizzard', name: '暴雪',     icon: '🌨️', desc: '每次攻击射出的冰锥数量提升2枚', star2: '每次攻击射出的冰锥数量提升3枚', star3: '冰锥命中已冰缓的敌人时 30% 概率引发冰爆（60% 伤害，半径 80 码）' },
        { id: 'ice_crystal',  name: '冰晶',     icon: '💎', desc: '冰花造成的伤害提升40%', star2: '冰花造成的伤害提升60%', star3: '冰花爆炸后残留冰晶地面 2 秒，敌人经过减速 20%' },
        { id: 'ice_domain',   name: '冬域',     icon: '🌌', desc: '冬珠的作用范围扩大30%', star2: '冬珠的作用范围扩大45%', star3: '冬珠伤害命中冰缓的敌人时，将其冰缓转化为冰冻 0.5 秒（同一敌人 3 秒内仅触发一次）' },
        { id: 'ice_shard',    name: '碎冰强化', icon: '🧊', desc: '小碎冰造成的伤害提升50%', star2: '小碎冰造成的伤害提升80%', star3: '碎冰命中已有冰缓的敌人时伤害 ×1.5' },
        { id: 'ice_armor',    name: '冰甲',     icon: '🧥', desc: '冰盾抵御的伤害提升200点', star2: '冰盾抵御的伤害提升400点', star3: '冰盾破碎时向周围释放冰环，冻结敌人 1 秒' },
        { id: 'ice_marrow',   name: '寒髓',     icon: '💧', desc: '冰塔攻击间隔缩短15%', star2: '冰塔攻击间隔缩短24%', star3: '冰塔每冻结一个敌人，自身充能 +2 点能量' },
        { id: 'ice_extreme',  name: '极寒',     icon: '🥶', desc: '普攻造成冰缓的概率提升15%', star2: '普攻造成冰缓的概率提升20%', star3: '冰缓概率触顶时多余判定转为 0.3 秒冻结' },
        { id: 'ice_frostburst', name: '霜爆',   icon: '🌠', desc: '击杀冰冻敌人的爆炸范围扩大50%', star2: '击杀冰冻敌人的爆炸范围扩大80%', star3: '击杀冰冻敌人时引发冰爆（100% 伤害，半径 120 码），并将范围内所有敌人冻结 1 秒' },
        { id: 'ice_fog',      name: '冰雾',     icon: '☁️', desc: '普攻有20%概率额外减速目标周围敌人', star2: '普攻有30%概率额外减速目标周围敌人', star3: '冰雾残留 3 秒，域内敌人攻速 -20%' },
        { id: 'ice_glacier',  name: '冰川',     icon: '🏔️', desc: '所有减速效果的幅度提升15%', star2: '所有减速效果的幅度提升20%', star3: '敌人身上每存在 1 个减速类 debuff，其受到的减速效果 +8%（多 debuff 协同）' },
        { id: 'ice_wallshift', name: '冰墙裂变', icon: '🔄', desc: '冰盾生效期间城墙受到的伤害降低10%', star2: '冰盾生效期间城墙受到的伤害降低15%', star3: '冰盾生效期间，城墙每受到 100 点伤害，冰塔获得 1 点能量' },
        { id: 'ice_avalanche', name: '雪崩',    icon: '⛰️', desc: '冰花改为轰炸2个敌人', star2: '冰花改为轰炸3个敌人，必中血量最高的敌人', star3: '冰花落地后每 2 秒在原地再次爆炸，共追加 2 次，每次伤害为上一段的 80%' },
        { id: 'ice_condense', name: '凝霜',     icon: '⏳', desc: '冰锥造成的减速持续时间延长1秒', star2: '冰锥造成的减速持续时间延长1.5秒', star3: '冰缓持续时间延长 1 秒，且冰缓敌人受暴击率 +10%' },
      ],
      poison: [
        { id: 'poison_gland',  name: '毒腺',     icon: '🧬', desc: '中毒每秒造成的伤害提升30%', star2: '中毒每秒造成的伤害提升45%', star3: '中毒伤害的 20% 转化为城墙修复' },
        { id: 'poison_source', name: '瘟疫之源', icon: '🦠', desc: '中毒目标死亡时传染的敌人数量提升2个', star2: '中毒目标死亡时传染的敌人数量提升3个', star3: '传染时保留目标 50% 现有层数（无论是否触发继承）' },
        { id: 'poison_fen',    name: '腐沼',     icon: '🏞️', desc: '毒池范围扩大30%', star2: '毒池范围扩大45%', star3: '毒池边缘生成毒雾环，进出敌人各叠 1 层毒' },
        { id: 'poison_branch', name: '毒枝',     icon: '🪵', desc: '毒棒的攻击力提升50%', star2: '毒棒的攻击力提升80%', star3: '毒棒攻击附带 0.5 秒减速' },
        { id: 'poison_essence', name: '剧毒精华', icon: '🧪', desc: '中毒叠加上限提升2层', star2: '中毒叠加上限提升3层', star3: '毒满层的敌人死亡时毒液溅射，90码 内叠 2 层' },
        { id: 'poison_quick',  name: '速疫',     icon: '💉', desc: '瘟疫传染概率提升30%', star2: '瘟疫传染概率提升45%', star3: '瘟疫传染无人数上限（按范围判定）' },
        { id: 'poison_vine',   name: '缠毒',     icon: '🪢', desc: '毒藤缠绕持续时间延长1秒', star2: '毒藤缠绕持续时间延长1.5秒', star3: '被缠绕的敌人每被叠 1 层中毒，缠绕时间延长 0.5 秒（上限 +3 秒）' },
        { id: 'poison_miasma', name: '瘴毒',     icon: '🌫️', desc: '瘴气叠毒间隔缩短0.5秒', star2: '瘴气叠毒间隔缩短0.8秒', star3: '瘴气每叠 4 层毒引发一次小毒爆（30% 攻击伤害）' },
        { id: 'poison_fang',   name: '毒牙',     icon: '🦷', desc: '普攻造成中毒的概率提升15%', star2: '普攻造成中毒的概率提升20%', star3: '中毒概率触顶时多余判定转为 +1 层毒' },
        { id: 'poison_slow',   name: '缓毒',     icon: '🐌', desc: '中毒造成的减速幅度提升10%', star2: '中毒造成的减速幅度提升15%', star3: '中毒减速与冰缓/麻痹叠加时，总减速上限 +15%' },
        { id: 'poison_burst',  name: '毒爆连锁', icon: '🌀', desc: '中毒目标死亡时传染概率提升20%', star2: '中毒目标死亡时传染概率提升30%', star3: '传染链每跳一环，毒伤 +10%（链式增伤）' },
        { id: 'poison_corrode', name: '腐化',    icon: '🦴', desc: '中毒的敌人受到的伤害提升15%', star2: '中毒的敌人受到的伤害提升20%', star3: '中毒的敌人每移动 60 码，额外受到其最大生命值 2% 的真实伤害（对 Boss 单次上限 1%）' },
        { id: 'poison_nest',   name: '毒巢',     icon: '🕸️', desc: '每次召唤的毒棒数量提升1根', star2: '每次召唤的毒棒数量提升2根', star3: '毒棒消失时留下 2 秒小毒池（10%/秒）' },
        { id: 'poison_cloud',  name: '毒云',     icon: '🫧', desc: '毒池每秒额外叠加1层中毒', star2: '毒池每秒额外叠加2层中毒', star3: '毒池上的敌人每秒丢失 1 点能量（对 Boss 无效）' },
        { id: 'poison_spread', name: '蔓延',     icon: '🌾', desc: '毒藤的扩散范围扩大50%', star2: '毒藤的扩散范围扩大80%', star3: '蔓延路径也留毒痕，每秒 10% 伤害' },
        { id: 'poison_all',    name: '万毒',     icon: '🐍', desc: '所有中毒造成的伤害提升20%', star2: '所有中毒造成的伤害提升30%', star3: '敌人身上的中毒层数转化为「毒易伤」：每层受伤 +1%' },
      ],
      electric: [
        { id: 'elec_arc',     name: '电弧',     icon: '〰️', desc: '攻击连锁的敌人数量提升2个', star2: '攻击连锁的敌人数量提升3个', star3: '连锁命中 3 人以上时，最后一跳伤害不衰减' },
        { id: 'elec_strong',  name: '强麻',     icon: '😵', desc: '命中造成麻痹的概率提升15%', star2: '命中造成麻痹的概率提升20%', star3: '麻痹概率触顶时多余判定转为麻痹时长 +0.5 秒' },
        { id: 'elec_overload', name: '过载',    icon: '🪫', desc: '充能层数上限提升2层', star2: '充能层数上限提升3层', star3: '满层过载时下一发普攻必为双倍伤害' },
        { id: 'elec_chain',   name: '电链',     icon: '⛓️', desc: '极光电击分叉命中的敌人数量提升2个', star2: '极光电击分叉命中的敌人数量提升3个', star3: '极光电击的分叉电弧可再分叉一次（各 20% 伤害）' },
        { id: 'elec_storm',   name: '雷霆',     icon: '⛈️', desc: '雷暴电击的敌人数量提升2个', star2: '雷暴电击的敌人数量提升3个', star3: '雷暴击中麻痹的敌人时，将其麻痹向 90 码内 2 名敌人传导（各 1 秒）' },
        { id: 'elec_orb',     name: '电球',     icon: '🎾', desc: '扩散的电球数量提升2个', star2: '扩散的电球数量提升3个', star3: '电球游走路径留电痕 1 秒，触碰敌人受 10% 伤害' },
        { id: 'elec_fast',    name: '快充',     icon: '🚀', desc: '每层充能提供的攻速提升5%', star2: '每层充能提供的攻速提升10%', star3: '充能满层时释放过载脉冲：全塔攻速 +20%，持续 3 秒（触发后清空层数重新累计）' },
        { id: 'elec_magnet',  name: '磁力',     icon: '🧲', desc: '电磁场触发概率提升15%', star2: '电磁场触发概率提升20%', star3: '电磁场的微型连锁命中敌人后，向其 90 码内最多 2 名敌人跳跃（每跳 40% 伤害，可正常触发麻痹判定）' },
        { id: 'elec_light',   name: '电光',     icon: '🌟', desc: '电塔攻击间隔缩短15%', star2: '电塔攻击间隔缩短24%', star3: '攻速加成期间连锁数量 +1' },
        { id: 'elec_conduit', name: '传导',     icon: '➿', desc: '连锁伤害衰减降低20%', star2: '连锁伤害衰减降低30%', star3: '连锁衰减降为 0 时，每跳额外 +5% 伤害' },
        { id: 'elec_spread',  name: '麻痹扩散', icon: '🫠', desc: '被麻痹敌人传导麻痹的概率提升15%', star2: '被麻痹敌人传导麻痹的概率提升20%', star3: '麻痹传导链最多 3 跳（原 1 跳），每跳概率衰减 5%' },
        { id: 'elec_static',  name: '静电',     icon: '🪶', desc: '被麻痹敌人的减速幅度提升15%', star2: '被麻痹敌人的减速幅度提升20%', star3: '被麻痹敌人死亡时释放静电，麻痹周围敌人 0.8 秒' },
        { id: 'elec_domain',  name: '雷域',     icon: '🌐', desc: '雷暴间隔缩短1.5秒', star2: '雷暴间隔缩短2.4秒', star3: '雷暴优先命中血量最高的敌人' },
        { id: 'elec_super',   name: '超导',     icon: '🔗', desc: '所有连锁类效果的目标数量提升1个', star2: '所有连锁类效果的目标数量提升2个', star3: '全部连锁类效果的伤害衰减归零，目标数 +1' },
        { id: 'elec_boost',   name: '闪电链增强', icon: '🪝', desc: '连锁造成的伤害提升20%', star2: '连锁造成的伤害提升30%', star3: '连锁每跳一次，该敌人受到的后续伤害 +5%（持续 3 秒）' },
        { id: 'elec_surge',   name: '电涌',     icon: '💦', desc: '普攻有20%概率额外产生一次小电弧', star2: '普攻有30%概率额外产生一次小电弧', star3: '小电弧命中时 20% 概率填充 1 点能量' },
      ],
      boomerang: [
        { id: 'boo_return',   name: '强返',     icon: '🌀', desc: '折返段造成的伤害提升40%', star2: '折返段造成的伤害提升60%', star3: '折返镖命中同一目标第二次时伤害 ×1.5' },
        { id: 'boo_blood',    name: '血刃',     icon: '🩸', desc: '流血每秒造成的伤害提升40%', star2: '流血每秒造成的伤害提升60%', star3: '流血的敌人死亡时喷溅血液：80 码内敌人附加 1 层流血' },
        { id: 'boo_multi',    name: '镖群',     icon: '📍', desc: '每次投掷的飞镖数量提升2枚', star2: '每次投掷的飞镖数量提升3枚', star3: '多镖呈环状回收时命中路径上的所有敌人' },
        { id: 'boo_catch',    name: '疾接',     icon: '🏃', desc: '接镖后下一镖造成的伤害提升15%', star2: '接镖后下一镖造成的伤害提升20%', star3: '接镖瞬间 0.3 秒无敌帧（对精英投射物有效）' },
        { id: 'boo_hunt',     name: '猎心',     icon: '🎯', desc: '被标记敌人受到的伤害提升12%', star2: '被标记敌人受到的伤害提升15%', star3: '标记满层的敌人死亡时，标记转移至最近的敌人并保留全部层数' },
        { id: 'boo_eye',      name: '风暴眼',   icon: '👁️', desc: '风暴镖每枚飞镖造成的伤害提升25%', star2: '风暴镖每枚飞镖造成的伤害提升40%', star3: '风暴镖中心的敌人每秒受到 15% 额外伤害' },
        { id: 'boo_bounce',   name: '弹力',     icon: '🏀', desc: '弹力镖反弹次数提升5次', star2: '弹力镖反弹次数提升6次', star3: '弹力镖每次反弹伤害 +5%（最多 +50%）' },
        { id: 'boo_trail',    name: '长痕',     icon: '🪁', desc: '风痕持续时间延长1秒', star2: '风痕持续时间延长1.5秒', star3: '风痕命中的敌人附加 1 层标记（持续 5 秒，需学习猎手标记技能）' },
        { id: 'boo_spin',     name: '回旋',     icon: '🛞', desc: '飞镖飞行速度提升20%', star2: '飞镖飞行速度提升30%', star3: '飞镖速度提升使命中率提高：Miss 补偿为 +10% 伤害' },
        { id: 'boo_bleed',    name: '放血刃',   icon: '🪒', desc: '普攻造成流血的概率提升15%', star2: '普攻造成流血的概率提升20%', star3: '流血概率触顶时多余判定转为流血时长 +1 秒' },
        { id: 'boo_mark',     name: '追猎',     icon: '🐾', desc: '标记叠加上限提升2层', star2: '标记叠加上限提升3层', star3: '标记的敌人被其他塔击杀时，返还 1 点能量' },
        { id: 'boo_cyclone',  name: '旋风',     icon: '🥏', desc: '风暴镖每圈飞镖数量提升1枚', star2: '风暴镖每圈飞镖数量提升2枚', star3: '风暴镖持续时间翻倍，结束时原地爆炸（150% 伤害，半径 140 码）' },
        { id: 'boo_blade',    name: '飞刃',     icon: '✂️', desc: '每次射出的弹力镖数量提升1枚', star2: '每次射出的弹力镖数量提升2枚', star3: '弹力镖消失时 30% 概率分裂为 2 枚小镖' },
        { id: 'boo_wind',     name: '风刃',     icon: '🍃', desc: '风痕每秒造成的伤害提升30%', star2: '风痕每秒造成的伤害提升45%', star3: '风痕叠加时伤害取最高值 +30%/层（上限 3 层）' },
        { id: 'boo_tip',      name: '镖尖',     icon: '🔺', desc: '所有飞镖造成的伤害提升15%', star2: '所有飞镖造成的伤害提升20%', star3: '所有飞镖无视 20% 护甲（对高防怪与 Boss 质变）' },
        { id: 'boo_speed',    name: '疾风回旋', icon: '💨', desc: '回旋镖攻击间隔缩短10%', star2: '回旋镖攻击间隔缩短15%', star3: '攻速加成期间接镖 15% 概率不耗能量' },
      ],
      cannon: [
        { id: 'can_heavy',   name: '重爆',     icon: '🧨', desc: '重炮爆炸范围扩大30%', star2: '重炮爆炸范围扩大45%', star3: '重炮爆炸中心 40码 内伤害 ×1.5（近距离惩罚强化）' },
        { id: 'can_quake',   name: '震地',     icon: '🗿', desc: '爆炸击退概率提升20%', star2: '爆炸击退概率提升30%', star3: '击退的敌人撞墙时受到 20% 伤害' },
        { id: 'can_pierce',  name: '穿透',     icon: '➡️', desc: '炮弹爆炸后弹片贯穿的敌人数量提升2个', star2: '炮弹爆炸后弹片贯穿的敌人数量提升3个', star3: '弹片贯穿改为贯穿路径上所有敌人（无人数上限），每多贯穿 1 名伤害 -10%（下限 40%）' },
        { id: 'can_double',  name: '双发',     icon: '🥁', desc: '双发齐射概率提升20%', star2: '双发齐射概率提升30%', star3: '双发的第二发必定命中血量最低的敌人' },
        { id: 'can_airstrike', name: '空袭',   icon: '✈️', desc: '每轮炮火支援发射的炮弹数量提升2发', star2: '每轮炮火支援发射的炮弹数量提升3发', star3: '炮火支援落点 20% 概率二次轰炸（40% 伤害）' },
        { id: 'can_minefield', name: '雷场',   icon: '🚧', desc: '每次抛投的地雷数量提升2颗', star2: '每次抛投的地雷数量提升3颗', star3: '地雷被引爆时，90 码内的其他地雷共鸣引爆（造成 50% 伤害，可继续连锁）' },
        { id: 'can_turret',  name: '炮群',     icon: '🗼', desc: '每次部署的炮台数量提升1门', star2: '每次部署的炮台数量提升2门', star3: '多门炮台同时存在时，每门伤害 +10%/门' },
        { id: 'can_armory',  name: '弹药库',   icon: '🧰', desc: '能量库上限提升100点', star2: '能量库上限提升200点', star3: '能量溢出时转化为 5% 暴击率（上限 +25%）' },
        { id: 'can_powder',  name: '火药',     icon: '💣', desc: '炮塔造成的伤害提升20%', star2: '炮塔造成的伤害提升30%', star3: '炮塔每次命中积攒 1 层「火药热度」，累计 25 层后下一发炮弹为过热弹（200% 伤害，爆炸半径 +30%），随后清零' },
        { id: 'can_rapid',   name: '速射',     icon: '⏱️', desc: '炮塔攻击间隔缩短12%', star2: '炮塔攻击间隔缩短15%', star3: '速射期间每 10 次攻击免费 1 发（不耗能量）' },
        { id: 'can_knock',   name: '震烈',     icon: '🌪️', desc: '击退距离提升40%', star2: '击退距离提升60%', star3: '击退打断敌人攻击动作（对远程怪质变）' },
        { id: 'can_fireline', name: '火线',    icon: '➖', desc: '弹片贯穿造成的伤害提升30%', star2: '弹片贯穿造成的伤害提升45%', star3: '贯穿路径留下火线 1.5 秒，每秒 15% 伤害' },
        { id: 'can_incend',  name: '燃烧弹',   icon: '🕯️', desc: '炮弹落地时有30%概率点燃敌人', star2: '炮弹落地时有45%概率点燃敌人', star3: '炮弹爆炸 100% 引燃敌人，被点燃的敌人死亡时爆炸（96% 伤害，半径 100 码）' },
        { id: 'can_reinforce', name: '增援',   icon: '🚁', desc: '炮台持续时间延长2秒', star2: '炮台持续时间延长3秒', star3: '炮台消失时返还 2 点能量' },
        { id: 'can_mine',    name: '地雷强化', icon: '🎆', desc: '地雷造成的伤害提升50%', star2: '地雷造成的伤害提升80%', star3: '地雷持续 20 秒未被触发时自动引爆，造成 150% 伤害' },
        { id: 'can_war',     name: '军火之王', icon: '👑', desc: '所有爆炸造成的伤害提升20%', star2: '所有爆炸造成的伤害提升30%', star3: '每次爆炸为全塔 +1% 攻击（本局内叠加，上限 +30%）' },
      ],
    },
    common: [
      { id: 'cm_triple',    name: '三消之力', icon: '🧩', desc: '每次三消获得的经验提升30%', star2: '每次三消获得的经验提升45%', star3: '经验加成期间，连锁 ×2 以上时经验再 +50%' },
      { id: 'cm_vault',     name: '金库',     icon: '🏦', desc: '每波结束获得的银币提升30%', star2: '每波结束获得的银币提升45%', star3: '每波结束时，若本波城墙未受到伤害，银币收益额外 +30%' },
      { id: 'cm_wall',      name: '城墙加固', icon: '🏯', desc: '城墙血量提升20%', star2: '城墙血量提升30%', star3: '城墙每损失 10% 最大血量，全塔攻击 +1%（背水：最高 +10%）' },
      { id: 'cm_ammobox',   name: '弹药箱',   icon: '🎒', desc: '每次三消充能的能量数量提升5点', star2: '每次三消充能的能量数量提升10点', star3: '三消充能溢出时 50% 概率存入备用能量库（上限 20 点）' },
      { id: 'cm_charge',    name: '全局充能', icon: '⚙️', desc: '每次三消为全局技能充能的数量提升40%', star2: '每次三消为全局技能充能的数量提升60%', star3: '全局技能充能满时，溢出部分转为 10% 技能伤害加成' },
      { id: 'cm_speed',     name: '攻速戒指', icon: '💍', desc: '所有塔的攻击间隔缩短10%', star2: '所有塔的攻击间隔缩短15%', star3: '攻速加成对全局技能冷却同样生效 -10%' },
      { id: 'cm_power',     name: '力量符',   icon: '💪', desc: '所有塔造成的伤害提升15%', star2: '所有塔造成的伤害提升20%', star3: '战斗中每达成一次 4 连消，全塔伤害永久 +0.5%（本局，上限 +15%）' },
      { id: 'cm_exp',       name: '经验之心', icon: '❤️', desc: '击杀怪物获得的经验提升30%', star2: '击杀怪物获得的经验提升45%', star3: '升级时 20% 概率返还本级经验的 50%' },
      { id: 'cm_guard',     name: '减伤护符', icon: '🛡️', desc: '城墙受到的伤害降低10%', star2: '城墙受到的伤害降低15%', star3: '受到单次超过城墙最大血量 10% 的伤害时，超出部分减免 50%' },
      { id: 'cm_regen',     name: '生命回复', icon: '💊', desc: '每波结束城墙回复5%生命', star2: '每波结束城墙回复10%生命', star3: '回复溢出时转化为护盾（上限 10% 最大血量）' },
      { id: 'cm_combo',     name: '连锁反应', icon: '🎰', desc: '三消触发4连的概率提升10%', star2: '三消触发4连的概率提升15%', star3: '连锁 ≥3 时掉落 1 枚随机色特殊方块' },
      { id: 'cm_stasis',    name: '时间停滞', icon: '🕰️', desc: '怪物移动速度降低10%', star2: '怪物移动速度降低15%', star3: '减速效果对 Boss 生效 50%（原为无效/减半，按现网）' },
      { id: 'cm_freeze',    name: '冻结时刻', icon: '⏸️', desc: '每波首个敌人被冰冻3秒', star2: '每波首个敌人被冰冻6秒', star3: '每波首个敌人被冻结时，冻结波及其后 60 码内的 2 名敌人（各冻结 2 秒）' },
      { id: 'cm_bounty',    name: '赏金猎人', icon: '🪙', desc: '精英与Boss宝箱掉落概率提升50%', star2: '精英与Boss宝箱掉落概率提升80%', star3: '连续 3 波不掉宝箱时，第 4 波必掉' },
      { id: 'cm_tome',      name: '智慧典籍', icon: '📖', desc: '升级所需经验降低10%', star2: '升级所需经验降低15%', star3: '经验降低触底后，多余判定转为升级时全塔 3 秒攻速 +20%' },
      { id: 'cm_shuffle',   name: '战术转移', icon: '♻️', desc: '每波获得1次免费洗牌', star2: '每波获得2次免费洗牌', star3: '免费洗牌 +1 次，且洗牌后 2 秒内消除伤害 ×1.3' },
    ],
    /**
     * v1.17.47 红色（ur）战场专属圣遗物 —— 设计稿 §16.5（每场 2 件，共 6 件）。
     * 定位：只由该战场 Boss 掉落（20 波 25% / 40 波 40% / 60 波必掉），不进任何随机池：
     *   randomShardId / randomShardCardId / 三选一池都只扫 RELIC_RUN.tower + RELIC_RUN.common，
     *   本组独立挂在 RELIC_RUN.ur 下，天然不会被抽到。
     * 当前状态：效果未接入战斗（掉率与效果挂点待做）；v1.17.48 起图鉴按普通稀有度规则处理——
     *   未获得只显示问号占位，名称与来源在「主页战场卡 → 战场说明」里的专属掉落区公布。
     */
    ur: [
      { id: 'ur_altar_rose',    name: '裂坛玫瑰', icon: '🌹', field: 'ancient', desc: '对处于护盾/减伤状态的目标，伤害提升25%', star2: '对处于护盾/减伤状态的目标，伤害提升40%', star3: '目标处于减伤/护盾状态时，你的伤害无视其护甲' },
      { id: 'ur_altar_seed',    name: '未凋之种', icon: '🌱', field: 'ancient', desc: '每击杀 1 只召唤物，全塔伤害 +2%（本波，上限 +20%）', star2: '每击杀 1 只召唤物，全塔伤害 +3%（本波，上限 +30%）', star3: '召唤物死亡处留下种子，3 秒后绽放为友方藤蔓：90 码内每秒 40% 攻击伤害，持续 4 秒' },
      { id: 'ur_forge_heart',   name: '熔心炉',   icon: '⚒️', field: 'lava', desc: '能量库上限提升15%', star2: '能量库上限提升25%', star3: '能量库上限提升35%；能量溢出转为「熔芯」层数，每层全塔伤害 +2%，上限 20 层' },
      { id: 'ur_slag_hammer',   name: '碎渣重锤', icon: '🔨', field: 'lava', desc: '所有伤害无视 15% 护甲', star2: '所有伤害无视 20% 护甲', star3: '无视 35% 护甲；对护甲 ≥40% 的目标额外 +15% 伤害' },
      { id: 'ur_frost_eye',     name: '霜风之眼', icon: '👁️', field: 'frost', desc: '所有控制类效果时长提升20%', star2: '所有控制类效果时长提升30%', star3: '被减速或冰冻的敌人受到伤害 +12%；其中 Boss 额外 +6%' },
      { id: 'ur_wind_lantern',  name: '风灯',     icon: '🏮', field: 'frost', desc: '敌人移速每高于基准 10%，其受到伤害 +3%（上限 +15%）', star2: '每 10% → +4%（上限 +20%）', star3: '移速高于基准 50% 的敌人死亡时爆炸：60% 伤害，半径 90 码' },
    ],
  },

};
