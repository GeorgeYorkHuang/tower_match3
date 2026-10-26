/**
 * combat.js —— 真实战斗系统（A1 技能行为差异化）
 * =====================================================================
 * 取代 main.js 中「totalDps()×dt 从最靠城墙敌人抽象削血」的旧机制：
 *   - 每座塔按自己的 atkInterval 独立攻击（真实节奏、真实目标、真实弹道）
 *   - 单次攻击伤害 dmg = towerDps(key) × atkInterval(key)，保持既有 DPS 口径
 *   - 每次命中按塔类型 + 已激活技能执行真实行为：
 *       火：点燃 DoT（炽焰/炽热/余烬）/ 灼烧 / 火柱 / 大火球 / 爆燃（几率引爆+灼烧爆裂）/ 多重火球 / 烈焰墙 / 火雨（区域多段）
 *       冰：寒霜 / 冰冻 / 冰穿刺 / 多重冰锥 / 冰花 / 冬珠 / 碎冰 / 冰墙
 *       毒：剧毒 DoT / 扩散 / 毒爆 / 腐蚀 / 毒雾 / 瘟疫 / 致死 / 毒性强化
 *       电：连锁弹跳 / 麻痹 / 过载 / 极光电击 / 雷暴 / 活电 / 充能 / 电磁场
 *       回旋镖：穿透 / 折返增伤 / 飞距 / 攻速 / 回收 / 双镖 / 暴击 / 范围回旋
 *       炮：溅射 / 重击 / 穿透弹 / 炮台座 / 震击 / 引信 / 弹幕 / 阵地加固
 *   - 敌人状态：灼烧/中毒 DoT、冰冻、麻痹、减速、腐蚀、连击/过载层数
 *   - 协同：爆燃×毒爆、冰冻×连锁、炮溅射×火溅射（爆炸/连锁增伤）
 *
 * 运行环境：微信小游戏（CommonJS），纯逻辑无渲染；视觉仍由 game.fx 表现。
 */
const CONFIG = require('./config.js');

/* =====================================================================
 * SKILL_NUM —— 技能行为数值表（重构 v1.16.43）
 * 档位数组约定：arr[lv]，lv = 分支等级（0=未学，取 arr[0]，通常为 0/无效值）。
 * 展示文案在 config.js EFFECT_POOLS（desc/a/b/c）；此处是**行为数值**单源，
 * combat 内一律经 SKILL_NUM 取数，禁止散落魔法数组。
 * ===================================================================== */
const SKILL_NUM = {
  fire: {
    '灼烧':   { burst: [0, 0.15, 0.30, 0.50],      // B 燃尽：每跳爆炸概率
                trueFire: [0, 0.10, 0.20, 0.30],   // C 真火：每层灼烧目标受伤加成
                burnRadius: [0, 30, 60, 90] },     // B 燃尽：爆炸范围
    '点燃':   { emberDmg: [0, 0.20, 0.40, 0.60],   // C 余烬：灼烧伤害加成
                heatTtl: [0, 2, 3, 4],             // B 炽热：灼烧时长
                emberTtlCut: [0, 0.5, 1, 1.5] },   // C 余烬：灼烧时长缩减
    '爆燃':   { radius: [0, 0.2, 0.4, 0.6],        // B 扩张：爆炸范围
                dmg: [0, 0.3, 0.6, 0.9] },         // A 爆裂：爆炸伤害
    '多重火球': { condense: [0, 0.15, 0.30, 0.50], // B 凝火：火球增伤
                scatterSplit: [0, 3, 4, 5] },      // C 散射：分裂小火球数
    '烈焰墙': { range: [0, 0.2, 0.4, 0.6],         // B 引燃：墙范围
                dmg: [0, 0.2, 0.4, 0.6],           // A 神火：墙伤害
                slow: [0, 0.1, 0.2, 0.3] },        // C 迟滞：墙内减速
    '火雨':   { radius: [0, 0.2, 0.4, 0.6],        // C 扩张：火雨圈范围
                segDmg: [0, 0.4, 0.8, 1.2] },      // B 猛烈：每段伤害
  },
  ice: {
    '寒霜':   { slowMult: [0, 0.1, 0.2, 0.3],      // C 深寒：减速幅度
                ttl: [0, 1, 2, 3] },               // B 凝结：冰缓时长
    '冰冻':   { prob: [0, 0.15, 0.30, 0.45],       // A 冻结：冰冻概率
                dur: [0, 1, 1.5, 2],               // B 深结：冻结时长
                shatter: [0, 0.30, 0.40, 0.50] },  // C 碎冰：击杀爆炸伤害
    '冰穿刺': { pierceDmg: [0, 0.3, 0.6, 0.9],     // B 透射：穿透后伤害
                cone: [0, 0.3, 0.4, 0.5] },        // C 冰霜透射：身后扇形伤害
    '多重冰锥': { swarm: [0, 10, 14, 18] },        // C 增殖：超小型冰锥数
    '碎冰':   { dmg: [0, 0.15, 0.30, 0.45],        // B 碎劲：碎冰伤害
                frz: [0, 0.05, 0.10, 0.15] },      // C 冻结：命中冻结概率
    '冰花':   { n: [0, 1, 2, 3],                   // C 繁花：冰花数量
                dmg: [0, 0.2, 0.4, 0.6],           // B 霜力：冰花伤害
                radius: [0, 0.2, 0.4, 0.6] },      // A 扩张：爆炸范围
    '冬珠':   { slowMult: [0, 0.2, 0.3, 0.4],      // A 寒域：范围减速
                radius: [0, 0.2, 0.4, 0.6],        // B 扩张：范围
                tickI: [0, 0.7, 0.55, 0.4] },      // C 凝华：伤害频率
    '冰墙':   { ttl: [0, 2, 4, 6],                 // A 凝壁：冰盾持续
                reflect: [0, 0.3, 0.6, 0.9],       // B 霜反：反伤
                heal: [0, 50, 100, 150] },         // C 融暖：结束回血
  },
  poison: {
    '剧毒':   { freq: [0, 0.1, 0.2, 0.3] },        // C 频发：每跳间隔缩减
    '毒性强化': { ttlAdd: [0, 2, 4, 6] },          // B 延毒：中毒时长
    '瘟疫':   { iv: [0, 2, 1.7, 1.5, 1.3],         // A 快疫：传染判定间隔
                prob: [0, 0.30, 0.45, 0.60] },     // C 强疫：传染概率
    '瘴气':   { dotMult: [0, 1.2, 1.3, 1.4],       // B 浓瘴：中毒 DoT 伤害倍率
                atkCut: [0, 0.2, 0.35, 0.5] },     // C 弱化：瘴内中毒敌攻击削减
    '毒爆':   { inherit: [0, 0.30, 0.40, 0.50],    // B 继承：附带死亡层数概率
                swampTtl: [0, 4, 5, 6],            // C 毒沼：持续时间
                swampR: 60, swampSlow: 0.25,       // C 毒沼：半径 / 泥沼减速
                spreadP: 0.30 },                   // 基础：传染 30% 概率
  },
  electric: {
    '极光电击': { period: 8 },                     // 周期固定 8s（v1.16.51 分叉范围/数量由 A/C 分支内联）
    '过载':   { deton: [0, 0.20, 0.30, 0.40] },    // A 弹载：消耗层数伤害
    '麻痹':   { cond: [0, 0.20, 0.30, 0.40] },     // C 导电：邻近传导概率
  },
  boomerang: {
    '接镖':   { catchCd: 0.5, catchRegain: 0.30 },  // 基础：未学接镖时接镖后冷却 / B 回能概率（v1.16.42）
    '猎手标记': { markDur: 5,                      // 基础：标记持续秒
                deep: [0, 0.08, 0.16, 0.24] },     // A 深镖：受标记敌人受伤加成
    '风痕':   { slow: [0, 0.10, 0.20, 0.30] },     // C 卷痕：风痕内减速
  },
  cannon: {
    '贯穿弹': { slow: [0, 0.15, 0.30, 0.45] },     // C 贯透：被贯穿减速
    '地雷阵': { shards: [0, 5, 6, 7],              // C 碎雷：弹片数
                shardR: 130, shardDmg: 0.30, shardSpeed: 500 }, // C 碎雷：范围/每片伤害/飞行速度
  },
};

/** 敌人状态初始化（wave.pushEnemy 时调用） */
function initEnemyState(e) {
  e.dots = [];            // [{type:'burn'|'poison', dps, ttl, stack, maxStack, tickT, src}]
  e.frozen = 0;           // 冻结剩余秒（不能移动/攻击）
  e.paralyzed = 0;        // 麻痹剩余秒（不能攻击）
  e.slow = null;          // {mult, ttl} 减速
  e.corrode = null;       // {mult, ttl} 受伤加深
  e.overload = null;      // {n, ttl} 电过载层数
  e.hitCount = 0;         // 累计命中次数（电充能）
  e.lastDmgKey = null;    // 最近一次伤害来源塔
  // 攻城参数默认值兜底（手造敌人/旧数据）
  if (e.attack === undefined) e.attack = CONFIG.ENEMY.attack.normal;
  if (e.attackInterval === undefined) e.attackInterval = CONFIG.ENEMY.attackInterval.normal;
  if (e.attackT === undefined) e.attackT = 0;
  // 血条延迟尾条：直接伤害瞬间掉血后尾条缓慢收缩（区分「直接伤一跳」与「持续伤平滑掉」）
  if (e.delayHp === undefined) e.delayHp = e.maxHp || e.hp;
  return e;
}

class CombatSystem {
  constructor(game) {
    this.game = game;
    this.shots = [];        // 飞行中弹道（命中在 dur 结束时结算）
    this.delayed = [];      // 延迟爆炸（炮引信）
    this.timers = {};       // 周期技计时
    this.atkTimers = {};    // 每塔攻击计时
    this.kills = {};        // 每塔击杀计数（回收/充能联动）
    this.bWait = {};        // 回旋镖：镖在飞行中 → true（接回后才能投下一个）
    this.bCatch = {};       // v1.16.42 回旋镖接镖冷却计时（未学接镖：接镖后 0.5s 才投下一镖）
    this._nextDmg = {};     // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
  }

  reset() {
    this.shots = [];
    this.delayed = [];
    this.timers = {};
    this.atkTimers = {};
    this.kills = {};
    this.bWait = {};
    this.bCatch = {};          // v1.16.42 回旋镖接镖冷却计时
    this._nextDmg = {};        // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
    this.groundDots = [];      // 火·火柱余烬 / 毒·毒池·毒沼：地面持续区域
    this.frostOrbs = [];       // 冰·冬珠：持续冰霜之球
    this.poisonSticks = [];    // 毒·毒棒：独立攻击的召唤物（v1.15）
    this.mines = [];           // 炮·地雷阵（v1.16）
    this.turrets = [];         // 炮·炮台（v1.16）
    this.storms = [];          // 回旋镖·风暴镖（v1.16）
    this.windTrails = [];      // 回旋镖·风痕（v1.16）
    // v1.16.38 同步清理战斗实体 fx（弹道/风暴镖/炮台/地雷/地面持续区），避免切塔/清场/重开后幽灵残留
    const g = this.game;
    if (g && g.fx) {
      const entityFx = ['shot', 'cyclone', 'turret', 'mine', 'groundDot', 'frostOrb', 'poisonStick'];
      g.fx = g.fx.filter((f) => !entityFx.includes(f.type));
    }
  }

  /* ---------- 工具 ---------- */
  /** 出战塔对象（v1.16.4：测试战场单塔模式——仅 slotOrder 内塔生效，旧塔周期技/技能链立即停用） */
  tower(key) {
    const t = this.game.run.effects.tower(key);
    const order = this.game.run.slotOrder;
    if (t && order && order.length && !order.includes(key)) return null;
    return t;
  }
  /** 技能数值等级（v1.16.5：统一口径 = 激活?1+分支:0；与原版激活 1 档/分支逐级+1 一致，满级 4 档） */
  lv(key, name) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef ? ef.level : 0;
  }
  /** 分支等级（A/B/C）——分支独立成长（v1.13 火塔重构起：分支加成按各自分支等级） */
  branchLv(key, name, br) {
    const b = this.tower(key);
    if (!b) return 0;
    const ef = b.pool.find((e) => e.name === name);
    return ef && ['A', 'B', 'C'].includes(br) ? (ef.branches[br] || 0) : 0;
  }
  has(key, name) { return this.lv(key, name) > 0; }
  enemies() { return this.game.enemies; }
  ly() { return this.game.ly; }

  /** 塔当前攻击间隔（攻速类技能叠加） */
  interval(key) {
    const cfg = CONFIG.TOWERS[key];
    let iv = cfg.atkInterval;
    // 冰·低温全塔：全塔 +10%/级，冰塔额外 +15%/级
    const chill = Math.max(this.lv('ice', '低温全塔'), 0);
    if (chill > 0) iv /= (1 + 0.10 * chill + (key === 'ice' ? 0.15 * chill : 0));
    // 回旋镖·接镖 A 已改为飞行速度提升（v1.16.5，见发射段 bDur），不再提供攻速加成
    // 炮·双管齐射 C 速射：+12%/级（v1.16.14 军火库重做后不再提供攻速）
    if (key === 'cannon') iv /= (1 + 0.12 * this.branchLv('cannon', '双管齐射', 'C'));
    // 电·充能：命中累计攻速 +5%/层（上限 5×lv 层；A 扩容上限+5/级、B 快充每层+10%、C 共享全塔）
    const charge = this.lv('electric', '充能');
    if (charge > 0 && (key === 'electric' || this.branchLv('electric', '充能', 'C') > 0)) {
      const e = this.tower('electric');
      const cap = 5 * charge + 5 * this.branchLv('electric', '充能', 'A');
      const layers = Math.min(cap, e ? e._chargeLayers || 0 : 0);
      if (layers > 0) iv /= (1 + (0.05 + 0.05 * this.branchLv('electric', '充能', 'B')) * layers);
    }
    // 圣物·疾风戒：全塔攻速 +8%/级
    const m = this.game.meta;
    const spdLv = (m && m.relicBonus && m.relicBonus().speed) || 0;
    if (spdLv > 0) iv /= (1 + 0.08 * spdLv);
    // v1.16.78 攻速戒指（局内圣遗物）：全塔攻击间隔缩短 N%（按星级）
    const spdR = this.relicVal('cm_speed');
    if (spdR > 0) iv /= (1 + spdR / 100);
    // v1.16.77 局内商店·攻速强化：+15%/层（本局临时）
    const store = this.game.run.storeBuff ? this.game.run.storeBuff() : { spd: 0 };
    if (store.spd > 0) iv /= (1 + 0.15 * store.spd);
    // v1.16.96 智慧典籍3★：升级触发全塔 3 秒攻速 +20%（窗口秒数由 run._tomeBuffTtl 承载，combat.update 递减）
    if (this.game.run._tomeBuffTtl > 0) iv /= 1.2;
    // v1.16.96 焚天3★：火柱/火墙/火雨施放后 3 秒内全塔攻速 +25%
    if (this.game.run._burnallTtl > 0) iv /= 1.25;
    return Math.max(0.15, iv);
  }

  /** 塔当前射程（射程/技能叠加） */
  range(key) {
    const cfg = CONFIG.TOWERS[key];
    return Math.max(60, cfg.range - 50);   // v1.16.21：全塔射程统一缩小 50px（普攻/技能同口径）
  }

  /** v1.16.78 圣遗物当前星级数值（1★=desc / 2★=star2 文本最后数字）；未获得返回 0 */
  relicVal(id) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.relicRun || run.relicRun(id) <= 0) return 0;
    const star = (g.meta && g.meta.starOf) ? g.meta.starOf(id) : 1;
    return CONFIG.relicNum(id, star);
  }

  /** v1.16.78 塔圣遗物「伤害类」乘区：desc 与 star2 均描述伤害 → 该塔所有伤害（普攻+技能同源）×(1+ΣN%) */
  relicTowerDmg(key) {
    const g = this.game;
    const run = g && g.run;
    if (!run || !run.runRelic) return 0;
    const cat = CONFIG.RELIC_RUN.tower[key];
    if (!cat) return 0;
    let sum = 0;
    cat.forEach((d) => {
      if (run.relicRun(d.id) > 0 && d.desc && d.star2 && /伤害/.test(d.desc) && /伤害/.test(d.star2)) {
        sum += this.relicVal(d.id);
      }
    });
    return sum;
  }

  /** 单次攻击伤害：towerDps × 攻击间隔（保持总 DPS 口径）；isSkill=true 表示技能/DoT 上下文（v1.16.96 全局充能3★ 技能伤加成只吃技能） */
  shotDmg(key, isSkill) {
    const dps = this.game.run.effects.towerDps(key);
    const iv = CONFIG.TOWERS[key].atkInterval;
    let dmg = dps * iv;
    // v1.16.77 局内商店·攻击强化：+20%/层（本局临时）
    const store = this.game.run.storeBuff ? this.game.run.storeBuff() : { atk: 0 };
    if (store.atk > 0) dmg *= (1 + 0.2 * store.atk);
    // v1.16.78 圣遗物星级乘区：力量符全塔伤害 +N% + 塔圣遗物伤害类（普攻与全部技能同源，统一生效）
    // v1.16.96 3★：力量符3★ 4连叠层 / 城墙加固3★ 背水（普攻技能同吃）；全局充能3★ 技能伤（仅技能）
    const run = this.game.run;
    const rl = this.relicVal('cm_power') + this.relicTowerDmg(key)
      + (run.cmPower3 || 0) + (run.wallAtkBonus ? run.wallAtkBonus() : 0);
    if (rl > 0) dmg *= (1 + rl / 100);
    if (isSkill && run.chargeSkillBoost > 0) dmg *= (1 + run.chargeSkillBoost / 100);
    // v1.16.96 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3
    if (run._shuffleBuffTtl > 0) dmg *= 1.3;
    // v1.16.77 能量耗尽弱化态：普攻与技能伤害 ×0.5（能量 <= 0 时）
    const t = this.tower(key);
    if (t && t.energy <= 0) dmg *= CONFIG.GLOBAL_SKILL.weakDmg;
    return dmg;
  }

  /** v1.16.77 周期技弱化倍率：塔能量耗尽 → 周期 ×1.5（伤害弱化已由 shotDmg 统一 ×0.5） */
  _weakPeriod(key) {
    const t = this.tower(key);
    return t && t.energy <= 0 ? CONFIG.GLOBAL_SKILL.weakPeriod : 1;
  }

  /** v1.16.77 周期技能施放扣能量：能量 >= 成本时扣除并全额施放；不足则弱化施放（不扣，伤害 ×0.5） */
  castEnergy(key, name) {
    const t = this.tower(key);
    if (!t) return;
    const cost = (CONFIG.SKILL_ENERGY && CONFIG.SKILL_ENERGY[name]) || 0;
    if (cost <= 0) return;
    if (t.energy < cost) return;
    t.energy = Math.max(0, t.energy - cost);
  }

  /** 毒·毒性强化（v1.16.21）：选择后中毒 DoT 由 10% 提升为 15%（+50% 单跳）；A 每级 18%/21%/24%（档位式）；B 时长 +2/+4/+6s（档位式） */
  dotBoost() {
    const n = this.lv('poison', '毒性强化');
    const aLv = this.branchLv('poison', '毒性强化', 'A');
    return {
      dmg: n > 0 ? [0.15, 0.18, 0.21, 0.24][aLv] || 0.15 : 0.10,   // 每层每秒伤害比例（单发×此比例）
      ttlAdd: n > 0 ? SKILL_NUM.poison['毒性强化'].ttlAdd[this.branchLv('poison', '毒性强化', 'B')] : 0,
    };
  }

  /* ---------- 主更新：弹道命中 → 状态推进 → 塔攻击 → 周期技 → 死亡触发 ---------- */
  update(dt) {
    const g = this.game;
    if (!g.run.slotOrder.length) return; // 无塔不战斗

    // v1.16.96 3★ 时间窗口递减：智慧典籍3★ 攻速窗口 / 战术转移3★ 洗牌伤害窗口 / 焚天3★ 攻速窗口（秒）
    if (g.run._tomeBuffTtl > 0) g.run._tomeBuffTtl = Math.max(0, g.run._tomeBuffTtl - dt);
    if (g.run._shuffleBuffTtl > 0) g.run._shuffleBuffTtl = Math.max(0, g.run._shuffleBuffTtl - dt);
    if (g.run._burnallTtl > 0) g.run._burnallTtl = Math.max(0, g.run._burnallTtl - dt);
    // v1.16.96 余烬风暴3★：余烬弹倒计时，1 秒后射向最近敌人
    if (g.run._emberShots && g.run._emberShots.length) {
      const rem = [];
      for (const es of g.run._emberShots) {
        es.t -= dt;
        if (es.t <= 0) {
          const near = this.enemies().filter((o) => o.hp > 0).sort((a, b) => Math.hypot(a.x - es.x, a.y - es.y) - Math.hypot(b.x - es.x, b.y - es.y))[0];
          if (near) {
            this.damage(near, es.dmg, 'fire');
            this.fxFlash(near.x, near.y, '#ff9f43', 0.3);
            this.fxRing(near.x, near.y, '#ff7043', 30, 0.3, 3);
            g.fx.push({ type: 'shot', kind: 'line', color: '#ff9f43', x: es.x, y: es.y, tx: near.x, ty: near.y, t: 0, dur: 0.3, key: 'fire', aim: true, scale: 0.9 });
          }
        } else {
          rem.push(es);
        }
      }
      g.run._emberShots = rem;
    }

    // 兼容缺字段的敌人（测试/旧数据）：惰性补齐 A1 状态
    g.enemies.forEach((e) => { if (!e.dots) initEnemyState(e); });

    // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (!this.stepShot(this.shots[i], dt)) this.shots.splice(i, 1);
    }
    // 2. 延迟爆炸（炮引信/炮火支援落点）
    this.updateDelayed(dt);
    // 3. 敌人状态推进（DoT / 控制 / 层数衰减）
    g.enemies.forEach((e) => this.tickStatus(e, dt));
    // 3.5 地面持续区域（火·余烬 / 毒·毒池·毒沼）
    this.updateGroundDots(dt);
    // 3.6 毒·毒棒召唤物
    this.updatePoisonSticks(dt);
    // 3.7 炮·地雷阵
    this.updateMines(dt);
    // 3.8 炮·炮台
    this.updateTurrets(dt);
    // 3.9 回旋镖·风暴镖
    this.updateStorms(dt);
    // 3.10 回旋镖·风痕
    this.updateWindTrails(dt);
    // 4. 塔攻击调度（每塔独立节奏）
    g.run.slotOrder.slice().forEach((key) => this.tickTower(key, dt));
    // 5. 周期技
    // 5. 周期技（按塔分节：火/冰/电/毒/炮/回旋镖）
    this.tickFire(dt);
    this.tickIce(dt);
    this.tickElectric(dt);
    this.tickPoison(dt);
    this.tickCannon(dt);
    this.tickBoomerang(dt);
    // 6. 死亡清场（死亡技能已在伤害结算处触发）
    g.enemies = g.enemies.filter((e) => e.hp > 0);
  }

  /* ---------- 弹道与召唤物推进（v1.16.43 重构：主循环子方法） ---------- */

  /** 单枚飞行弹道推进一帧；返回 false 表示命中结算/耗尽，应移除 */
  stepShot(s, dt) {
    const g = this.game;
    s.t += dt;
    if (s.orb) {
      // v1.16.21 游走电球（活电扩散）：每帧随机转向漂移（转向幅度加大 ±1.6 rad，配合等分初角更像四周扩散），命中 34px 内敌人即结算消失，dur 耗尽消散
      s.ang += (Math.random() - 0.5) * 3.2;
      s.x += Math.cos(s.ang) * s.speed * dt;
      s.y += Math.sin(s.ang) * s.speed * dt;
      const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < 34);
      if (hitE) {
        if (s.fx) s.fx.t = s.fx.dur;
        this.damage(hitE, s.dmg, 'electric');
        this.tryAttackDebuff('electric', hitE, s.dmg);   // v1.16.53 活电电球属普攻强化：统一麻痹判定（吃麻痹技能加成）
        this.fxFlash(hitE.x, hitE.y, '#f4d03f');
        this.fxParticle(hitE.x, hitE.y, '#f4d03f', 5, 30, 0.3, 120, 4);
        return false;
      }
      return s.t < s.dur;
    }
    if (s.bounce) {
      // v1.16.21 弹力镖（原镖阵重做，新单体）：直线飞行，碰敌人或战斗区域边缘反弹；每次碰敌造成伤害（同敌仅一次），反弹 maxB 次或超时后消失
      s.x += Math.cos(s.ang) * s.speed * dt;
      s.y += Math.sin(s.ang) * s.speed * dt;
      const aX = g.ly.areaX, aW = g.ly.areaW, aY = g.ly.areaY, aH = g.ly.areaH;
      if (s.x < aX) { s.x = aX; s.ang = Math.PI - s.ang; s.bounces++; }
      else if (s.x > aX + aW) { s.x = aX + aW; s.ang = Math.PI - s.ang; s.bounces++; }
      if (s.y < aY) { s.y = aY; s.ang = -s.ang; s.bounces++; }
      else if (s.y > aY + aH) { s.y = aY + aH; s.ang = -s.ang; s.bounces++; }
      const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < (s.hitR || 30));
      if (hitE) {
        if (!s.hitIds[hitE.id]) {
          s.hitIds[hitE.id] = true;
          this.damage(hitE, s.dmg, 'boomerang');
          this.fxFlash(hitE.x, hitE.y, '#c39bd3');
          this.fxParticle(hitE.x, hitE.y, '#c39bd3', 3, 18, 0.3, 90, 4);
        }
        const nx = s.x - hitE.x, ny = s.y - hitE.y;
        const nl = Math.hypot(nx, ny) || 1;
        const vx = Math.cos(s.ang), vy = Math.sin(s.ang);
        const dot = vx * (nx / nl) + vy * (ny / nl);
        s.ang = Math.atan2(vy - 2 * dot * (ny / nl), vx - 2 * dot * (nx / nl));
        s.bounces++;
      }
      if (s.bounces >= s.maxB || s.t >= s.dur) {
        if (s.fx) s.fx.t = s.fx.dur;   // v1.16.38 弹力镖提前结束（反弹满/超时）时同步结束其 fx，防止幽灵残留
        return false;
      }
      return true;
    }
    if (s.scatter) {
      // v1.13.13：无目标散射弹道——沿途真实碰撞，命中即结算并消失；射界尽头（dur 耗尽）未命中也消失
      const hitE = this.scatterCheck(s);
      if (hitE) {
        if (s.onHit) s.onHit(hitE, s.dmg);
        return false;
      }
      return s.t < s.dur;
    }
    if (s.t >= s.dur) {
      if (s.sweep) this.sweepDamage(s, dt);
      else this.resolveShot(s);
      return false;
    }
    if (s.sweep) this.sweepDamage(s, dt);
    return true;
  }

  /** 延迟爆炸推进（炮引信 / 炮火支援落点 / 冰花延迟结算） */
  updateDelayed(dt) {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t += dt;
      if (d.t >= d.delay) {
        this.delayed.splice(i, 1);
        if (d.fn) { d.fn(this); continue; }   // v1.16.9 自定义延迟回调（冰花第 3 帧末结算）
        this.explode(d.x, d.y, d.r, d.dmg, d.key, d.knock, d.slowAfter);
        // 炮火支援 C 焦土：落点留燃烧地面 2s（每秒 30% 伤害）
        if (d.ember > 0) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: d.x, y: d.y, r: d.r * 0.6, ttl: 2, dps: this.shotDmg('cannon', true) * 0.24 * d.ember, key: 'fire' });
        }
      }
    }
  }

  /** 地面持续区域推进（火·余烬直伤 / 毒·毒池·毒沼直伤+每秒叠毒+泥沼减速） */
  updateGroundDots(dt) {
    if (!this.groundDots || !this.groundDots.length) return;
    for (let i = this.groundDots.length - 1; i >= 0; i--) {
      const gd = this.groundDots[i];
      gd.ttl -= dt;
      if (gd.ttl <= 0) { this.groundDots.splice(i, 1); continue; }
      this.enemies().forEach((o) => {
        if (o.hp <= 0 || Math.hypot(o.x - gd.x, o.y - gd.y) > gd.r) return;
        if (gd.dps) this.damage(o, gd.dps * dt, gd.key || 'fire');
        // v1.16.42 毒沼：泥沼减速（与毒池区分——毒沼纯叠毒 + 减速，无直伤）
        if (gd.swamp && gd.slow) this.applySlow(o, gd.slow, 1);
        if (gd.key === 'poison' && gd.stackPerSec) {
          gd._t = (gd._t || 0) + dt;
          while (gd._t >= 1) {
            gd._t -= 1;
            this.applyPoison(o, this.shotDmg('poison', true), 'poison', gd.stackPerSec);
          }
        }
      });
      if (gd.key === 'poison') {
        if (gd.swamp) {
          // v1.16.42 毒沼视觉粒子：暗褐绿泥沼气泡（与毒池的亮绿液区分）
          if (Math.random() < 0.5) {
            this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#6e8b3d', 2, 16, 0.5, 50, 4);
          }
        } else if (Math.random() < 0.3) {
          this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#52be80', 2, 18, 0.5, 60, 4);
        }
      } else if (Math.random() < 0.3) {
        this.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#ff7043', 2, 20, 0.4, 60, 4);
      }
    }
  }

  /** 毒·毒棒推进（v1.15）：独立攻击周边 200px 敌人（直伤 + 叠毒），持续结束消失 */
  updatePoisonSticks(dt) {
    if (!this.poisonSticks || !this.poisonSticks.length) return;
    const g = this.game;
    for (let i = this.poisonSticks.length - 1; i >= 0; i--) {
      const st = this.poisonSticks[i];
      st.ttl -= dt;
      if (st.ttl <= 0) { this.poisonSticks.splice(i, 1); continue; }
      st.atkT += dt;
      if (st.atkT >= st.atkI) {
        st.atkT -= st.atkI;
        const cands = this.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - st.x, o.y - st.y) <= st.r)
          .sort((a, b) => b.y - a.y);   // 最靠城墙优先
        const picks = cands.slice(0, st.targets);
        picks.forEach((o) => {
          this.damage(o, st.dmg, 'poison');
          this.applyPoison(o, this.shotDmg('poison', true), 'poison', 1);
          // 毒棒攻击弹道（v1.16.1）：绿色毒刺从毒棒飞射目标（0.25s），命中溅射毒液
          g.fx.push({ type: 'thorn', x: st.x, y: st.y, tx: o.x, ty: o.y, t: 0, dur: 0.25, color: '#2e7d32' });
          this.fxParticle(o.x, o.y, '#2e7d32', 4, 30, 0.3, 90, 4);
          this.fxParticle(o.x, o.y, '#6fcf97', 2, 20, 0.25, 70, 3);
        });
      }
    }
  }

  /** 炮·地雷阵推进：飞行中不可引爆，落地布设 0.3s 后可引爆；C 碎雷星状散射弹片 */
  updateMines(dt) {
    if (!this.mines || !this.mines.length) return;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.fly) {
        const dx = m.fly.tx - m.fly.sx, dy = m.fly.ty - m.fly.sy;
        const dist = Math.hypot(dx, dy) || 1;
        m.fly.t += dt;
        const p = Math.min(1, (m.fly.t * 500) / dist);   // v1.16.23：抛投速度 200→500px/s
        m.x = m.fly.sx + dx * p;
        m.y = m.fly.sy + dy * p;
        if (p >= 1) { m.x = m.fly.tx; m.y = m.fly.ty; m.fly = null; m.armed = 0.3; m.ttl = 20; }
        continue;   // 飞行期间不可引爆
      }
      m.ttl -= dt;
      m.armed -= dt;
      if (m.ttl <= 0) { this.mines.splice(i, 1); continue; }
      if (m.armed > 0) continue;
      const hit = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
      if (!hit) continue;
      this.mines.splice(i, 1);
      this.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);
      if (m.chain > 0) {
        // v1.16.42 C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
        const nShard = SKILL_NUM.cannon['地雷阵'].shards[m.chain];
        const shardDmg = this.shotDmg('cannon', true) * SKILL_NUM.cannon['地雷阵'].shardDmg;
        const R2 = SKILL_NUM.cannon['地雷阵'].shardR;
        const SPEED = SKILL_NUM.cannon['地雷阵'].shardSpeed;
        for (let k = 0; k < nShard; k++) {
          const ang = (Math.PI * 2 * k) / nShard + (Math.random() - 0.5) * 0.4;
          const tx2 = m.x + Math.cos(ang) * R2, ty2 = m.y + Math.sin(ang) * R2;
          const shard = {
            key: 'cannon', dmg: shardDmg, t: 0, dur: R2 / SPEED, sx: m.x, sy: m.y, tx: tx2, ty: ty2,
            scatter: true, hitR: 34,
            onHit: (o, dd) => { this.damage(o, dd, 'cannon'); this.fxParticle(o.x, o.y, '#d89e63', 3, 18, 0.3, 80, 4); },
          };
          this.shots.push(shard);
          this.game.fx.push({ type: 'shot', kind: 'line', color: '#e6b980', x: m.x, y: m.y, t: 0, dur: R2 / SPEED, key: 'cannon', aim: true, scale: 0.8, tx: tx2, ty: ty2 });
        }
      }
    }
  }

  /** 炮·炮台推进：独立炮击最靠墙敌人（直伤+爆炸），持续结束消失 */
  updateTurrets(dt) {
    if (!this.turrets || !this.turrets.length) return;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const tu = this.turrets[i];
      tu.ttl -= dt;
      if (tu.ttl <= 0) { this.turrets.splice(i, 1); continue; }
      tu.atkT += dt;
      if (tu.atkT >= tu.atkI) {
        tu.atkT -= tu.atkI;
        const tgt = this.enemies().filter((o) => o.hp > 0).sort((a, b) => b.y - a.y)[0];
        if (tgt) {
          this.damage(tgt, tu.dmg, 'cannon');
          this.explode(tgt.x, tgt.y, tu.r, tu.dmg * 0.48, 'cannon', 0, false);
          this.fxBeam(tu.x, tu.y, tgt.x, tgt.y, '#d89e63', 0.25, 3);
          // v1.16.6 炮台开火炮口闪光 + 后坐火星
          this.fxFlash(tu.x, tu.y - 8, '#ffd24a', 0.15);
          this.fxParticle(tu.x, tu.y - 6, '#d89e63', 2, 18, 0.2, 60, 3);
          // v1.16.10 开火帧动画标记：命中对应炮台 fx，0.3s 内渲染第 4 帧开火
          const fi = this.game.fx.findIndex((x) => x.type === 'turret' && Math.abs(x.x - tu.x) < 2 && Math.abs(x.y - tu.y) < 2);
          if (fi >= 0) this.game.fx[fi].attackT = this.game.fx[fi].t;
        }
      }
    }
  }

  /** 回旋镖·风暴镖推进（v1.16.21）：三同心圈旋转十字飞镖，每镖独立命中 10% 伤害，命中不消失 */
  updateStorms(dt) {
    if (!this.storms || !this.storms.length) return;
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      st.ttl -= dt;
      if (st.ttl <= 0) {
        if (st.fx) st.fx.t = st.fx.dur;   // v1.16.38 同步结束风暴镖 fx
        this.storms.splice(i, 1);
        continue;
      }
      const ds = st.darts;
      for (let j = ds.length - 1; j >= 0; j--) {
        const d = ds[j];
        d.a += d.spd * dt;
        const dx = st.x + Math.cos(d.a) * d.r;
        const dy = st.y + Math.sin(d.a) * d.r;
        const hitE = this.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - dx, o.y - dy) < 14);
        if (hitE && !d.hitIds[hitE.id]) {
          d.hitIds[hitE.id] = true;
          this.damage(hitE, st.perDmg, 'boomerang');
          this.fxFlash(dx, dy, '#c39bd3');
          this.fxParticle(dx, dy, '#c39bd3', 3, 16, 0.25, 80, 4);
        }
      }
    }
  }

  /** 回旋镖·风痕推进：路径伤害区，C 卷痕减速 */
  updateWindTrails(dt) {
    if (!this.windTrails || !this.windTrails.length) return;
    for (let i = this.windTrails.length - 1; i >= 0; i--) {
      const w = this.windTrails[i];
      w.ttl -= dt;
      if (w.ttl <= 0) { this.windTrails.splice(i, 1); continue; }
      this.enemies().forEach((o) => {
        if (o.hp <= 0 || Math.hypot(o.x - w.x, o.y - w.y) > w.r) return;
        this.damage(o, w.dps * dt, 'boomerang');
        if (w.slow) this.applySlow(o, w.slow, 0.2);
      });
    }
  }

  /* ---------- 敌人状态推进 ---------- */
  tickStatus(e, dt) {
    const boost = this.dotBoost();
    // v1.16.96 火塔 3★ 标记衰减：熔心3★ 火伤标记 / 火墙增烈3★ 停留增伤计时
    if (e._core) { e._core.ttl -= dt; if (e._core.ttl <= 0) e._core = null; }
    if (e._wallStay > 0) e._wallStay -= dt;
    // DoT
    if (e.dots.length) {
      for (let i = e.dots.length - 1; i >= 0; i--) {
        const d = e.dots[i];
        d.ttl -= dt;
        if (d.ttl <= 0) {
          // 火·点燃 C 余烬：灼烧结束瞬间「余烬爆发」= 期间总灼烧伤害的 30% 立即结算
          if (d.type === 'burn' && this.branchLv('fire', '点燃', 'C') > 0 && d.totalDealt > 0) {
            this.damage(e, d.totalDealt * 0.30, 'fire');
            this.fxFlash(e.x, e.y, '#ff7043', 0.3);
            this.fxRing(e.x, e.y, '#ff7043', 36, 0.3, 3);
          }
          e.dots.splice(i, 1); continue;
        }
        d.tickT -= dt;
        if (d.tickT <= 0) {
          // v1.16.21 毒塔：中毒跳频 = 剧毒 C 每跳间隔 -0.1/-0.2/-0.3s（freq=1/间隔，基础 1Hz/1s）；burn 等旧 DoT 保持 2Hz
          const tickI = d.freq ? 1 / d.freq : 0.5;
          d.tickT += tickI;
          // 毒（层数×每层 dps）走 stackDps；灼烧等旧 DoT 走 dps×全局强化
          const dealt = d.stackDps ? (d.stack || 1) * d.stackDps * tickI : d.dps * boost.dmg * tickI;
          this.damage(e, dealt, d.src);
          d.totalDealt = (d.totalDealt || 0) + dealt;
          // 火·爆燃 C 灼裂：灼烧每跳 15%/30%/50% 概率爆炸一次（30% 范围伤害）
          const burstLv = this.branchLv('fire', '爆燃', 'C');
          if (d.type === 'burn' && burstLv > 0 && Math.random() < SKILL_NUM.fire['灼烧'].burst[burstLv]) {
            this.explode(e.x, e.y, 50, this.shotDmg('fire', true) * 0.30, 'fire');
          }
          // 持续伤特效：灼烧=火焰粒子（上飘，数量随叠层）、中毒=毒泡（小概率避免过密）
          if (Math.random() < 0.7) {
            if (d.type === 'burn') {
              const fireN = 3 + Math.min(4, d.stack || 1);
              for (let k = 0; k < fireN; k++) {
                this.fxParticle(e.x + (Math.random() * 20 - 10), e.y - 12 - Math.random() * 8, Math.random() < 0.4 ? '#ffd24a' : '#ff7043', 1, 28, 0.45, 100, 5);
              }
            } else {
              this.fxParticle(e.x + (Math.random() * 16 - 8), e.y - 8, '#7ee2a8', 3, 24, 0.5, 70, 4);
            }
          }
        }
      }
    }
    // 回旋镖·猎手标记（v1.16.42）：标记持续 5 秒，到期清零
    if (e._markT > 0) { e._markT -= dt; if (e._markT <= 0) { e._mark = 0; e._markT = 0; } }
    // 控制
    if (e.frozen > 0) e.frozen -= dt;
    if (e.paralyzed > 0) e.paralyzed -= dt;
    if (e.slow) { e.slow.ttl -= dt; if (e.slow.ttl <= 0) e.slow = null; }
    if (e.corrode) { e.corrode.ttl -= dt; if (e.corrode.ttl <= 0) e.corrode = null; }
    if (e.overload) { e.overload.ttl -= dt; if (e.overload.ttl <= 0) e.overload = null; }
    // 流血（v1.16.12，回旋镖普攻）：随移动距离结算——每累计移动 100px 跳一次伤害
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      e._bleedDist = (e._bleedDist || 0) + Math.max(0, e.y - (e._bleedLastY != null ? e._bleedLastY : e.y));
      e._bleedLastY = e.y;
      if (e._bleedDist >= 100) {
        e._bleedDist -= 100;
        this.damage(e, e._bleedDmg || 0, 'boomerang');
        this.fxParticle(e.x, e.y - 10, '#c0392b', 4, 20, 0.35, 80, 5);
      }
      if (e.bleedT <= 0) { e.bleedT = 0; e._bleedDist = 0; }
    }
    // 瘟疫传染（毒·瘟疫 v1.15；v1.16.21 C 概率调整）：中毒敌人减速 20% + 周期判定传染（A 判定 1.7/1.5/1.3s；B 范围 +25px/级；C 概率 +10pp/级 30→40/50/60%）
    const plague = this.lv('poison', '瘟疫');
    if (plague > 0 && this.hasDot(e, 'poison')) {
      // 减速：中毒敌人移速 ×0.8（与冰减速并存取更慢）
      const s = e.slow;
      const mult = s && s.ttl > 0 ? Math.min(s.mult, 0.8) : 0.8;
      e.slow = { mult, ttl: 1 };
      e._plagueT = (e._plagueT || 0) + dt;
      const ivP = SKILL_NUM.poison['瘟疫'].iv[this.branchLv('poison', '瘟疫', 'A')] || 2;
      if (e._plagueT >= ivP) {
        e._plagueT -= ivP;
        const prob = Math.min(1, 0.30 + 0.10 * this.branchLv('poison', '瘟疫', 'C'));
        if (Math.random() < prob) {
          const rP = 50 + 25 * this.branchLv('poison', '瘟疫', 'B');
          const near = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= rP);
          if (near.length) {
            const pick = near[Math.floor(Math.random() * near.length)];
            this.applyPoison(pick, this.shotDmg('poison', true), 'poison', 1);
            this.fxBeam(e.x, e.y, pick.x, pick.y, '#45b39d', 0.35, 2.5);
          }
        }
      }
    }
    // 毒·毒藤缠绕（v1.15）：定身期间每秒叠毒
    if (e._vineT > 0) {
      e._vineT -= dt;
      e._vineAcc = (e._vineAcc || 0) + dt;
      if (e._vineAcc >= 1) {
        e._vineAcc -= 1;
        this.applyPoison(e, this.shotDmg('poison', true), 'poison', 1);
        this.fxParticle(e.x, e.y - 10, '#7dcea0', 3, 24, 0.4, 80, 4);
      }
    }
    // 毒·瘴气（v1.16.21 重做；v1.16.47 毒雾区域渲染）：城墙上方 50px 处毒瘴条带（半高 20×(1+0.2A)）——
    //   每 2s 叠毒 1 层 + 命中率下降标记；B 中毒 dot 伤 +20~40%；C 瘴内中毒敌攻击降低
    const miasma = this.lv('poison', '瘴气');
    if (miasma > 0) {
      const wallY = (this.game.ly && this.game.ly.wallY) ? this.game.ly.wallY : 967;
      const half = 20 * (1 + 0.2 * this.branchLv('poison', '瘴气', 'A'));
      // v1.16.47：毒雾驻场 fx（城墙上方翻滚毒雾条带；全帧只推入一次，失活时在 else 分支移除）
      if (!this.game.fx.some((f) => f.kind === 'miasma')) {
        this.game.fx.push({ type: 'shot', kind: 'miasma', x: 375, y: wallY - 50, w: 750, half, t: 0, dur: 1e9 });
      }
      const inM = Math.abs(e.y - (wallY - 50)) <= half;
      e._miasma = inM;
      if (inM) {
        e._miaT = (e._miaT || 0) + dt;
        if (e._miaT >= 2) {
          e._miaT -= 2;
          // v1.16.42 瘴气 B 浓瘴档位式：中毒 DoT 伤害 +20%/+30%/+40%（B0=1 / B1=1.2 / B2=1.3 / B3=1.4）
          const bLv = this.branchLv('poison', '瘴气', 'B');
          this.applyPoison(e, this.shotDmg('poison', true) * (bLv > 0 ? SKILL_NUM.poison['瘴气'].dotMult[bLv] : 1), 'poison', 1);
        }
        if (Math.random() < 0.4) this.fxParticle(e.x, e.y - 6, '#7ee2a8', 1, 16, 0.6, 50, 4);
      }
      const cLv = this.branchLv('poison', '瘴气', 'C');
      e._miasmaAtkMult = (cLv > 0 && inM && this.hasDot(e, 'poison')) ? (1 - SKILL_NUM.poison['瘴气'].atkCut[cLv]) : 1;
    } else {
      e._miasma = false;
      e._miasmaAtkMult = 1;
      // v1.16.47：瘴气未激活/失效时移除毒雾驻场 fx
      this.game.fx = this.game.fx.filter((f) => !(f.kind === 'miasma'));
    }
  }

  /* ---------- 伤害结算 ---------- */
  damage(e, dmg, srcKey) {
    if (e.hp <= 0) return;
    let v = dmg;
    // v1.16.11 怪物减伤（armor）：Tier 越高减伤越多，精英/Boss 额外叠加（上限 85%）
    if (e.armor > 0) v *= (1 - Math.min(0.85, e.armor));
    // 腐蚀增伤
    if (e.corrode) v *= e.corrode.mult;
    // （寒霜 C 原「易伤」已改「深寒：减速幅度」，v1.16.21 移除易伤乘区）
    // 火·灼烧 C 真火（v1.16.42 档位式）：每层灼烧使目标受到的伤害 +10%/+20%/+30%（全来源，按层数）
    const trueLv = this.branchLv('fire', '灼烧', 'C');
    if (trueLv > 0) {
      const bd = e.dots.find((d) => d.type === 'burn');
      if (bd) v *= (1 + SKILL_NUM.fire['灼烧'].trueFire[trueLv] * bd.stack);
    }
    // 回旋镖·猎手标记 A 深镖（v1.16.42）：受标记的敌人受到伤害提升 8%/16%/24%（全来源）
    const mkA = this.branchLv('boomerang', '猎手标记', 'A');
    if (mkA > 0 && (e._mark || 0) > 0) v *= (1 + SKILL_NUM.boomerang['猎手标记'].deep[mkA]);
    // 电·过载 B 强载：每层增伤 +15%/级（未点 B 分支不增伤；v1.16.20 接入分支）
    const ovB = this.branchLv('electric', '过载', 'B');
    if (srcKey === 'electric' && e.overload && ovB > 0) v *= (1 + 0.15 * ovB * e.overload.n);
    // v1.16.96 火塔 3★ 火伤乘区（srcKey==='fire'）：
    //   熔心3★：火柱命中标记目标，目标受到火伤 +15%/层（5s，叠2层）
    //   炼狱3★：场上每存在 1 个灼烧敌人，全塔火伤 +3%（上限 +45%）
    //   火墙增烈3★：火墙内敌人每停留 1 秒，受到的伤害递增 10%（上限 +50%，全来源）
    if (srcKey === 'fire') {
      const run3 = this.game.run;
      if (e._core && e._core.ttl > 0) v *= (1 + 0.15 * e._core.n);
      if (run3.relic3('fire_inferno')) {
        const burnN = this.enemies().filter((o) => o.hp > 0 && o.dots && o.dots.some((d) => d.type === 'burn')).length;
        if (burnN > 0) v *= (1 + Math.min(45, burnN * 3) / 100);
      }
    }
    if (e._wallStay > 0 && this.game.run.relic3('fire_wall')) v *= (1 + 0.10 * Math.min(5, Math.floor(e._wallStay)));
    // 圣物·利刃符：全塔伤害 +8%/级
    const g = this.game;
    const m = g.meta;
    const dmgLv = (m && m.relicBonus && m.relicBonus().dmg) || 0;
    if (dmgLv > 0) v *= (1 + 0.08 * dmgLv);
    e.hp -= v;
    e.lastDmgKey = srcKey || e.lastDmgKey;
    if (e.hp <= 0 && !e._dying) {
      e._dying = true;
      this.onKill(e);
    }
  }

  /* ---------- 死亡触发：各塔死亡技能（爆燃/毒爆/霜星/扩散/回收/致死） ---------- */
  onKill(e) {
    const g = this.game;
    // 毒·致死：低血死亡（此处仅为触发记录，实际致死在命中时判断）
    // 按所有激活塔触发死亡技能
    g.run.slotOrder.slice().forEach((key) => {
      if (key === 'fire' && this.hasDot(e, 'burn')) {
        /* v1.16.96 火塔 3★ 死亡触发（不依赖爆燃技能） */
        // 火种3★：灼烧目标死亡时留下火焰地面 3 秒，每秒 50% 攻击伤害
        if (g.run.relic3('fire_seed')) {
          this.groundDots = this.groundDots || [];
          this.groundDots.push({ x: e.x, y: e.y, r: 60, ttl: 3, dps: this.shotDmg('fire', true) * 0.5, key: 'fire' });
          this.fxRing(e.x, e.y, '#ff7043', 60, 0.5, 4);
        }
        // 余烬风暴（1★/2★ 补齐保留项行为）：灼烧目标死亡时 25%/40% 概率再次爆炸（30% 伤害·半径50）
        //   3★：爆炸后留下 1 枚余烬弹，1 秒后自动射向最近敌人（伤害 30%）
        const emberN = g.run.relicNum('fire_ember');
        if (emberN > 0 && Math.random() < emberN / 100) {
          this.explode(e.x, e.y, 50, this.shotDmg('fire', true) * 0.30, 'fire');
          if (g.run.relic3('fire_ember')) {
            g.run._emberShots = g.run._emberShots || [];
            g.run._emberShots.push({ t: 1, x: e.x, y: e.y, dmg: this.shotDmg('fire', true) * 0.30 });
          }
        }
        // 爆燃（v1.13：基础 40% 概率引爆；v1.16.21 A 爆裂 +30/60/90%、B 扩张 +20/40/60%）
        if (this.has('fire', '爆燃') && Math.random() < 0.40) {
          const aLv = this.branchLv('fire', '爆燃', 'A');
          const bLv = this.branchLv('fire', '爆燃', 'B');
          const boomR = 80 * (1 + SKILL_NUM.fire['爆燃'].radius[bLv]);
          this.explode(e.x, e.y, boomR, this.shotDmg('fire', true) * 0.96 * (1 + SKILL_NUM.fire['爆燃'].dmg[aLv]), 'fire');
          // v1.16.96 连锁爆破3★：爆燃爆炸可传染——爆炸范围内敌人 30% 概率带 1 层灼烧
          if (g.run.relic3('fire_chain')) {
            this.enemies().forEach((o) => {
              if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= boomR && Math.random() < 0.30) {
                this.applyBurn(o, this.shotDmg('fire', true), 'fire');
              }
            });
          }
        }
      }
      if (key === 'poison' && this.has('poison', '毒爆') && this.hasDot(e, 'poison')) {
        // v1.16.42 毒爆重做：中毒目标死亡时传染 3+A 个目标，每个目标 30% 几率造成 1 层中毒；
        //   B 继承：30%/40%/50% 概率传播时附带死亡时所有层数；C 毒沼：留下 60px 毒沼 4/5/6 秒每秒叠 1 层并减速 25%
        const n = 3 + this.branchLv('poison', '毒爆', 'A');
        const bLv = this.branchLv('poison', '毒爆', 'B');
        const r = 200;
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r)
          .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
        const picks = cands.slice(0, n);
        picks.forEach((o) => {
          if (Math.random() < SKILL_NUM.poison['毒爆'].spreadP) {
            const layers = (bLv > 0 && Math.random() < SKILL_NUM.poison['毒爆'].inherit[bLv]) ? this.poisonStack(e) : 1;
            this.applyPoison(o, this.shotDmg('poison', true), 'poison', layers);
            this.fxBeam(e.x, e.y, o.x, o.y, '#7ee2a8', 0.3, 3);
          }
        });
        this.fxRing(e.x, e.y, '#52be80', r, 0.5, 5);
        this.fxFlash(e.x, e.y, '#52be80');
        if (this.branchLv('poison', '毒爆', 'C') > 0) {
          const cLv = this.branchLv('poison', '毒爆', 'C');
          this.groundDots = this.groundDots || [];
          // v1.16.42 毒沼：60px 泥沼，4/5/6 秒，每秒叠 1 层 + 泥沼减速 25%（swamp 标记与毒池视觉区分）
          this.groundDots.push({ x: e.x, y: e.y, r: SKILL_NUM.poison['毒爆'].swampR, ttl: SKILL_NUM.poison['毒爆'].swampTtl[cLv], key: 'poison', dps: 0, stackPerSec: 1, swamp: true, slow: SKILL_NUM.poison['毒爆'].swampSlow });
        }
      }
      // 毒·毒藤 C（v1.15）：被缠绕敌人死亡时，藤蔓延伸缠住 100px（每级 +50px）内下一个敌人
      if (key === 'poison' && this.lv('poison', '毒藤') > 0 && e._vineT > 0) {
        const vc = this.branchLv('poison', '毒藤', 'C');
        if (vc > 0) {
          const vr = 100 + 50 * vc;
          const next = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= vr)
            .sort((a, b) => b.y - a.y)[0];
          if (next) {
            next.frozen = Math.max(next.frozen || 0, 2);
            next._vineT = Math.max(next._vineT || 0, 2);
            this.fxBeam(e.x, e.y, next.x, next.y, '#2ecc71', 1, 4);
            this.fxRing(next.x, next.y, '#7dcea0', 26, 1, 3);
          }
        }
      }
      // 冰·冰冻 C 碎冰（v1.16.21）：击杀冰冻敌人 → 120px 范围爆炸（30%/40%/50%×攻击力，档位式）并减速 30%
      if (key === 'ice' && this.branchLv('ice', '冰冻', 'C') > 0 && e.frozen > 0) {
        const frzC = this.branchLv('ice', '冰冻', 'C');
        this.explode(e.x, e.y, 120, this.shotDmg('ice', true) * SKILL_NUM.ice['冰冻'].shatter[frzC], 'ice', 0, true);
      }
      // （冰·霜星 已改为周期技「冰花」，死亡溅射移除 v1.13.23）
      // 回旋镖·猎手标记 C 猎杀（v1.16.42）：标记目标死亡时，向 100px 范围内 1/2/3 个敌人扩散标记（各 5s 持续）
      if (key === 'boomerang' && this.branchLv('boomerang', '猎手标记', 'C') > 0 && (e._mark || 0) > 0) {
        const cLv = this.branchLv('boomerang', '猎手标记', 'C');
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100);
        for (let i = 0; i < Math.min(cLv, cands.length); i++) {
          const pick = cands[i];
          pick._mark = Math.min(3 + 2 * this.branchLv('boomerang', '猎手标记', 'B'), (pick._mark || 0) + 1);
          pick._markT = 5;
          this.fxBeam(e.x, e.y, pick.x, pick.y, '#d2b4de', 0.4, 2.5);
        }
      }
    });
    // 爆炸表现 + 音效（按最近伤害来源着色）
    const KILL_COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
    g.fx.push({ type: 'boom', x: e.x, y: e.y, t: 0, dur: 0.5, color: KILL_COLOR[e.lastDmgKey] || '#ff9f43' });
    this.fxRing(e.x, e.y, KILL_COLOR[e.lastDmgKey] || '#ff9f43', 40, 0.35, 4);
    g.playSfx('boom', 0.35);
    // 击杀奖励钩子：经验（圣物加成）/ 精英圣物掉落 / Boss 宝箱掉落（game 层实现）
    if (g.onKillReward) g.onKillReward(e);
  }

  /* ---------- 三消联动：塔额外攻击一次（多消形状触发不同攻击特效） ---------- */
  bonusStrike(key, shape) {
    const g = this.game;
    const t = this.tower(key);
    if (!t || t.level === 0) return;
    // v1.16.77 能量：三消额外攻击同样耗 0.5 能量；能量耗尽不取消，伤害走弱化态（shotDmg 内 ×0.5）
    // v1.16.96 弹药箱3★：能量不足时从备用能量库借用
    g.run.spendAttackEnergy(t);
    const tgt = this.pickTarget(key);
    if (!tgt) return;
    const dmg = this.shotDmg(key);
    const tint = CONFIG.TOWERS[key].color || '#fff';
    if (shape === '3') {
      // 三连：单发直击
      this.damage(tgt, dmg, key);
      this.fxFlash(tgt.x, tgt.y, tint, 0.3);
      this.fxParticle(tgt.x, tgt.y - 8, tint, 4, 40, 0.4, 120, 4);
    } else if (shape === '4') {
      // 直4：双发（第二发 50%）
      this.damage(tgt, dmg, key);
      this.damage(tgt, dmg * 0.5, key);
      this.fxFlash(tgt.x, tgt.y, tint, 0.35);
      this.fxRing(tgt.x, tgt.y, tint, 36, 0.35, 3);
    } else if (shape === 'L5' || shape === '5') {
      // L5/直5：溅射爆
      this.explode(tgt.x, tgt.y, 72, dmg, key, 0, false);
      this.fxRing(tgt.x, tgt.y, tint, 60, 0.4, 4);
    } else {
      // 6+ 大消：大范围高伤爆
      this.explode(tgt.x, tgt.y, 110, dmg * 1.5, key, 0, false);
      this.fxRing(tgt.x, tgt.y, tint, 90, 0.5, 5);
      this.fxFlash(tgt.x, tgt.y, '#ffffff', 0.4);
    }
  }

  /* ---------- 塔攻击调度 ---------- */
  tickTower(key, dt) {    const g = this.game;
    const t = this.tower(key);
    if (!t || t.level === 0) return;
    const cfg = CONFIG.TOWERS[key];
    let iv = this.interval(key);
    // v1.16.42 回旋镖攻击节奏重做（无攻速属性）：投掷节奏 = 镖飞回 + 接镖硬间隔——
    //   未学「接镖」：接镖后 0.5 秒才投出下一镖；学「接镖」：接镖后立即投掷（C 续投加成）
    if (key === 'boomerang') {
      const flying = this.shots.some((s) => s.sweep && s.key === key);
      if (flying) return;                       // 镖在飞行中不投（也不累计攻速计时）
      const catchSkill = this.lv('boomerang', '接镖') > 0;
      if (this.bWait[key]) {
        this.bWait[key] = false;
        if (catchSkill) {
          const cnt = this.branchLv('boomerang', '接镖', 'C');
          if (cnt > 0) this._nextDmg[key] = (this._nextDmg[key] || 0) + 0.10 * cnt;
          this.attackOnce(key);
          return;
        }
        this.bCatch[key] = 0;                   // 未学接镖：开始 0.5s 接镖冷却
      }
      if (this.bCatch[key] !== undefined) {
        this.bCatch[key] += dt;
        if (this.bCatch[key] >= SKILL_NUM.boomerang['接镖'].catchCd) { this.bCatch[key] = undefined; this.attackOnce(key); }
      } else {
        this.attackOnce(key);                   // 空闲/无目标：直接尝试（attackOnce 内部无目标时复位等待）
      }
      return;
    }
    this.atkTimers[key] = (this.atkTimers[key] || 0) + dt;
    // 电·充能：命中层数也提供攻速（interval 已算）
    while (this.atkTimers[key] >= iv) {
      this.atkTimers[key] -= iv;
      this.attackOnce(key);
    }
  }

  /** 选择攻击目标：默认射程内 y 最大（最靠城墙） */
  pickTarget(key) {
    const r = this.range(key);
    const sy = this.towerMuzzle(key).y;
    let best = null;
    this.enemies().forEach((e) => {
      if (e.hp <= 0) return;
      const dist = Math.abs(sy - e.y);
      if (dist > r) return;
      if (!best) { best = e; return; }
      if (e.y > best.y) best = e;
    });
    return best;
  }

  /** 单塔一次攻击：选目标 → 发弹道（表现层） + 登记命中回调 */
  attackOnce(key) {
    const g = this.game;
    // v1.16.77 能量：普攻每次耗 0.5 能量（每 2 发 1 点）；能量耗尽不停火，进入弱化态（shotDmg ×0.5）
    // v1.16.96 弹药箱3★：能量不足时从备用能量库借用
    const ammoT = this.tower(key);
    if (ammoT) g.run.spendAttackEnergy(ammoT);
    const target = this.pickTarget(key);
    if (!target) {
      // 回旋镖：无目标可投时复位等待标记，避免接镖流程空转
      if (key === 'boomerang') this.bWait[key] = false;
      return;
    }
    // v1.16 接镖 B 回能：回旋镖 30% 概率不耗能量（已在上面消耗，回补）
    const regain = key === 'boomerang' && this.branchLv('boomerang', '接镖', 'B') > 0 && Math.random() < SKILL_NUM.boomerang['接镖'].catchRegain;
    if (ammoT && regain) ammoT.energy = Math.min(ammoT.energy + CONFIG.GLOBAL_SKILL.perAttack, g.run.armoryEnergyMax());
    const cfg = CONFIG.TOWERS[key];
    const ly = this.ly();
    // v1.16.37 发射点统一走 towerMuzzle（测试战场单塔大槽 / 正式战斗槽位），修复弹道从塔区中间凭空发出
    const mz = this.towerMuzzle(key);
    const sx = mz.x, sy = mz.y;
    const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
    const dur = cfg.shot.dur;
    const dmg = this.shotDmg(key);
    // 炮·双管齐射（v1.16）：基础 25% 概率双发，A 齐射 +15pp/级；副炮第二发伤害 +20%/级（B）
    const duelProb = key === 'cannon' ? (0.25 + 0.15 * this.branchLv('cannon', '双管齐射', 'A')) : 0;
    const duel = key === 'cannon' && this.lv('cannon', '双管齐射') > 0 && Math.random() < duelProb;
    // 电·充能：攻击次数累计
    const chargeLv = this.lv('electric', '充能');
    if (key === 'electric' && chargeLv > 0) {
      const t = this.tower('electric');
      t._chargeLayers = Math.min(5 * chargeLv, (t._chargeLayers || 0) + 1);
    }
    // 弹道（视觉）+ 命中（逻辑）
    // v1.5：fx 携带 target 引用，直线/闪电弹道末端实时跟随目标移动
    const baseShot = { type: 'shot', kind: cfg.shot.kind, color: tint, x: sx, y: sy, tx: target.x, ty: target.y, t: 0, dur, key, target, fold: key === 'boomerang' && this.lv('boomerang', '折返增伤') > 0 };
    if (key === 'fire' && this.lv('fire', '多重火球') > 0) {
      // 多重火球：弹道由 hitFire 自行推送多枚（扇形分离），此处不再推普通弹道避免重叠
      g.playSfx('shot', 0.25);
    } else {
      // v1.13.5：大火球激活 → 火球弹体 ×2（扩大一倍）
      if (key === 'fire' && this.lv('fire', '大火球') > 0) baseShot.scale = 2.0;
      // v1.13.28：冰塔普攻弹道统一采用多重冰锥样式（冰蓝菱形 + 放大 1.15）
      if (key === 'ice') baseShot.scale = 1.15;
      g.fx.push(baseShot);
      g.playSfx('shot', 0.25);
    }
    // v1.13.2 塔口发射特效：攻击瞬间塔口喷发微火星 + 小闪光（直线/闪电类塔）
    if (cfg.shot.kind === 'line' || cfg.shot.kind === 'bolt') {
      this.fxParticle(sx, sy - 4, tint, 3, 24, 0.25, 90, 4);
      this.fxFlash(sx, sy, tint, 0.15);
    }
    // v1.13.27 冰塔开火专属特效：塔口冰晶迸发 + 冰蓝闪光
    if (key === 'ice') {
      this.fxParticle(sx, sy - 6, '#eaf6ff', 5, 34, 0.28, 120, 5);
      this.fxParticle(sx, sy - 6, '#7fd4ff', 3, 44, 0.32, 70, 4);
      this.fxFlash(sx, sy, '#a9d6f5', 0.2);
    }
    if (key === 'boomerang') {
      // 回旋镖 v1.16 重做：弧线飞出再飞回，沿途扫过所有敌人；投出后标记等待接回（接镖机制保留）
      // 多镖：每次多投 1 枚（单镖伤害 -15%/级；B 稳镖衰减减半）；风痕：镖路径留痕（C 卷痕减速）
      this.bWait[key] = true;
      const multi = this.lv('boomerang', '多镖');
      const nextBoost = this._nextDmg[key] || 0;   // 接镖 C 续投：下镖伤害 +10%/级
      this._nextDmg[key] = 0;
      // 怪物只沿 +y 走向城墙（main.moveEnemy），预测位移 = speed × 减速系数 × 到达弧顶时间（dur×0.53）
      // v1.16.5 接镖 A 疾飞：镖飞行速度 +20%/级 → 飞行时长缩短、命中与接回更快
      const flyBoost = 1 + 0.20 * this.branchLv('boomerang', '接镖', 'A');
      const bDur = dur / flyBoost;
      const slowMult = (target.slow && target.slow.ttl > 0) ? target.slow.mult : 1;
      const wallY = (g.ly && g.ly.wallY) ? g.ly.wallY - 10 : 957;
      const aimY = Math.min(target.y + target.speed * slowMult * bDur * 0.53, wallY);
      const n = 1 + multi;
      const decay = multi > 0 ? (0.12 * multi) * (this.branchLv('boomerang', '多镖', 'B') > 0 ? 0.5 : 1) : 0;
      const perDmg = dmg * (1 - decay) * (1 + nextBoost);
      const maxD = CONFIG.TOWERS.boomerang.range;
      const spread = 0.07 * (1 + 0.30 * this.branchLv('boomerang', '多镖', 'C'));
      // 移除通用视觉弹道（baseShot），按 n 枚重建（各带微偏角）
      const bidx = g.fx.indexOf(baseShot);
      if (bidx >= 0) g.fx.splice(bidx, 1);
      for (let i = 0; i < n; i++) {
        const off = (n > 1) ? (i - (n - 1) / 2) * spread : 0;
        const dx = target.x - sx, dy = aimY - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, maxD / dist);
        const ex0 = sx + dx * k, ey0 = sy + dy * k;
        const cos = Math.cos(off), sin = Math.sin(off);
        const rx = ex0 - sx, ry = ey0 - sy;
        const ex = sx + rx * cos - ry * sin;
        const ey = sy + rx * sin + ry * cos;
        this.shots.push({ key, dmg: perDmg, t: 0, dur: bDur, sx, sy, tx: ex, ty: ey, sweep: true, hitIds: {}, windLv: this.lv('boomerang', '风痕') });
        g.fx.push({ type: 'shot', kind: 'arc', color: tint, x: sx, y: sy, tx: ex, ty: ey, t: 0, dur: bDur, key, fold: this.lv('boomerang', '折返增伤') > 0 });
      }
    } else {
      this.shots.push({ key, target, dmg, t: 0, dur, sx, sy });
    }
    if (duel) {
      // 双管齐射第二发（更短弹道；B 副炮第二发伤害 +25%/级）
      const duelDmg = dmg * (1 + 0.25 * this.branchLv('cannon', '双管齐射', 'B'));
      g.fx.push({ ...baseShot, t: 0, dur: dur * 0.75 });
      this.shots.push({ key, target, dmg: duelDmg, t: 0, dur: dur * 0.75, sx, sy });
    }
  }

  /* ---------- 弹道命中结算 ---------- */
  resolveShot(s) {
    const g = this.game;
    const e = s.target;
    if (!e || e.hp <= 0 || !g.enemies.includes(e)) return; // 目标已死/消失 → 落空
    if (s.onHit) { s.onHit(e, s.dmg); return; }             // v1.13.2：自定义命中回调（多重火球分击等，不触发技能链）
    this.hit(s.key, e, s.dmg);
  }

  /** 散射弹道（无目标）沿途碰撞检测（v1.13.13）：按 t/dur 线性插值当前位置，命中半径内敌人返回该敌，未命中返回 null */
  scatterCheck(s) {
    const p = Math.min(1, s.t / s.dur);
    const bx = s.sx + (s.tx - s.sx) * p;
    const by = s.sy + (s.ty - s.sy) * p;
    const r = s.hitR || 42;
    for (const e of this.enemies()) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= r) return e;
    }
    return null;
  }

  /** 回旋镖轨迹点（v1.9）：椭圆大弧——镖从塔出发，划弧越过投掷方向最远点后继续绕回塔（非原路径折返） */
  sweepPos(s, p) {
    const dx = s.tx - s.sx, dy = s.ty - s.sy;
    const dist = Math.hypot(dx, dy) || 1;
    const cxn = dx / dist, cyn = dy / dist;          // 投掷方向单位向量
    const arcH = 160;                                 // 椭圆短半轴（弧高，垂直投掷方向）
    const a = dist / 2 + 20;                          // 长半轴（沿投掷方向，保证越过怪物）
    const cx = s.sx + cxn * (dist / 2);               // 椭圆中心（塔与怪物中点）
    const cy = s.sy + cyn * (dist / 2);
    const total = Math.PI * 1.9;                      // 342°：从塔端绕 0.95 圈回塔
    const ang = Math.PI + total * p;                  // p=0 在塔端（π），p≈0.53 越过怪物最远点，p=1 回到塔
    const cs = Math.cos(ang), sn = Math.sin(ang);
    return {
      x: cx + a * cs * cxn - arcH * sn * cyn,
      y: cy + a * cs * cyn + arcH * sn * cxn,
    };
  }

  /** 回旋镖沿途伤害（v1.16）：椭圆大弧扫过路径上的所有敌人，每敌单镖最多命中一次；折返 C 宽返吸附 +20%/级；风痕留痕 */
  sweepDamage(s) {
    const g = this.game;
    const p = Math.min(1, s.t / s.dur);
    const pos = this.sweepPos(s, p);
    const bx = pos.x, by = pos.y;
    const foldC = this.branchLv('boomerang', '折返增伤', 'C');
    const r = 42 * (1 + 0.20 * foldC);
    for (const e of g.enemies) {
      if (e.hp <= 0 || s.hitIds[e.id]) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= r) {
        s.hitIds[e.id] = true;
        this.damage(e, s.dmg, 'boomerang');
        this.tryAttackDebuff('boomerang', e, s.dmg);   // v1.16.53 多镖扫过属普攻强化：统一流血判定（吃放血技能加成）
      }
    }
    // 风痕（v1.16）：镖路径每秒留下风痕伤害区（A 久痕 +0.5s/级；B 劲风 +30%/级；C 卷痕减速 15%）
    // v1.16.36 修正：空间间隔采样（相邻留痕 ≥32px，r=34 伤害区仍连续全覆盖）+ 上限 120→240，
    //            避免多镖/疾飞高频投掷下活跃点数迅速打满 120 导致风痕整体断供
    if (s.windLv > 0) {
      const wA = this.branchLv('boomerang', '风痕', 'A');
      const wB = this.branchLv('boomerang', '风痕', 'B');
      const wC = this.branchLv('boomerang', '风痕', 'C');
      this.windTrails = this.windTrails || [];
      const spaced = !s._wLast || Math.hypot(bx - s._wLast.x, by - s._wLast.y) >= 32;
      if (spaced && this.windTrails.length < 240) {
        const ttl = 1.5 + 0.5 * wA;
        const dps = this.shotDmg('boomerang', true) * 0.30 * (1 + 0.3 * wB);
        this.windTrails.push({ x: bx, y: by, r: 34, ttl, dps, slow: SKILL_NUM.boomerang['风痕'].slow[wC] });   // v1.16.42 C 卷痕档位式 10%/20%/30%
        s._wLast = { x: bx, y: by };
      }
      if (Math.random() < 0.5) this.fxParticle(bx, by, '#c39bd3', 1, 14, 0.5, 50, 3);
    }
  }

  /**
   * 普攻 debuff 统一判定（v1.16.53）：普攻与**普攻强化攻击**（电·连锁/活电/电磁场、火·多重火球、
   *   冰·多重冰锥/碎冰、镖·多镖等）命中均走此判定——各塔基础 20% 概率，学对应 dot 强化技能后
   *   概率提升（公式与普攻一致：基础 20% + 技能 +25%[电·麻痹为 +20%] + A 分支每级 +15%）
   */
  tryAttackDebuff(key, o, dmg) {
    if (key === 'fire') {
      // 灼烧（v1.16.21）：基础 20%；学「点燃」+25%（A 炽焰每级再 +15%）
      const ignite = this.lv('fire', '点燃');
      let burnProb = 0.20;
      if (ignite > 0) burnProb += 0.25 + 0.15 * this.branchLv('fire', '点燃', 'A');
      // v1.16.96 薪柴3★：灼烧概率触顶（≥80%）时，多余的判定转为 +10% 灼烧伤害（失败部分累积，上限 +50%）
      if (this.game.run.relic3('fire_fuel') && burnProb >= 0.8) {
        if (Math.random() < 0.8) this.applyBurn(o, dmg, 'fire');
        else this.game.run._fuelBoost = Math.min(50, (this.game.run._fuelBoost || 0) + 10);
      } else if (Math.random() < burnProb) this.applyBurn(o, dmg, 'fire');
    } else if (key === 'ice') {
      // 冰缓（v1.16.21）：基础 20%；学寒霜 +25% + A 极寒每级 +15%（45→60→75→90%）；B 凝结 时长 +1/+2/+3s；C 深寒 减速幅度 +10%/20%/30%
      const frost = this.lv('ice', '寒霜');
      const probSlow = 0.20 + (frost > 0 ? 0.25 + 0.15 * this.branchLv('ice', '寒霜', 'A') : 0);
      if (Math.random() < probSlow) {
        const mult = 0.30 + SKILL_NUM.ice['寒霜'].slowMult[this.branchLv('ice', '寒霜', 'C')];
        const ttl = 3 + SKILL_NUM.ice['寒霜'].ttl[this.branchLv('ice', '寒霜', 'B')];
        this.applySlow(o, mult, ttl);
        this.fxParticle(o.x, o.y, '#a9d6f5', 6, 50, 0.5, 80, 5);
      }
      // 冰冻（v1.16.21）：学技能后 20% 概率冻结 + A 档位；B 深结 时长 +1/1.5/2s
      const frzLv = this.lv('ice', '冰冻');
      if (frzLv > 0) {
        const prob = 0.20 + SKILL_NUM.ice['冰冻'].prob[this.branchLv('ice', '冰冻', 'A')];
        if (Math.random() < prob) {
          const dur = 2 + SKILL_NUM.ice['冰冻'].dur[this.branchLv('ice', '冰冻', 'B')];
          o.frozen = Math.max(o.frozen || 0, dur);
          this.fxFlash(o.x, o.y, '#d6f0ff', 0.28);
          this.fxRing(o.x, o.y, '#7fd4ff', 46, 0.4, 4);
          this.fxParticle(o.x, o.y, '#b8e6ff', 10, 60, 0.5, 130, 5);
        }
      }
    } else if (key === 'electric') {
      // 麻痹（v1.16.53）：基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85）；时长 2s + B 0.5s/级；
      //   C 导电：被麻痹时附近 100px 敌人 20%/30%/40% 概率被传导麻痹（1s）
      const paraLv = this.lv('electric', '麻痹');
      const pA = this.branchLv('electric', '麻痹', 'A');
      const pB = this.branchLv('electric', '麻痹', 'B');
      const pC = this.branchLv('electric', '麻痹', 'C');
      if (Math.random() < Math.min(1, 0.20 + (paraLv > 0 ? 0.20 : 0) + 0.15 * pA)) {
        const dur = 2 + 0.5 * pB;
        o.paralyzed = Math.max(o.paralyzed || 0, dur);
        this.applySlow(o, 0.5, dur);
        this.fxParticle(o.x, o.y, '#f4d03f', 8, 50, 0.4, 140, 5);
        if (pC > 0) {
          const cProb = SKILL_NUM.electric['麻痹'].cond[pC];
          this.enemies().forEach((q) => {
            if (q === o || q.hp <= 0 || Math.hypot(q.x - o.x, q.y - o.y) > 100) return;
            if (Math.random() < cProb) {
              q.paralyzed = Math.max(q.paralyzed || 0, 1);
              this.applySlow(q, 0.5, 1);
              this.fxParticle(q.x, q.y, '#f4d03f', 4, 30, 0.35, 110, 4);
            }
          });
        }
      }
    } else if (key === 'poison') {
      // 中毒（v1.16.21）：基础 20%；学剧毒 +25% + A 每级 +15%
      let prob = 0.20;
      const toxic = this.lv('poison', '剧毒');
      if (toxic > 0) prob += 0.25 + 0.15 * this.branchLv('poison', '剧毒', 'A');
      if (Math.random() < prob) {
        this.applyPoison(o, dmg, 'poison', 1);
        this.fxParticle(o.x, o.y, '#7ee2a8', 6, 44, 0.45, 100, 5);
      }
    } else if (key === 'boomerang') {
      // 流血（v1.16.21）：基础 20%；学放血 +25%（20→45）+ A 刺骨 +15%/级（45→90%）
      const bleedLv = this.lv('boomerang', '放血');
      const bleedChance = 0.20 + (bleedLv > 0 ? 0.25 + 0.15 * this.branchLv('boomerang', '放血', 'A') : 0);
      if (Math.random() < bleedChance) this.applyBleed(o, dmg);
    }
  }

  /* ---------- 六塔命中行为 ---------- */
  hit(key, e, dmg) {
    const g = this.game;
    // 电磁场（v1.13.22 分支补全）：任意塔命中概率触发微型连锁——A 激磁 +10%/级、B 强磁伤害 +30%/级、C 扩磁目标 +1/级
    const em = this.lv('electric', '电磁场');
    if (em > 0) {
      const emA = this.branchLv('electric', '电磁场', 'A');
      const emB = this.branchLv('electric', '电磁场', 'B');
      const emC = this.branchLv('electric', '电磁场', 'C');
      if (Math.random() < 0.10 + 0.10 * (em - 1) + 0.10 * emA) {
        const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.x - e.x) < 110 && Math.abs(o.y - e.y) < 110);
        const emDmg = this.shotDmg('electric') * 0.4 * (1 + 0.3 * (em - 1)) * (1 + 0.3 * emB);
        const n = 1 + emC;   // C 扩磁：目标 +1/级
        for (let i = 0; i < n && cands.length; i++) {
          const pick = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
          this.damage(pick, emDmg, 'electric');
          this.tryAttackDebuff('electric', pick, emDmg);   // v1.16.53 电磁场微型连锁属普攻强化：同样判定麻痹（吃麻痹技能加成）
          this.fxFlash(pick.x, pick.y, '#f4d03f');
        }
        this.fxRing(e.x, e.y, '#f4d03f', 110, 0.3, 3);
      }
    }

    if (key === 'fire') this.hitFire(e, dmg);
    else if (key === 'ice') this.hitIce(e, dmg);
    else if (key === 'poison') this.hitPoison(e, dmg);
    else if (key === 'electric') this.hitElectric(e, dmg);
    else if (key === 'boomerang') this.hitBoomerang(e, dmg);
    else if (key === 'cannon') this.hitCannon(e, dmg);

    // 命中计数（电·充能）
    e.hitCount++;
    // 命中特效：按塔类型爆发专属粒子（v1.13.2 增强：数量更多 + 命中冲击环 + 双色火花）
    const HIT_FX = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
    this.fxParticle(e.x, e.y, HIT_FX[key] || '#ffffff', 8, 52, 0.4, 140, 5);
    this.fxParticle(e.x, e.y, '#ffffff', 4, 30, 0.25, 110, 3);
    this.fxRing(e.x, e.y, HIT_FX[key] || '#ffffff', 30, 0.28, 3);
    this.fxFlash(e.x, e.y, '#ffffff', 0.25);
  }

  /* ============ 火塔（v1.13 重构：点燃/灼烧/火柱/大火球/爆燃/多重火球/烈焰墙/火雨） ============ */
  hitFire(e, dmg) {
    const g = this.game;
    const run = g.run;
    // v1.16.21：火焰鹰眼已重做为「烈焰墙」（周期技），此处不再有普攻乘区

    /* v1.16.96 火塔 3★ 普攻挂点 */
    // 焰雨3★：火球命中同一目标 3 次 → 下次攻击必为三连火球（追加 3 发等额伤害）
    if (run._fireTripleNext) {
      run._fireTripleNext = false;
      for (let k = 0; k < 3; k++) {
        this.damage(e, dmg, 'fire');
        this.fxFlash(e.x, e.y, '#ff9f43', 0.22);
        this.fxParticle(e.x, e.y - 8, '#ffd24a', 4, 40, 0.35, 130, 4);
      }
    } else {
      e._fireHits = (e._fireHits || 0) + 1;
      if (e._fireHits >= 3) { e._fireHits = 0; run._fireTripleNext = true; }
    }
    // 熔炉之息3★：每 5 次普攻附带一次免费火柱（150% 伤害·半径120，不耗能量，复用周期技结算）
    run._forgeCount = (run._forgeCount || 0) + 1;
    if (run.relic3('fire_forge') && run._forgeCount >= 5) {
      run._forgeCount = 0;
      const alive = this.enemies().filter((o) => o.hp > 0 && this.inTowerRange('fire', o.x, o.y));
      if (alive.length) {
        const ftgt = alive[Math.floor(Math.random() * alive.length)];
        this.pillarWaves = this.pillarWaves || [];
        this.pillarWaves.push({ t: 0.6, x: ftgt.x, y: ftgt.y, r: 120, dmg: this.shotDmg('fire', true) * 1.2, ember: 0 });
        g.fx.push({ type: 'pillar', x: ftgt.x, y: ftgt.y, r: 120, t: 0, dur: 2.4, seed: Math.random() * 100 });
        this.fxParticle(ftgt.x, ftgt.y - 10, '#ffd24a', 4, 60, 0.5, 150, 5);
      }
    }
    // 火焰弹射（1★/2★ 补齐保留项行为）：普攻 25%/40% 概率额外发射一枚火球；3★：弹射火球命中时 50% 概率返还 1 点能量
    const fbN = run.relicNum('fire_bounce');
    if (fbN > 0 && Math.random() < fbN / 100) {
      const mz = this.towerMuzzle('fire');
      const R = this.range('fire');
      const off = (Math.random() * 2 - 1) * 0.24;
      const tx = mz.x + Math.sin(off) * R, ty = mz.y - Math.cos(off) * R;
      const fbStrike = (m2) => {
        this.damage(m2, dmg, 'fire');
        this.tryAttackDebuff('fire', m2, dmg);
        this.fxParticle(m2.x, m2.y, '#ff9f43', 4, 30, 0.3, 120, 4);
        // 3★：命中 50% 概率返还 1 点能量
        if (run.relic3('fire_bounce') && Math.random() < 0.5) {
          const ft = this.tower('fire');
          if (ft) ft.energy = Math.min(ft.energy + 1, run.armoryEnergyMax());
        }
      };
      this.shots.push({ key: 'fire', scatter: true, dmg, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, sx: mz.x, sy: mz.y, tx, ty, hitR: 42, onHit: fbStrike });
      g.fx.push({ type: 'shot', kind: 'line', color: '#ff7043', x: mz.x, y: mz.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, key: 'fire', aim: true, scale: 1.0, tx, ty });
    }

    // 普攻灼烧（v1.16.21→v1.16.53 统一判定）：基础 20%；学「点燃」+25%（A 炽焰每级 +15%）；强化攻击同吃此加成
    this.tryAttackDebuff('fire', e, dmg);
    // 大火球：主目标 120%
    const big = this.lv('fire', '大火球');
    const mainMult = big > 0 ? 1.1 : 1;
    // 多重火球：主目标 + 额外目标，每枚都是真实火球弹道（塔口扇形射出，命中才结算）
    //         A 增发 3→4→5 枚 / B 凝火 +15%/枚 / C 分击不同目标+25%点燃
    const multi = this.lv('fire', '多重火球');
    if (multi > 0) {
      // 塔发射点（v1.16.37 统一 towerMuzzle）
      const mz = this.towerMuzzle('fire');
      const fsx = mz.x, fsy = mz.y;
      const n = 5 + this.branchLv('fire', '多重火球', 'A');          // v1.16.21 基础 5 枚（主 + 4 散射，+2 普通火球）；A 每级 +1
      const perDmg = dmg * 0.44 * (1 + SKILL_NUM.fire['多重火球'].condense[this.branchLv('fire', '多重火球', 'B')]);   // 凝火 +15/30/50%
      const igniteProb = this.branchLv('fire', '多重火球', 'C') > 0 ? 0.25 : 0;
      const dur = CONFIG.TOWERS.fire.shot.dur;
      const tint = '#ff7043';
      // v1.13.3：多枚火球扇形分离——aim 固定终点 + 弹体放大，确保视觉上清晰可见「多个火球」
      const aimOf = (tgt, off) => {
        const dx = tgt.x - fsx, dy = tgt.y - fsy;
        const cos = Math.cos(off), sin = Math.sin(off);
        return { tx: fsx + dx * cos - dy * sin, ty: fsy + dx * sin + dy * cos };
      };
      // 火塔射界半径与散射碰撞半径（v1.13.13：额外火球无目标散射弹道）
      const R = this.range('fire');                 // 射界半径（= 塔射程）
      const hitR = 45;                              // 散射火球碰撞半径（弹体较大）
      // 命中结算（主目标直瞄与散射弹道共用）：本体伤害 + 大火球叠加爆炸 + 多重火球 C 散射分裂
      const cLv = this.branchLv('fire', '多重火球', 'C');
      const strike = (o, d, ang) => {
        this.damage(o, d, 'fire');
        this.tryAttackDebuff('fire', o, d);   // v1.16.53 多重火球散射命中属普攻强化：统一灼烧判定
        this.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
        this.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
        this.fxFlash(o.x, o.y, '#ffd24a', 0.2);
        // 多重火球 C 散射（v1.16.42 档位式 3/4/5）：命中后分裂 3/4/5 个小火球，沿弹道方向 120° 均匀散射（每个 25% 攻击伤害 + 20% 点燃）
        if (cLv > 0) {
          const nSplit = SKILL_NUM.fire['多重火球'].scatterSplit[cLv];
          for (let k = 0; k < nSplit; k++) {
            const off = -Math.PI / 3 + (k / Math.max(1, nSplit - 1)) * (2 * Math.PI / 3);   // -60°~+60° 均匀
            const da = off + (ang || 0);
            const tx2 = o.x + Math.cos(da) * R, ty2 = o.y + Math.sin(da) * R;
            const mStrike = (m2) => {
              this.damage(m2, dmg * 0.25, 'fire');
              this.fxParticle(m2.x, m2.y, '#ffd24a', 4, 30, 0.3, 110, 4);
              this.tryAttackDebuff('fire', m2, dmg);   // v1.16.53 分裂小火球属普攻强化：统一灼烧判定（吃点燃技能加成）
            };
            this.shots.push({ key: 'fire', scatter: true, dmg: dmg * 0.25, t: 0, dur: dur * 0.8, sx: o.x, sy: o.y, tx: tx2, ty: ty2, hitR: 30, onHit: mStrike });
            g.fx.push({ type: 'shot', kind: 'line', color: '#ffd24a', x: o.x, y: o.y, t: 0, dur: dur * 0.8, key: 'fire', aim: true, scale: 0.9, tx: tx2, ty: ty2 });
          }
        }
        // 大火球叠加：每枚火球命中处按大火球口径爆炸溅射（选了大火球 → 火球变大火球）
        if (big > 0) {
          const bgr = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));
          const bgs = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
          const bgIgnite = 0.50 * this.branchLv('fire', '大火球', 'C');
          this.enemies().forEach((o2) => {
            if (o2 === o || o2.hp <= 0) return;
            const d2 = Math.hypot(o2.x - o.x, o2.y - o.y);
            if (d2 <= bgr) {
              this.damage(o2, bgs, 'fire');
              if (bgIgnite > 0 && Math.random() < bgIgnite) this.applyBurn(o2, dmg, 'fire');
              // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
              if (g.run.relic3('fire_nuke') && d2 > bgr * 0.5) {
                o2.y = Math.max(50, o2.y - 40);
                this.applyBurn(o2, dmg, 'fire');
                this.fxParticle(o2.x, o2.y, '#ff9f43', 3, 24, 0.3, 100, 4);
              }
            }
          });
          this.fxRing(o.x, o.y, '#ff7043', bgr, 0.4, 4);
          this.fxParticle(o.x, o.y, '#ffab40', 8, bgr * 0.8, 0.5, 140, 5);
          this.fxFlash(o.x, o.y, '#ff9f43');
        }
      };
      // 主目标：立即伤害（保持技能链/点燃时序）+ 一枚可见火球弹道（仍直瞄）+ 命中结算（散射/爆炸）
      const aim0 = aimOf(e, 0);
      this.damage(e, perDmg, 'fire');
      strike(e, perDmg, Math.atan2(aim0.ty - fsy, aim0.tx - fsx));
      g.fx.push(Object.assign({ type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', target: e, aim: true, scale: 1.35 }, aim0));
      // 额外火球：无目标散射——扇形范围内随机角度（基准垂直向上），垂直射界，沿途碰撞命中即止
      const maxOff = (n - 2) * 0.08;   // 扇形半角（弧度）：5 枚 ±0.24 / 6 枚 ±0.32 / 7 枚 ±0.40
      for (let i = 0; i < n - 1; i++) {
        const off = (Math.random() * 2 - 1) * maxOff;   // 扇形范围内随机角度发射
        const tx = fsx + Math.sin(off) * R;
        const ty = fsy - Math.cos(off) * R;
        const fball = { type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', aim: true, scale: 1.35, tx, ty };
        this.shots.push({ key: 'fire', scatter: true, dmg: perDmg, t: 0, dur, sx: fsx, sy: fsy, tx, ty, hitR, onHit: strike });
        g.fx.push(fball);
      }
    } else {
      this.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
    }
    // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
    // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
    if (big > 0 && multi <= 0) {
      const r = 130 * (1 + 0.30 * this.branchLv('fire', '大火球', 'A'));
      const splDmg = dmg * 0.48 * (1 + 0.20 * this.branchLv('fire', '大火球', 'B'));
      const igniteProb = 0.50 * this.branchLv('fire', '大火球', 'C');
      this.enemies().forEach((o) => {
        if (o === e || o.hp <= 0) return;
        const d2 = Math.hypot(o.x - e.x, o.y - e.y);
        if (d2 <= r) {
          this.damage(o, splDmg, 'fire');
          if (igniteProb > 0 && Math.random() < igniteProb) this.applyBurn(o, dmg, 'fire');
          // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
          if (g.run.relic3('fire_nuke') && d2 > r * 0.5) {
            o.y = Math.max(50, o.y - 40);
            this.applyBurn(o, dmg, 'fire');
            this.fxParticle(o.x, o.y, '#ff9f43', 3, 24, 0.3, 100, 4);
          }
        }
      });
      // 大火球视觉：大爆炸环 + 火焰粒子
      this.fxRing(e.x, e.y, '#ff7043', r, 0.4, 4);
      this.fxParticle(e.x, e.y, '#ffab40', 10, r, 0.5, 160, 6);
      this.fxFlash(e.x, e.y, '#ff9f43');
    }
  }

  applyBurn(e, dmg, src) {
    const bLv = this.branchLv('fire', '点燃', 'B');       // 炽热：灼烧时间 +2/+3/+4s
    const cLv = this.branchLv('fire', '点燃', 'C');       // 余烬：伤害 +20/40/60%、时长 -0.5/1/1.5s、结束爆炸
    const stackCap = this.branchLv('fire', '灼烧', 'A');  // 业火：叠层上限 +1/级
    const hasBurn = this.lv('fire', '灼烧');
    const maxStack = hasBurn > 0 ? 2 + stackCap : 1;      // 学「灼烧」后基础上限 +2 层
    let dot = e.dots.find((d) => d.type === 'burn');
    const tickI = 0.5;
    const cBoost = cLv > 0 ? SKILL_NUM.fire['点燃'].emberDmg[cLv] : 0;
    // v1.16.96 薪柴3★：灼烧概率溢出（≥80%）转灼烧伤害加成
    const fuelBoost = this.game.run._fuelBoost || 0;
    const dps = dmg * 0.20 * (1 + cBoost) * (1 + fuelBoost / 100);
    let ttl = 3 + (bLv > 0 ? SKILL_NUM.fire['点燃'].heatTtl[bLv] : 0);
    if (cLv > 0) ttl -= SKILL_NUM.fire['点燃'].emberTtlCut[cLv];
    if (ttl < 0.5) ttl = 0.5;
    if (!dot) {
      e.dots.push({ type: 'burn', dps, ttl, stack: 1, maxStack, tickT: 0, src, tickI });
      dot = e.dots[e.dots.length - 1];
    } else {
      dot.stack = Math.min(dot.maxStack || maxStack, dot.stack + 1);
      dot.dps = dps * dot.stack;
      dot.ttl = ttl;
      dot.tickI = tickI;
    }
    // 灼烧 B 燃尽：满层 → 小爆炸（60% 攻击伤害，范围 30/60/90px）
    const burnLv = this.branchLv('fire', '灼烧', 'B');
    // v1.16.96 赤印3★：灼烧叠满层时触发爆发（80% 攻击伤害，半径 60码）——与 B 燃尽可并存
    if (this.game.run.relic3('fire_seal') && dot.stack >= maxStack) {
      dot.stack = 1;
      this.explode(e.x, e.y, 60, dmg * 0.8, 'fire');
      this.fxRing(e.x, e.y, '#ffab40', 60, 0.45, 5);
      this.fxFlash(e.x, e.y, '#ffd24a');
    }
    if (burnLv > 0 && dot.stack >= maxStack) {
      dot.stack = 1;
      const rB = SKILL_NUM.fire['灼烧'].burnRadius[burnLv];
      this.explode(e.x, e.y, rB, dmg * 0.6, 'fire');
      this.fxRing(e.x, e.y, '#ff7043', rB, 0.4, 4);
      this.fxFlash(e.x, e.y, '#ff9f43');
    }
  }



  tickFire(dt) {
    const g = this.game;
    // 火·火柱：每 10 秒（触发间隔保持原值，v1.13.10）随机 1 个敌人召唤火柱（150% 伤害·半径120；A 爆发+50%/级、B 扩展+40%/级、C 余烬地面 3 秒 30%/s）
    // v1.13.9：伤害延迟到地面圈画完（约 0.6s）后结算，动画与伤害节奏一致
    const pillar = this.lv('fire', '火柱');
    if (pillar > 0) {
      this.timers.firePillar = (this.timers.firePillar || 0) + dt;
      if (this.timers.firePillar >= 10 * this._weakPeriod('fire')) {
        this.timers.firePillar = 0;
        this.castEnergy('fire', '火柱');
        // v1.16.96 焚天3★：火柱施放后 3 秒内全塔攻速 +25%
        if (g.run.relic3('fire_burnall')) g.run._burnallTtl = 3;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const tgt = alive[Math.floor(Math.random() * alive.length)];
          const pDmg = this.shotDmg('fire', true) * 1.2 * (1 + 0.30 * this.branchLv('fire', '火柱', 'A'));   // 深火 30%/级
          const pR = 120 * (1 + 0.20 * this.branchLv('fire', '火柱', 'B'));                            // 燎原 20%/级
          const emberLv = this.branchLv('fire', '火柱', 'C');
          this.pillarWaves = this.pillarWaves || [];
          // v1.16.96 熔心3★：火柱结算时给中心目标上「火伤+15% 标记」（5s，叠2层）
          this.pillarWaves.push({ t: 0.6, x: tgt.x, y: tgt.y, r: pR, dmg: pDmg, ember: emberLv, e: tgt });
          // 火柱视觉：地上火圈标记 → 冲天圆柱火柱（帧动画，dur 2.4s 放慢一倍）
          g.fx.push({ type: 'pillar', x: tgt.x, y: tgt.y, r: pR, t: 0, dur: 2.4, seed: Math.random() * 100 });
          this.fxParticle(tgt.x, tgt.y - 10, '#ffd24a', 4, 60, 0.5, 150, 5);
        }
      }
      // 延迟伤害结算：圈标记完成后火柱爆发
      if (this.pillarWaves && this.pillarWaves.length) {
        const remaining = [];
        for (const wv of this.pillarWaves) {
          wv.t -= dt;
          if (wv.t <= 0) {
            this.explode(wv.x, wv.y, wv.r, wv.dmg, 'fire');
            // v1.16.96 熔心3★：命中目标受火伤 +15%（5s，可叠 2 层）
            if (g.run.relic3('fire_core') && wv.e && wv.e.hp > 0) {
              const coreN = Math.min(2, ((wv.e._core && wv.e._core.n) || 0) + 1);
              wv.e._core = { n: coreN, ttl: 5 };
            }
            if (wv.ember > 0) {
              this.groundDots = this.groundDots || [];
              this.groundDots.push({ x: wv.x, y: wv.y, r: wv.r, ttl: 3, dps: this.shotDmg('fire', true) * 0.15 * wv.ember, key: 'fire' });   // 余烬 15%/级（C1 15%→C3 45%）
            }
          } else {
            remaining.push(wv);
          }
        }
        this.pillarWaves = remaining;
      }
    }
    // 火·烈焰墙（v1.16.21 重做，替换原「火焰鹰眼」）：每 15 秒在最近怪物处释放可穿越火墙（长180px·宽45px·持续6s）
    //   释放瞬间对墙区域敌人造成 50% 攻击伤害（A 神火 +20/40/60%）；墙持续期间每 0.5s 灼烧 + C 迟滞减速 10/20/30%
    const wall = this.lv('fire', '烈焰墙');
    if (wall > 0) {
      this.timers.fireWall = (this.timers.fireWall || 0) + dt;
      if (this.timers.fireWall >= 15 * this._weakPeriod('fire')) {
        this.timers.fireWall = 0;
        this.castEnergy('fire', '烈焰墙');
        // v1.16.96 焚天3★：火墙施放后 3 秒内全塔攻速 +25%
        if (g.run.relic3('fire_burnall')) g.run._burnallTtl = 3;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const tgt = alive.reduce((a, b) => (b.y > a.y ? b : a));   // 最近怪物 = 离塔/城墙最近（y 最大）
          const aLv = this.branchLv('fire', '烈焰墙', 'A');   // 神火 +20/40/60%
          const bLv = this.branchLv('fire', '烈焰墙', 'B');   // 引燃 范围 +20/40/60%
          const cLv = this.branchLv('fire', '烈焰墙', 'C');   // 迟滞 减速 10/20/30%
          const w = 180 * (1 + SKILL_NUM.fire['烈焰墙'].range[bLv]);
          const h = 45 * (1 + SKILL_NUM.fire['烈焰墙'].range[bLv]);
          const wDmg = this.shotDmg('fire', true) * 0.50 * (1 + SKILL_NUM.fire['烈焰墙'].dmg[aLv]);
          // v1.16.96 火舌3★：火墙命中塔攻击范围外的敌人时，伤害 ×1.5
          const tongue = g.run.relic3('fire_tongue') ? 1.5 : 1;
          this.enemies().forEach((o) => {
            if (o.hp > 0 && Math.abs(o.x - tgt.x) <= w / 2 && o.y >= tgt.y - h / 2 && o.y <= tgt.y + h / 2) {
              const out = !this.inTowerRange('fire', o.x, o.y);
              this.damage(o, wDmg * (out ? tongue : 1), 'fire');
            }
          });
          this.fireWalls = this.fireWalls || [];
          this.fireWalls.push({ x: tgt.x, y: tgt.y, w, h, ttl: 6, cLv, tick: 0 });
          g.fx.push({ type: 'fireWall', x: tgt.x, y: tgt.y, w, h, t: 0, dur: 6, seed: Math.random() * 100 });
        }
      } else {
        // 墙持续（触发帧不扣 ttl，从下一帧开始计时）：每 0.5s 对墙内敌人灼烧；C 迟滞减速（10/20/30%）
        if (this.fireWalls && this.fireWalls.length) {
          const rem = [];
          for (const wl of this.fireWalls) {
            wl.ttl -= dt;
            wl.tick -= dt;
            if (wl.ttl <= 0) continue;
            if (wl.tick <= 0) {
              wl.tick = 0.5;
              this.enemies().forEach((o) => {
                if (o.hp <= 0) return;
                if (Math.abs(o.x - wl.x) <= wl.w / 2 && o.y >= wl.y - wl.h / 2 && o.y <= wl.y + wl.h / 2) {
                  // v1.16.96 火舌3★：墙内射程外敌人灼烧伤害 ×1.5；火墙增烈3★：停留计时累积（伤害递增挂 damage 乘区）
                  const out = !this.inTowerRange('fire', o.x, o.y);
                  if (g.run.relic3('fire_wall')) o._wallStay = (o._wallStay || 0) + 0.5;
                  this.applyBurn(o, this.shotDmg('fire', true) * (out && g.run.relic3('fire_tongue') ? 1.5 : 1), 'fire');
                  if (wl.cLv > 0) {
                    const sm = 1 - SKILL_NUM.fire['烈焰墙'].slow[wl.cLv];
                    if (!o.slow || o.slow.mult > sm) o.slow = { mult: sm, ttl: 0.6 };
                  }
                }
              });
            }
            rem.push(wl);
          }
          this.fireWalls = rem;
        }
      }
    }
    // 火·火雨：每 12 秒（触发间隔保持原值，v1.13.10）在索敌区域降下火雨
    // v1.16.21 机制重做：分 3 波结算伤害，每 0.5s 一波，每波对火雨圈内敌人造成 24% 伤害（B 猛烈 +40/80/120%·档位）；
    //   C 由「引燃」改为「扩张」范围 +20/40/60%；波内动画保留（3 批×2-5 颗独立落下），伤害在整波落地后结算一次并灼烧
    const fireRain = this.lv('fire', '火雨');
    if (fireRain > 0) {
      this.timers.fireRain = (this.timers.fireRain || 0) + dt;
      if (this.timers.fireRain >= 12 * this._weakPeriod('fire')) {
        this.timers.fireRain = 0;
        this.castEnergy('fire', '火雨');
        // v1.16.96 焚天3★：火雨施放后 3 秒内全塔攻速 +25%
        if (g.run.relic3('fire_burnall')) g.run._burnallTtl = 3;
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('fire', e.x, e.y));
        if (alive.length) {
          const bLv = this.branchLv('fire', '火雨', 'B');
          const cLv = this.branchLv('fire', '火雨', 'C');
          const segR = 140 * (1 + SKILL_NUM.fire['火雨'].radius[cLv]);       // 火雨圈半径（C 扩张 +20/40/60%）
          const perR = 80;                                        // 火雨点视觉落点半径
          const segDmg = this.shotDmg('fire', true) * 0.24 * (1 + SKILL_NUM.fire['火雨'].segDmg[bLv]);   // 每波 24% 伤害（B +40/80/120%）
          const waves = 3 + this.branchLv('fire', '火雨', 'A');   // 基础 3 波，A 波次 +1
          const gap = 0.5;                                        // 每 0.5s 一波
          const FALL = 0.5;                                        // 单颗下落时长（与 render raindrop 同步）
          const tgt = alive[Math.floor(Math.random() * alive.length)];
          const px = tgt.x + (Math.random() - 0.5) * 20;
          const py = tgt.y + (Math.random() - 0.5) * 20;
          this.rainWaves = this.rainWaves || [];
          for (let w = 0; w < waves; w++) {
            const w0 = w * gap;
            // 区域圈 fx：整波持续（生成 0.1s + 下落 0.5s + 落地余焰）
            g.fx.push({ type: 'rain', x: px, y: py, r: segR, t: -w0, dur: 0.1 + FALL + 0.25, seed: Math.random() * 100 });
            // 波内视觉：3 批，0.1s 内随机时刻生成，每批 2-5 颗，独立落下（伤害按整波在最后落地时刻结算一次）
            for (let b = 0; b < 3; b++) {
              const cnt = 2 + Math.floor(Math.random() * 4);   // 2-5 颗
              for (let k = 0; k < cnt; k++) {
                const ang = Math.random() * Math.PI * 2;
                const rr = Math.sqrt(Math.random()) * segR * 0.95;  // 圈内均匀采样
                const dx = px + Math.cos(ang) * rr;
                const dy = py + Math.sin(ang) * rr;
                const s = Math.random() * 0.1;            // 0.1s 内随机生成时刻
                g.fx.push({ type: 'raindrop', x: dx, y: dy - 260, tx: dx, ty: dy, t: -(w0 + s), dur: FALL + 0.25, r: perR, seed: Math.random() * 100 });
              }
            }
            // 每波一次结算：全部颗落地后（t = w0 + 0.1 + FALL）对火雨圈内敌人造成 24% 伤害并灼烧
            // v1.16.96 天火3★：火雨最后一波升级为天火一击（单点 120% 伤害）
            this.rainWaves.push({ t: w0 + 0.1 + FALL, px, py, r: segR, dmg: segDmg, skyfire: g.run.relic3('fire_skyfire') && w === waves - 1 });
          }
          this.fxParticle(px, py, '#ffd24a', 3, 30, 0.4, 100, 4);
        }
      }
      // 延迟结算：每波在全部颗落地后对火雨圈内敌人结算 24% 伤害 + 灼烧（v1.16.21 由每颗结算改为每波结算）
      if (this.rainWaves && this.rainWaves.length) {
        const remaining = [];
        for (const wv of this.rainWaves) {
          wv.t -= dt;
          if (wv.t <= 0) {
            // v1.16.96 天火3★：末波升级为天火一击——圈内最靠城墙敌人单点 120% 伤害（取代范围结算）
            if (wv.skyfire) {
              const top = this.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - wv.px, o.y - wv.py) <= wv.r)
                .sort((a, b) => b.y - a.y)[0];
              if (top) {
                this.damage(top, this.shotDmg('fire', true) * 1.2, 'fire');
                this.fxFlash(top.x, top.y, '#ffffff', 0.4);
                this.fxRing(top.x, top.y, '#ff7043', 90, 0.5, 6);
                this.fxParticle(top.x, top.y, '#ffd24a', 10, 80, 0.5, 180, 6);
              }
            } else {
              this.enemies().forEach((o) => {
                if (o.hp > 0 && Math.hypot(o.x - wv.px, o.y - wv.py) <= wv.r) {
                  this.damage(o, wv.dmg, 'fire');
                  this.applyBurn(o, wv.dmg, 'fire');   // 灼烧（叠层 DoT）
                  // v1.16.96 燃尽加速3★：火雨每波落地时，灼烧状态敌人额外小爆炸（50% 伤害，半径 80 码）
                  if (g.run.relic3('fire_hasten') && this.hasDot(o, 'burn')) {
                    this.explode(o.x, o.y, 80, this.shotDmg('fire', true) * 0.5, 'fire');
                  }
                }
              });
            }
            // 落地余焰（轻量，替代 explode 重特效）
            this.fxParticle(wv.px, wv.py, '#ff7043', 5, wv.r * 0.5, 0.3, 120, 4);
            this.fxRing(wv.px, wv.py, '#ff9f43', wv.r, 0.35, 3);
          } else {
            remaining.push(wv);
          }
        }
        this.rainWaves = remaining;
      }
    }
  }

  // ===== tickIce =====


  /* ============ 冰塔 ============ */
  hitIce(e, dmg) {
    this.damage(e, dmg, 'ice');
    // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
    this.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);
    this.fxParticle(e.x, e.y, '#a9d6f5', 4, 62, 0.35, 90, 4);
    this.fxRing(e.x, e.y, '#d6f0ff', 16, 0.2, 2);
    // 普攻冰缓+冰冻（v1.16.21→v1.16.53 统一判定）：冰缓基础 20%（寒霜 +25% + A 极寒每级 +15%）；
    //   冰冻学技能后 20%（A 档位）；强化攻击同吃此加成
    this.tryAttackDebuff('ice', e, dmg);
    // 多重冰锥（v1.13.23 仿多重火球）：主目标直瞄 + 额外冰锥等角度扇形散射（无目标，射界消失或命中即止）
    //         A 增锥 3→4→5 枚 / B 凝霜 +15%/枚 / C 增殖（v1.16.21）：10/14/18 枚超小型冰锥（1/3大小·每枚10%·各自索敌·20%冰缓）
    const multi = this.lv('ice', '多重冰锥');
    if (multi > 0) {
      const g = this.game;
      // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
      const mz = this.towerMuzzle('ice');
      const msx = mz.x, msy = mz.y;
      const aLv = this.branchLv('ice', '多重冰锥', 'A');
      const bLv = this.branchLv('ice', '多重冰锥', 'B');
      const cLv = this.branchLv('ice', '多重冰锥', 'C');
      const dur = CONFIG.TOWERS.ice.shot.dur;
      const R = this.range('ice');                 // 射界半径（= 塔射程）
      if (cLv > 0) {
        // C 增殖：10/14/18 枚超小型冰锥各自索敌（循环锁定射程内敌人直飞），每枚 10% 伤害（A 数量叠加、B 伤害叠加），命中 20% 冰缓
        const n = SKILL_NUM.ice['多重冰锥'].swarm[cLv] + aLv;
        const perDmg = dmg * 0.10 * (1 + 0.15 * bLv);
        const hitR = 30;                             // 超小冰锥碰撞半径更小
        const strike = (o, d) => {
          this.damage(o, d, 'ice');
          this.tryAttackDebuff('ice', o, d);   // v1.16.53 增殖超小冰锥属普攻强化：统一冰缓/冰冻判定（吃寒霜/冰冻技能加成）
          this.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
          this.fxRing(o.x, o.y, '#7fd4ff', 16, 0.2, 2);
        };
        const targets = this.enemies().filter((o) => o.hp > 0 && this.inTowerRange('ice', o.x, o.y));
        for (let i = 0; i < n; i++) {
          const tgt = targets.length ? targets[i % targets.length] : e;   // 各自索敌：循环分配射程内目标
          this.shots.push({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: tgt.x, ty: tgt.y, hitR, onHit: strike });
          g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 0.38, tx: tgt.x, ty: tgt.y });
        }
        // 主目标也受一枚小冰锥伤害（增殖时无直瞄主目标概念，主目标被环形索敌覆盖）
        this.damage(e, perDmg, 'ice');
        this.fxFlash(e.x, e.y, '#7fd4ff', 0.2);
      } else {
        const n = 3 + aLv;                                  // 基础 3 枚 = 主 + 2 散射（v1.16.20 修正为 3+分支级）
        const perDmg = dmg * 0.55 * (1 + 0.15 * bLv);
        const hitR = 45;                                     // 散射冰锥碰撞半径
        const strike = (o, d) => {                           // 命中结算（主目标直瞄与散射弹道共用）
          this.damage(o, d, 'ice');
          this.tryAttackDebuff('ice', o, d);   // v1.16.53 多重冰锥散射属普攻强化：统一冰缓/冰冻判定
          this.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
          this.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
          this.fxFlash(o.x, o.y, '#7fd4ff', 0.2);
        };
        // 主目标：立即伤害 + 一枚可见直瞄冰锥弹道
        this.damage(e, perDmg, 'ice');
        g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, tx: e.x, ty: e.y, t: 0, dur, key: 'ice', target: e, aim: true, scale: 1.15 });
        // 额外冰锥：等角度扇形（均匀分布在 ±maxOff，主目标角度 0 两侧）
        const maxOff = (n - 2) * 0.08;
        for (let i = 0; i < n - 1; i++) {
          const off = n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0;
          const tx = msx + Math.sin(off) * R;
          const ty = msy - Math.cos(off) * R;
          const icicle = { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 1.15, tx, ty };
          this.shots.push({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx, ty, hitR, onHit: strike });
          g.fx.push(icicle);
        }
      }
    }
    // 碎冰（v1.13.24 原低温全塔改；v1.16.21 分支重做）：冰锥命中目标后碎裂成 3 枚小碎冰，飞行速度与原冰锥一致，
    //   沿弹道方向呈 60° 角散射（±30°），碎冰命中敌人即止（不穿透）
    //   A 裂片 +1/级（3→4→5）、B 碎劲 伤害档位 +15%/30%/45%、C 冻结 命中 5%/10%/15% 几率冻结 2s
    const shard = this.lv('ice', '碎冰');
    if (shard > 0) {
      const g = this.game;
      // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
      const mz = this.towerMuzzle('ice');
      const msx = mz.x, msy = mz.y;
      const len = Math.hypot(e.x - msx, e.y - msy) || 1;
      const dx = (e.x - msx) / len, dy = (e.y - msy) / len;   // 弹道方向（继续向前 = 敌人身后）
      const n = 3 + this.branchLv('ice', '碎冰', 'A');
      const dmg = this.shotDmg('ice') * 0.45 * (1 + SKILL_NUM.ice['碎冰'].dmg[this.branchLv('ice', '碎冰', 'B')]);
      const frzP = SKILL_NUM.ice['碎冰'].frz[this.branchLv('ice', '碎冰', 'C')];
      const sx = e.x + dx * 55, sy = e.y + dy * 55;   // 越过主目标，避免立即重复命中
      const R = this.range('ice');
      const dur = CONFIG.TOWERS.ice.shot.dur;
      const hitR = 45;
      const strike = (o, d) => {
        this.damage(o, d, 'ice');
        this.tryAttackDebuff('ice', o, d);   // v1.16.53 碎冰小碎冰属普攻强化：统一冰缓/冰冻判定（C 冻结为其专属保留）
        // v1.13.27 碎冰命中：冰晶迸发 + 闪光 + 小环
        this.fxFlash(o.x, o.y, '#d6f0ff', 0.22);
        this.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
        this.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
        // C 冻结：命中 5%/10%/15% 几率冻结 2s
        if (frzP > 0 && Math.random() < frzP) {
          o.frozen = Math.max(o.frozen || 0, 2);
          this.fxFlash(o.x, o.y, '#d6f0ff', 0.3);
          this.fxRing(o.x, o.y, '#7fd4ff', 40, 0.35, 3);
        }
      };
      const baseA = Math.atan2(dy, dx);
      const spread = Math.PI / 6;   // 60° 总散射角（±30°）
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
        const a = baseA + off;
        const tx = sx + Math.cos(a) * R;
        const ty = sy + Math.sin(a) * R;
        this.shots.push({ key: 'ice', scatter: true, dmg, t: 0, dur, sx, sy, tx, ty, hitR, onHit: strike });
        g.fx.push({ type: 'shot', kind: 'line', color: '#7fd4ff', x: sx, y: sy, t: 0, dur, key: 'ice', aim: true, scale: 0.85, tx, ty });
      }
    }
    // 冰穿刺（v1.16.21 重做，原「冰锥穿透」未实装补全）：弹道可穿透敌人（基础 1 名）
    //   A 冰穿 穿透目标 +1/+2/+3（1→2/3/4 名）；B 透射 穿透后伤害 +30%/60%/90%；C 冰霜透射 命中后对敌人身后 60px·90° 扇形造成 30%/40%/50% 伤害
    const pierce = this.lv('ice', '冰穿刺');
    if (pierce > 0) {
      const g = this.game;
      // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
      const mz = this.towerMuzzle('ice');
      const psx = mz.x, psy = mz.y;
      const dirLen = Math.hypot(e.x - psx, e.y - psy) || 1;
      const ddx = (e.x - psx) / dirLen, ddy = (e.y - psy) / dirLen;   // 弹道方向（塔→目标）
      const aLv = this.branchLv('ice', '冰穿刺', 'A');
      const bLv = this.branchLv('ice', '冰穿刺', 'B');
      const cLv = this.branchLv('ice', '冰穿刺', 'C');
      const pierceN = 1 + aLv;   // 基础 1 名 + A 每级 1 → 1/2/3/4
      // 穿透目标：沿弹道方向位于目标身后（远离塔侧）的敌人，按投影距离排序
      const cands = this.enemies().filter((o) => o.hp > 0 && o !== e
          && ((o.x - e.x) * ddx + (o.y - e.y) * ddy) > 20)
        .sort((a, b) => ((a.x - e.x) * ddx + (a.y - e.y) * ddy) - ((b.x - e.x) * ddx + (b.y - e.y) * ddy));
      for (let i = 0; i < Math.min(pierceN, cands.length); i++) {
        const pT = cands[i];
        const pDmg = dmg * (1 + SKILL_NUM.ice['冰穿刺'].pierceDmg[bLv]);   // B 透射 +30/60/90%
        this.damage(pT, pDmg, 'ice');
        this.fxParticle(pT.x, pT.y, '#b8e6ff', 5, 40, 0.3, 110, 4);
        this.fxRing(pT.x, pT.y, '#a9d6f5', 20, 0.2, 2);
      }
      // C 冰霜透射：对敌人身后 60px·90° 扇形区域（以弹道方向为中轴 ±45°）造成伤害
      if (cLv > 0) {
        const fDmg = this.shotDmg('ice') * SKILL_NUM.ice['冰穿刺'].cone[cLv];
        this.enemies().forEach((o) => {
          if (o.hp <= 0 || o === e) return;
          const proj = (o.x - e.x) * ddx + (o.y - e.y) * ddy;          // 沿弹道方向投影（正=身后）
          const side = Math.abs((o.x - e.x) * ddy - (o.y - e.y) * ddx); // 侧向距离
          if (proj > 0 && proj <= 60 && side <= proj) this.damage(o, fDmg, 'ice');   // ±45°（90° 扇形）
        });
        this.fxParticle(e.x, e.y, '#d6f0ff', 8, 70, 0.35, 130, 5);
        this.fxRing(e.x, e.y, '#b8e6ff', 42, 0.3, 3);
      }
    }
  }

  tickIce(dt) {
    const g = this.game;
    // 冰·冰花（v1.13.23 原霜星改周期技；v1.16.21 分支重做）：每 8 秒对最近 N 个敌人召唤冰花（爆炸范围 100·本体 80% 伤害；
    //     A 扩张 范围 +20/40/60%、B 霜力 伤害 +20/40/60%、C 繁花 数量 +1/+2/+3；原 A 碎散传染移除）
    const flower = this.lv('ice', '冰花');
    if (flower > 0) {
      this.timers.iceFlower = (this.timers.iceFlower || 0) + dt;
      if (this.timers.iceFlower >= 8 * this._weakPeriod('ice')) {
        this.timers.iceFlower = 0;
        this.castEnergy('ice', '冰花');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('ice', e.x, e.y));
        if (alive.length) {
          const n = 1 + SKILL_NUM.ice['冰花'].n[this.branchLv('ice', '冰花', 'C')];
          const dmg = this.shotDmg('ice') * 0.8 * (1 + SKILL_NUM.ice['冰花'].dmg[this.branchLv('ice', '冰花', 'B')]);
          const r = 100 * (1 + SKILL_NUM.ice['冰花'].radius[this.branchLv('ice', '冰花', 'A')]);
          const targets = alive.sort((a, b) => b.y - a.y).slice(0, n);   // 最近敌人（靠城墙侧优先）
          targets.forEach((tgt) => {
            // v1.16.9 伤害改为延迟到冰花第 3 帧动画末尾（dur 1.1s ÷ 4 帧 ≈ 0.275s/帧 → 0.825s≈0.8s）结算，
            // 此时冰花绽放完成"爆炸"，一并触发范围伤害与扩散演出
            const fxDmg = dmg;
            const fxR = r;
            this.delayed.push({
              x: tgt.x, y: tgt.y, r: fxR, dmg: fxDmg, delay: 0.8, t: 0, key: 'ice',
              fn: (cb) => {
                const hitOnes = cb.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - tgt.x, o.y - tgt.y) <= fxR);
                hitOnes.forEach((o) => cb.damage(o, fxDmg, 'ice'));
                // 爆炸演出：扩散冰环 + 冰晶碎瓣 + 闪光（与伤害同时）
                cb.fxRing(tgt.x, tgt.y, '#7fd4ff', fxR, 0.5, 5);
                cb.fxParticle(tgt.x, tgt.y, '#b8e6ff', 16, 90, 0.6, 160, 6);
                cb.fxFlash(tgt.x, tgt.y, '#7fd4ff');
              }
            });
            // 冰花视觉：绽放六瓣冰花本体 + 扩散冰环 + 冰晶碎瓣 + 闪光（v1.13.26）
            this.game.fx.push({ type: 'shot', kind: 'icebloom', x: tgt.x, y: tgt.y, r: fxR, t: 0, dur: 1.1 });
          });
        }
      }
    }
    // 冰·冬珠（v1.13.23 原冻结率改持续球；v1.16.21 分支重做）：每 10 秒释放冰霜之球，球持续 5s，期内周期对周围造成伤害
    //     A 寒域 范围减速 20%/30%/40%；B 扩张 范围 +20/40/60%；C 凝华 伤害频率 0.7/0.55/0.4 秒一跳（原数量+1 移除）
    const orbSkill = this.lv('ice', '冬珠');
    if (orbSkill > 0) {
      this.timers.frostOrb = (this.timers.frostOrb || 0) + dt;
      if (this.timers.frostOrb >= 10 * this._weakPeriod('ice')) {
        this.timers.frostOrb = 0;
        this.castEnergy('ice', '冬珠');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('ice', e.x, e.y));
        if (alive.length) {
          const r = 110 * (1 + SKILL_NUM.ice['冬珠'].radius[this.branchLv('ice', '冬珠', 'B')]);
          const cLv = this.branchLv('ice', '冬珠', 'C');
          const tickI = cLv > 0 ? SKILL_NUM.ice['冬珠'].tickI[cLv] : 0.8;
          const slowMult = SKILL_NUM.ice['冬珠'].slowMult[this.branchLv('ice', '冬珠', 'A')];
          const dmg = this.shotDmg('ice') * 0.44;   // v1.16.11 平衡：冬珠每跳 0.55→0.44×普攻
          const spots = alive.sort((a, b) => b.y - a.y).slice(0, 1);   // 最近 1 个敌人位置落球（C 不再增加数量）
          this.frostOrbs = this.frostOrbs || [];
          spots.forEach((sp) => {
            this.frostOrbs.push({ x: sp.x, y: sp.y, r, ttl: 5, tickT: 0, tickI, dmg, slowMult });
            this.game.fx.push({ type: 'shot', kind: 'frostorb', x: sp.x, y: sp.y, r, t: 0, dur: 5 });
            // v1.13.27 冬珠浮现光效：冰球凝现闪光 + 冰雾
            this.fxFlash(sp.x, sp.y, '#d6f0ff', 0.3);
            this.fxParticle(sp.x, sp.y, '#b8e6ff', 8, 70, 0.5, 140, 5);
          });
        }
      }
      // 冬珠持续推进（每跳范围伤害 + 减速）
      if (this.frostOrbs && this.frostOrbs.length) {
        const remain = [];
        for (const ob of this.frostOrbs) {
          ob.ttl -= dt;
          if (ob.ttl <= 0) { this.fxRing(ob.x, ob.y, '#7fd4ff', ob.r * 0.6, 0.3, 3); continue; }
          ob.tickT -= dt;
          if (ob.tickT <= 0) {
            ob.tickT += ob.tickI;
            this.enemies().forEach((o) => {
              if (o.hp <= 0 || Math.hypot(o.x - ob.x, o.y - ob.y) > ob.r) return;
              this.damage(o, ob.dmg, 'ice');
              if (ob.slowMult > 0) this.applySlow(o, ob.slowMult, 1);
            });
            this.fxRing(ob.x, ob.y, '#b8e6ff', ob.r * 0.5, 0.35, 3);
          }
          remain.push(ob);
        }
        this.frostOrbs = remain;
      }
    }
    // 冰墙（v1.13.25 原永冻改，驻场城墙护盾；v1.16.21 数值重做）：每 20 秒为城墙附魔冰盾，持续 10s，
    //     抵御 300 伤害；攻击冰墙的敌人减速 40% + 攻击间隔 +0.5s（由 main.js 攻城段结算吸收/反伤/迟缓）
    //     A 凝壁 持续 +2/+4/+6s（档位式）；B 霜反 反伤 30%/60%/90%；C 融暖 结束回血 +50/+100/+150
    const wallSkill = this.lv('ice', '冰墙');
    if (wallSkill > 0) {
      this.timers.iceWall = (this.timers.iceWall || 0) + dt;
      // 冰墙驻场推进（ttl 递减，结束回血 + 消散特效）
      const iw = this.iceWall;
      if (iw && iw.ttl > 0) {
        iw.ttl -= dt;
        if (iw.ttl <= 0) {
          if (iw.heal > 0 && this.game.run) {
            const maxHp = this.game.run.lineMaxHp || CONFIG.LINE.hp;
            this.game.run.lineHp = Math.min(maxHp, this.game.run.lineHp + iw.heal);
          }
          // v1.16.47：冰盾碎裂白光一闪（v1.16.53 扩散环扩至整墙）
          this.fxFlash(375, this.ly().wallY, '#ffffff', 0.3);
          this.fxRing(375, this.ly().wallY, '#7fd4ff', 700, 0.5, 5);
          this.fxParticle(375, this.ly().wallY, '#b8e6ff', 16, 90, 0.6, 160, 6);
          this.iceWall = null;
        }
      }
      if (this.timers.iceWall >= 20 * this._weakPeriod('ice')) {
        this.timers.iceWall = 0;
        this.castEnergy('ice', '冰墙');
        this.iceWall = {
          ttl: 10 + SKILL_NUM.ice['冰墙'].ttl[this.branchLv('ice', '冰墙', 'A')],   // 基础 10s + A 档位 +2/+4/+6s
          absorb: 300,   // v1.16.21：基础抵御 300 点伤害
          reflect: SKILL_NUM.ice['冰墙'].reflect[this.branchLv('ice', '冰墙', 'B')],   // B 反伤 30%/60%/90%
          heal: SKILL_NUM.ice['冰墙'].heal[this.branchLv('ice', '冰墙', 'C')],      // C 融暖结束回血 +50/+100/+150
        };
        this.game.fx.push({ type: 'shot', kind: 'icewall', x: 375, y: this.ly().wallY, r: 700, t: 0, dur: this.iceWall.ttl });   // v1.16.53 r=700 覆盖整座城墙（25~725）
        this.fxRing(375, this.ly().wallY, '#7fd4ff', 700, 0.6, 5);
        this.fxParticle(375, this.ly().wallY, '#b8e6ff', 18, 100, 0.7, 180, 6);
        // v1.16.47：冰盾生成寒光一闪
        this.fxFlash(375, this.ly().wallY, '#d6f0ff');
      }
    }
  }

  // ===== tickElectric =====


  /* ============ 电塔 ============ */
  hitElectric(e, dmg) {
    // 主目标伤害（过载层数为上一击累计，连续命中递增）
    this.damage(e, dmg, 'electric');
    // 过载（v1.16.21 重做）：仅命中麻痹目标叠层（上限 3 层·2s）；A 每 3 层消耗所有过载 → 20%/30%/40% 伤害 + 填充 1 发炮弹；C 满层闪电爆发（不变）
    const over = this.lv('electric', '过载');
    if (over > 0) {
      if (e.paralyzed > 0) {
        if (!e.overload) e.overload = { n: 0, ttl: 2 };
        e.overload.n = Math.min(3, e.overload.n + 1);
        e.overload.ttl = 2;
        // C 分支：满层闪电爆发（每层周期只触发一次，层数清零后重新可触发）
        if (this.branchLv('electric', '过载', 'C') > 0 && e.overload.n >= 3 && !e.overload._burst) {
          e.overload._burst = true;
          const bDmg = this.shotDmg('electric') * 0.8;
          const r = 150;
          this.enemies().forEach((o) => {
            if (o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > r) return;
            this.damage(o, bDmg, 'electric');
            o.paralyzed = Math.max(o.paralyzed || 0, 1.5);
            this.applySlow(o, 0.5, 1.5);
            this.fxFlash(o.x, o.y, '#f4d03f');
          });
          this.fxRing(e.x, e.y, '#f4d03f', r, 0.4, 4);
        }
        // A 分支：每 3 层消耗所有过载 → 20%/30%/40% 伤害 + 填充 1 点能量（封顶能量上限）
        const ovA = this.branchLv('electric', '过载', 'A');
        if (ovA > 0 && e.overload.n >= 3) {
          this.damage(e, this.shotDmg('electric') * SKILL_NUM.electric['过载'].deton[ovA], 'electric');
          this.fxFlash(e.x, e.y, '#f4d03f');
          this.fxRing(e.x, e.y, '#f4d03f', 40, 0.3, 3);
          const maxA = this.game.run.armoryEnergyMax ? this.game.run.armoryEnergyMax() : 50;
          const et = this.tower('electric');
          if (et) et.energy = Math.min(maxA, et.energy + 1);
          e.overload.n = 0;   // 消耗所有过载
        }
      }
    }
    // 麻痹（v1.16.21 调平；v1.16.53 统一判定 + 重调）：电塔基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85%）；
    //   时长 2s + B 0.5s/级；目标减速 50% 并停止攻击；C 导电传导；普攻强化攻击（连锁/活电/电磁场）同吃此判定
    this.tryAttackDebuff('electric', e, dmg);
    // 活电（v1.13.18 改电球，v1.13.19 更名）：命中麻痹中的敌人 → 向四周扩散 N 个随机游走电球（A 分支 +2/级；B 分支伤害 +20%/级；C 分支游走更久）
    const bounce = this.lv('electric', '活电');
    if (bounce > 0 && e.paralyzed > 0) {
      const n = 5 + 2 * this.branchLv('electric', '活电', 'A');
      const orbDmg = dmg * 0.5 * (1 + 0.2 * this.branchLv('electric', '活电', 'B'));
      const oDur = 1.4 + 0.4 * this.branchLv('electric', '活电', 'C');   // v1.13.21 游走时长 0.8→1.4s
      for (let i = 0; i < n; i++) {
        const orb = {
          key: 'electric', dmg: orbDmg, t: 0, dur: oDur,
          x: e.x, y: e.y,
          // v1.16.21 电球均匀向周围扩散：初始角度等分圆周（360°/n）+ 小幅抖动，不再扎堆生成方向
          ang: (Math.PI * 2 / n) * i + (Math.random() - 0.5) * 0.9,
          // v1.16.21 电球速度 +30%：150-230 → 195-299
          speed: (150 + Math.random() * 80) * 1.3,   // v1.13.21 速度 95-155→150-230
          orb: true, fx: null,
        };
        orb.fx = { type: 'shot', kind: 'orb', ref: orb, t: 0, dur: oDur };
        this.shots.push(orb);
        this.game.fx.push(orb.fx);
      }
      this.fxRing(e.x, e.y, '#f4d03f', 44, 0.3, 3);
    }
    // 连锁弹跳（v1.16.21 目标数调整：基础连锁 3 个敌人 + A 每级 +1；B 稳流每级衰减 -20%；C 回能：每次连锁命中缩短攻击间隔）
    const chainLv = this.lv('electric', '连锁');
    const chainA = this.branchLv('electric', '连锁', 'A');
    const chainB = this.branchLv('electric', '连锁', 'B');
    const chainC = this.branchLv('electric', '连锁', 'C');
    if (chainLv > 0) {
      const extra = 2 + 1 * chainA;      // 基础连锁 3 个敌人（主+2）+ A 每级 +1
      let decay = 0.30 * (1 - 0.2 * chainB);   // 基础衰减 30% - B 稳流每级 20%
      decay = Math.max(0.10, decay);
      const hitSet = [e];
      let cur = e;
      for (let i = 0; i < extra; i++) {
        const next = this.enemies().filter((o) => o.hp > 0 && !hitSet.includes(o))
          .sort((a, b) => (Math.hypot(a.x - cur.x, a.y - cur.y)) - (Math.hypot(b.x - cur.x, b.y - cur.y)))[0];
        if (!next) break;
        // 连锁视觉：电弧连线（每次弹跳）
        this.fxBeam(cur.x, cur.y, next.x, next.y, '#f4d03f', 0.25, 3.5);
        let cDmg = dmg * (1 - decay);
        this.damage(next, cDmg, 'electric');
        this.tryAttackDebuff('electric', next, cDmg);   // v1.16.53 连锁命中属普攻强化：统一麻痹判定（吃麻痹技能加成）
        // C 回能：每次连锁命中缩短电塔攻击间隔（3%/级）
        if (chainC > 0 && this.atkTimers.electric !== undefined) {
          this.atkTimers.electric = Math.max(0, this.atkTimers.electric - this.interval('electric') * 0.03 * chainC);
        }
        hitSet.push(next);
        cur = next;
      }
      this.fxRing(e.x, e.y, '#f4d03f', 40 + 12 * chainLv, 0.3, 3);
      this.fxFlash(e.x, e.y, '#f4d03f');
    }
  }

  tickElectric(dt) {
    const g = this.game;
    // 电·极光电击（v1.16.21 电弧重做改名；v1.16.42 修复性调整；v1.16.49 树状分支；v1.16.50 C 裂电；
    //   v1.16.51 基础重做）：每 8 秒电击最近敌人（不再穿透延长线），并向 (100+20×A) 码内分叉电弧命中 3+arcC 个敌人
    //   （各造成主线伤害 40%）；A 扩域：分叉寻敌范围 +20/级（100→120→140→160）；
    //   B 增伤 +20%/级（80→100/120/140%）；C 裂电：分叉命中数量 +1/级（3→4→5→6）
    const arc = this.lv('electric', '极光电击');
    if (arc > 0) {
      const arcA = this.branchLv('electric', '极光电击', 'A');
      const arcB = this.branchLv('electric', '极光电击', 'B');
      const arcC = this.branchLv('electric', '极光电击', 'C');
      this.timers.arc = (this.timers.arc || 0) + dt;
      const period = 8 * this._weakPeriod('electric');   // v1.16.42 周期固定 8 秒（弱化态 ×1.5）
      if (this.timers.arc >= period) {
        this.timers.arc = 0;
        this.castEnergy('electric', '极光电击');
        // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
        const mz = this.towerMuzzle('electric');
        const tx = mz.x, ty = mz.y;
        const range = this.range('electric');
        const alive = this.enemies().filter((e) => e.hp > 0 && Math.abs(ty - e.y) <= range);
        if (alive.length) {
          // 最近的敌人（行距离最小）为电击目标（v1.16.51：不再沿延长线穿透，仅此一目标受主线伤害）
          const nearest = alive.slice().sort((a, b) => Math.abs(ty - a.y) - Math.abs(ty - b.y))[0];
          const dmg = this.shotDmg('electric') * (0.80 + 0.20 * arcB);
          const x1 = tx, y1 = ty, x2 = nearest.x, y2 = nearest.y;
          this.damage(nearest, dmg, 'electric');
          this.fxFlash(nearest.x, nearest.y, '#f4d03f');
          // v1.16.51 分叉电弧：从最近敌向 (100+20×A) 码内分叉 3+arcC 个敌人，各 40% 主线伤害（不递归、不重复）
          const hitSet = new Set([nearest]);
          const branchRange = 100 + 20 * arcA;   // A 扩域：100→120→140→160 码
          const nB = 3 + arcC;                   // C 裂电：3→4→5→6 个
          for (let k = 0; k < nB; k++) {
            const cands = this.enemies().filter((o) => o.hp > 0 && !hitSet.has(o) && Math.hypot(o.x - nearest.x, o.y - nearest.y) <= branchRange);
            if (!cands.length) break;
            const tgt = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
            hitSet.add(tgt);
            this.damage(tgt, dmg * 0.4, 'electric');
            this.fxFlash(tgt.x, tgt.y, '#7fc7ff');
            const cpath = [
              { x: nearest.x, y: nearest.y },
              { x: nearest.x + (tgt.x - nearest.x) * 0.5 + (Math.random() * 26 - 13), y: nearest.y + (tgt.y - nearest.y) * 0.5 + (Math.random() * 26 - 13) },
              { x: tgt.x, y: tgt.y },
            ];
            this.game.fx.push({ type: 'shot', kind: 'zigzag', path: cpath, t: 0, dur: 0.3, color: '#7fc7ff', w: 2.5 });
          }
          // 视觉：塔口 → 最近敌人 金色主弧（v1.16.47 强化粗电弧+光晕；v1.16.49 0.6s）
          const path = [{ x: x1, y: y1 }];
          for (let s = 1; s < 4; s++) {
            const t = s / 4;
            path.push({ x: x1 + (x2 - x1) * t + (Math.random() * 30 - 15), y: y1 + (y2 - y1) * t + (Math.random() * 30 - 15) });
          }
          path.push({ x: x2, y: y2 });
          this.game.fx.push({ type: 'shot', kind: 'zigzag', path, t: 0, dur: 0.6, color: '#ffe08a', w: 5, glow: true });
          this.fxFlash(tx, ty, '#f4d03f');
          this.fxRing(x2, y2, '#f4d03f', 30, 0.3, 3);
          this.fxParticle(nearest.x, nearest.y, '#f4d03f', 6, 50, 0.45, 120, 5);
        }
      }
    }
    const storm = this.lv('electric', '雷暴');
    if (storm > 0) {
      // v1.16.21 雷暴分支调整：A=雷击目标+2/级（3/5/7/9）；B=连雷 30%/45%/60% 几率连锁周边 90px 敌人；C=雷击间隔 -1s/级（10→9/8/7s）
      const cLv = this.branchLv('electric', '雷暴', 'C');
      const period = (10 - 1 * cLv) * this._weakPeriod('electric');   // C0 10 / C1 9 / C2 8 / C3 7s（弱化态 ×1.5）
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= period) {
        this.timers.storm = 0;
        this.castEnergy('electric', '雷暴');
        const aLv = this.branchLv('electric', '雷暴', 'A');
        const bLv = this.branchLv('electric', '雷暴', 'B');
        const n = 3 + 2 * aLv;   // A0 3 / A1 5 / A2 7 / A3 9（与 A +2/级 口径一致）
        const dmg = this.shotDmg('electric') * 0.64 * (1 + 0.25 * (storm - 1));
        // 全图随机 N 个存活目标（Fisher-Yates）
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('electric', e.x, e.y));
        const pool = alive.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        const targets = pool.slice(0, n);
        // 按 y 从上到下分 2-3 批，每批间隔 0.12s（落雷演出分批）
        const sorted = targets.slice().sort((a, b) => a.y - b.y);
        const batches = Math.min(3, Math.max(2, Math.ceil(n / 3)));
        sorted.forEach((e, idx) => {
          const delay = Math.floor(idx * batches / n) * 0.12;
          // 雷击伤害（即时结算）
          this.damage(e, dmg, 'electric');
          // B 分支（v1.16.21 连雷）：雷击 30%/45%/60% 几率连锁周边最近 bLv 个敌人（90px，50% 伤害）
          if (bLv > 0 && Math.random() < SKILL_NUM.poison['瘟疫'].prob[bLv]) {
            const chain = this.enemies().filter((o) => o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= 90)
              .sort((a2, b2) => Math.hypot(a2.x - e.x, a2.y - e.y) - Math.hypot(b2.x - e.x, b2.y - e.y)).slice(0, bLv);
            chain.forEach((o) => {
              this.damage(o, dmg * 0.5, 'electric');
              const cpath = [{ x: e.x, y: e.y }];
              const mx = (e.x + o.x) / 2 + (Math.random() * 14 - 7), my = (e.y + o.y) / 2 + (Math.random() * 14 - 7);
              cpath.push({ x: mx, y: my }, { x: o.x, y: o.y });
              this.game.fx.push({ type: 'shot', kind: 'zigzag', path: cpath, t: 0, dur: 0.3, color: '#7fc7ff', w: 2.5 });
              this.fxFlash(o.x, o.y, '#7fc7ff');
            });
          }
          // 雷暴演出：预兆圈 0.22s → 主闪分叉 → 地面电花（按批 delay 错开）
          this.game.fx.push({ type: 'shot', kind: 'storm', x: e.x, y: e.y, t: 0, dur: delay + 0.55, delay, seed: Math.floor(Math.random() * 9999) });
          this.fxParticle(e.x, e.y, '#f4d03f', 6, 40, 0.35, 140, 5);
          this.fxRing(e.x, e.y, '#f4d03f', 26, 0.35, 3);
        });
      }
    }
  }

  // ===== tickPoison =====


  /* ============ 毒塔（v1.15 重做：基础中毒 20% 概率叠层 / 剧毒 / 毒爆 / 毒池 / 毒棒 / 毒性强化 / 瘟疫 / 毒藤 / 瘴气） ============ */
  hitPoison(e, dmg) {
    // v1.16.21 基础中毒：20% 概率附加 1 层（剧毒 +25%，A 每级再 +15%）——v1.16.53 统一判定
    this.tryAttackDebuff('poison', e, dmg);
    this.damage(e, dmg, 'poison');
  }

  /** 毒·中毒叠层（v1.16.21）：每层每秒 = 单发伤害×10%，基础持续 5 秒，上限 5 层（毒性强化 C +2/级）；
   *  剧毒 B 时长 +2s/级（不变）；剧毒 C 每跳间隔 -0.1/-0.2/-0.3s（1s → 0.9/0.8/0.7s） */
  applyPoison(e, dmg, src, layers) {
    const boost = this.dotBoost();
    const perStackDps = dmg * boost.dmg;
    const ttl = (5 + 2 * this.branchLv('poison', '剧毒', 'B')) + boost.ttlAdd;
    const cap = 5 + 2 * this.branchLv('poison', '毒性强化', 'C');
    const add = Math.max(1, layers || 1);
    const freq = 1 / (1 - SKILL_NUM.poison['剧毒'].freq[this.branchLv('poison', '剧毒', 'C')]);
    let dot = e.dots.find((d) => d.type === 'poison');
    if (!dot) {
      e.dots.push({ type: 'poison', stackDps: perStackDps, stack: Math.min(add, cap), maxStack: cap, ttl, tickT: 0, freq, src });
    } else {
      dot.stack = Math.min(cap, dot.stack + add);
      dot.stackDps = Math.max(dot.stackDps, perStackDps);
      dot.maxStack = cap;
      dot.freq = freq;
      dot.ttl = Math.max(dot.ttl, ttl);
    }
  }

  /** 当前中毒层数（毒爆 B 继承用） */
  poisonStack(e) {
    const d = (e.dots || []).find((x) => x.type === 'poison');
    return d ? d.stack : 1;
  }

  /** 塔口坐标（普攻/技能弹道统一发射点，v1.16.37 统一口径）：
   *  正式战斗：塔位槽布局（槽中心）；测试战场：单塔出战大槽（渲染 testFieldLayer 硬编码 x=15/y=1053，中心 65,1103）
   *  v1.16.39 槽数恒用渲染固定值（正式 4 槽），不随已激活塔数变化——得塔前/后塔位坐标稳定（旧实现 n=slotOrder.length，1 塔时算成单槽居中 → 塔区中心） */
  tickPoison(dt) {
    const g = this.game;
    // 毒·毒池（v1.15；v1.16.21 数值调整）：周期 5s 释放毒池（半径 130；A 伤 +40%/级；B 持续 +2s/级；C 范围 +20%/级），池内每秒毒伤并叠毒
    const pool = this.lv('poison', '毒池');
    if (pool > 0) {
      this.timers.pool = (this.timers.pool || 0) + dt;
      if (this.timers.pool >= 5 * this._weakPeriod('poison')) {
        this.timers.pool = 0;
        this.castEnergy('poison', '毒池');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y));
        if (!alive.length) return;
        const tgt = alive[Math.floor(Math.random() * alive.length)];
        const pr = 130 * (1 + 0.2 * this.branchLv('poison', '毒池', 'C'));
        const dps = this.shotDmg('poison') * 0.20 * (1 + 0.4 * this.branchLv('poison', '毒池', 'A'));
        const ttl = 4 + 2 * this.branchLv('poison', '毒池', 'B');
        this.groundDots = this.groundDots || [];
        this.groundDots.push({ x: tgt.x, y: tgt.y, r: pr, ttl, key: 'poison', dps, stackPerSec: 1, seed: Math.random() * 100, color: '#1e8449' });
        this.fxRing(tgt.x, tgt.y, '#1e8449', pr, 0.8, 5);
        this.fxParticle(tgt.x, tgt.y, '#28b463', 8, 60, 0.6, 60, 5);
      }
    }
    // 毒·毒棒（v1.15）：周期 4s 召唤毒棒（A 数量 +1/级；B 持续 +2s 且 CD -0.5s/级），毒棒继承 30% 攻击独立攻击 200px 内敌人（C 目标 +1/级）
    const stick = this.lv('poison', '毒棒');
    if (stick > 0) {
      this.timers.stick = (this.timers.stick || 0) + dt;
      const cd = Math.max(1.5, 4 - 0.5 * this.branchLv('poison', '毒棒', 'B')) * this._weakPeriod('poison');
      if (this.timers.stick >= cd) {
        this.timers.stick = 0;
        this.castEnergy('poison', '毒棒');
        const n = 1 + this.branchLv('poison', '毒棒', 'A');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y));
        if (!alive.length) return;   // v1.16.18 没有敌人时不召唤毒棒
        for (let i = 0; i < n; i++) {
          const near = alive[Math.floor(Math.random() * alive.length)];
          const px = near.x + (Math.random() - 0.5) * 60;
          const py = near.y + (Math.random() - 0.5) * 60;
          const ttl = 10 + 2 * this.branchLv('poison', '毒棒', 'B');
          this.poisonSticks = this.poisonSticks || [];
          this.poisonSticks.push({ x: px, y: py, ttl, atkT: 0, atkI: 1, r: 200, dmg: this.shotDmg('poison') * 0.24, targets: 1 + this.branchLv('poison', '毒棒', 'C'), seed: Math.random() * 100 });
          this.fxRing(px, py, '#1e8449', 40, 0.5, 4);
          this.fxParticle(px, py - 6, '#28b463', 6, 30, 0.5, 80, 4);
        }
      }
    }
    // 毒·毒藤（v1.15）：周期 6s 从塔口射出藤蔓，缠住最靠城墙的敌人（A 目标 +1/级；B 时长 +1s/级），定身 + 持续叠毒；C 被缠死亡延伸
    const vine = this.lv('poison', '毒藤');
    if (vine > 0) {
      this.timers.vine = (this.timers.vine || 0) + dt;
      if (this.timers.vine >= 6 * this._weakPeriod('poison')) {
        this.timers.vine = 0;
        this.castEnergy('poison', '毒藤');
        const n = 1 + this.branchLv('poison', '毒藤', 'A');
        const dur = 3 + this.branchLv('poison', '毒藤', 'B');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('poison', e.x, e.y)).sort((a, b) => b.y - a.y);
        const picks = alive.slice(0, n);
        const mus = this.towerMuzzle('poison');
        picks.forEach((e) => {
          e.frozen = Math.max(e.frozen || 0, dur);
          e._vineT = Math.max(e._vineT || 0, dur);
          // 毒藤攻击帧动画（v1.16.1）：藤蔓从塔口伸展生长到目标（0.55s），命中后持续缠绕由敌人 _vineT 驱动
          g.fx.push({ type: 'vine', x: mus.x, y: mus.y, tx: e.x, ty: e.y, t: 0, dur: 0.55, seed: Math.random() * 100 });
          this.fxRing(e.x, e.y, '#1e8449', 26, dur, 3);
        });
      }
    }
  }

  // ===== tickCannon =====


  /* ============ 炮塔（v1.16 重做：重炮/震击/贯穿弹/双管齐射/炮火支援/地雷阵/炮台/军火库） ============ */
  hitCannon(e, dmg) {
    // v1.16.14 军火库 C 双倍火力：普攻 10%/20%/30% 概率造成双倍伤害（仅主目标）
    const armC = this.branchLv('cannon', '军火库', 'C');
    if (armC > 0 && Math.random() < 0.10 * armC) {
      dmg *= 2;
      this.fxFlash(e.x, e.y, '#ffb347', 0.25);
    }
    // 普攻溅射（v1.16.12）：基础 100px 范围、40% 溅射伤害（v1.16.22 由 10% 上调）；学「重炮」后范围 +25%/级（A 扩爆 +15%/级、B 炸力 +15%/级）
    const heavy = this.lv('cannon', '重炮');
    const r = 100 * (1 + 0.25 * heavy + 0.15 * this.branchLv('cannon', '重炮', 'A'));
    const splDmg = dmg * 0.40 * (1 + 0.15 * this.branchLv('cannon', '重炮', 'B'));
    // 协同（爆炸类 +50%）在 explode() 内按 SYNERGIES[1] 统一结算（v1.16.20 修正越界索引）
    // 震击（v1.16）：40%+20pp×B 概率击退 60×(1+0.4×A)px；C 迟滞被击退减速 1/1.5/2 秒（随等级）
    const shock = this.lv('cannon', '震击');
    let knock = 0, slowAfter = 0;
    if (shock > 0 && Math.random() < 0.40 + 0.20 * this.branchLv('cannon', '震击', 'B')) {
      knock = 60 * (1 + 0.4 * this.branchLv('cannon', '震击', 'A'));
      slowAfter = 0.5 + 0.5 * this.branchLv('cannon', '震击', 'C');   // C1=1s / C2=1.5s / C3=2s
    }
    this.damage(e, dmg, 'cannon');
    // 爆炸（AOE 溅射 + 震尘减速）——排除主目标（普攻主目标已吃满 100%）
    this.explode(e.x, e.y, r, splDmg, 'cannon', knock, slowAfter, e);
    if (this.branchLv('cannon', '重炮', 'C') > 0) {
      this.enemies().forEach((o) => {
        if (o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= r && Math.random() < 0.20 * this.branchLv('cannon', '重炮', 'C')) this.applySlow(o, 0.30, 1);
      });
    }
    // 贯穿弹（v1.16）：爆炸后弹片向前贯穿 2+裂片 个敌人（70%×碎劲），C 贯透减速 15%
    const pierce = this.lv('cannon', '贯穿弹');
    if (pierce > 0) {
      const n = 2 + this.branchLv('cannon', '贯穿弹', 'A');
      const pDmg = dmg * 0.7 * (1 + 0.20 * this.branchLv('cannon', '贯穿弹', 'B'));
      const cands = this.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < 60 && Math.abs(o.x - e.x) < 85)
        .sort((a, b) => b.y - a.y);
      for (let i = 0; i < Math.min(n, cands.length); i++) {
        this.damage(cands[i], pDmg, 'cannon');
        // v1.16.42 C 贯透档位式：被贯穿敌人减速 15%/30%/45%
        const pierceC = this.branchLv('cannon', '贯穿弹', 'C');
        if (pierceC > 0) this.applySlow(cands[i], SKILL_NUM.cannon['贯穿弹'].slow[pierceC], 1);
        this.fxParticle(cands[i].x, cands[i].y, '#d89e63', 3, 22, 0.3, 90, 4);
      }
    }
  }

  /** 范围爆炸（含击退/减速）；爆炸颜色按塔类型 */
  tickCannon(dt) {
    const g = this.game;
    // 炮·炮火支援（v1.16 周期）：每 12 秒对敌人密集区降下 3 发炮击（60%×威力，半径130；A 增援 +1发/级；C 焦土留燃烧地面 2s 30%/s）
    // v1.16.31：逐发弹道——每发间隔 0.1s 从塔口升空（0.3s 至高点 300px）后**消失**；发射 1.0s 后在目标头顶
    //           高 300px 处**出现**并 0.3s 垂直落下（第 1 发落地 1.3s，之后每发 +0.1s，3~6 发总动画 1.5~1.8s）；
    //           每发落地前 0.5s 地面出现 130px 棕色描边受击圈（持续至落地爆炸）
    const support = this.lv('cannon', '炮火支援');
    if (support > 0) {
      this.timers.support = (this.timers.support || 0) + dt;
      if (this.timers.support >= 12 * this._weakPeriod('cannon')) {
        this.timers.support = 0;
        this.castEnergy('cannon', '炮火支援');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (alive.length) {
          const n = 3 + this.branchLv('cannon', '炮火支援', 'A');
          const dmg = this.shotDmg('cannon') * 0.60 * (1 + 0.4 * this.branchLv('cannon', '炮火支援', 'B'));
          const mus = this.towerMuzzle('cannon');
          for (let i = 0; i < n; i++) {
            const t = alive[Math.floor(Math.random() * alive.length)];
            const px = t.x + (Math.random() - 0.5) * 40;
            const py = t.y + (Math.random() - 0.5) * 40;
            const off = 0.1 * i;                       // 逐发间隔 0.1s
            // 炮弹：升空 0.3s → 高点悬停至 1.0s → 0.3s 垂直落下（总 1.3s + 偏移）
            g.fx.push({ type: 'strikeShell', sx: mus.x, sy: mus.y, tx: px, ty: py, t: 0, dur: 1.3 + off, offset: off, seed: Math.random() * 100 });
            // 炮击圈：落地前 0.5s 出现（显示至落地爆炸，时长 0.8s）
            g.fx.push({ type: 'strike', x: px, y: py, r: 130, t: 0, dur: 0.8 + off, offset: off, seed: Math.random() * 100 });
            this.delayed.push({ x: px, y: py, r: 130, dmg, delay: 1.3 + off, t: 0, key: 'cannon', knock: 0, slowAfter: false, ember: this.branchLv('cannon', '炮火支援', 'C') });
          }
        }
      }
    }
    // 炮·地雷阵（v1.16.22 重做）：每 6 秒抛投 3 颗雷（A 布雷 +2/级），雷从塔口以 500px/s 飞向部署点（飞行不可引爆），
    //   落地布设 0.3s 后可引爆，持续 20 秒；有敌人时部署在最近敌人（最靠墙）附近一圈随机位置，无敌人时攻击范围内随机（B 雷威 +50%/级；C 连爆）
    const mineLv = this.lv('cannon', '地雷阵');
    if (mineLv > 0) {
      this.timers.mine = (this.timers.mine || 0) + dt;
      if (this.timers.mine >= 6 * this._weakPeriod('cannon')) {
        this.timers.mine = 0;
        this.castEnergy('cannon', '地雷阵');
        const n = 3 + 2 * this.branchLv('cannon', '地雷阵', 'A');
        // 塔口坐标（v1.16.37 统一 towerMuzzle）
        const ly = this.ly();
        const mz = this.towerMuzzle('cannon');
        const fx0 = mz.x, fy0 = mz.y;
        const range = this.range('cannon');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        const topY = ly.areaY + ly.entryH + 10;
        const wallY = ly.wallY - 12;
        for (let i = 0; i < n; i++) {
          // 部署点：有敌人 → 最近敌人（y 最大）附近一圈随机；无敌人 → 攻击范围内随机
          let tx, ty;
          if (alive.length) {
            const near = alive.reduce((a, b) => (b.y > a.y ? b : a));
            const ang = Math.random() * Math.PI * 2;
            const rr = 30 + Math.random() * 150;   // v1.16.23：部署圈半径 ×3（10~60 → 30~180px）
            tx = near.x + Math.cos(ang) * rr;
            ty = near.y + Math.sin(ang) * rr;
          } else {
            tx = 40 + Math.random() * 620;
            ty = fy0 - 30 - Math.random() * Math.max(60, range - 90);
          }
          tx = Math.max(25, Math.min(725, tx));
          ty = Math.max(topY, Math.min(wallY, ty));
          const dist = Math.hypot(tx - fx0, ty - fy0);
          this.mines = this.mines || [];
          this.mines.push({
            x: fx0, y: fy0, r: 100,
            dmg: this.shotDmg('cannon') * 1.2 * (1 + 0.5 * this.branchLv('cannon', '地雷阵', 'B')),
            armed: 0, ttl: 20, chain: this.branchLv('cannon', '地雷阵', 'C'),
            fly: { sx: fx0, sy: fy0, tx, ty, t: 0 },
          });
          const flyDur = dist / 200;   // 200px/s
          g.fx.push({ type: 'mine', x: tx, y: ty, t: 0, dur: flyDur + 20, seed: Math.random() * 100, fly: { sx: fx0, sy: fy0, tx, ty, dur: flyDur } });
          this.fxParticle(fx0, fy0 - 8, '#b5651d', 4, 22, 0.3, 90, 4);
        }
      }
    }
    // 炮·炮台（v1.16 周期召唤）：每 10 秒部署一门自动炮台（A 增台 +1/级；B 久驻 +2s 且 CD -1s/级），独立炮击最靠墙敌人（70% 伤害·1s/发；C 重炮台爆炸范围 +30%/级）
    const turret = this.lv('cannon', '炮台');
    if (turret > 0) {
      this.timers.turret = (this.timers.turret || 0) + dt;
      const cd = Math.max(4, 10 - this.branchLv('cannon', '炮台', 'B')) * this._weakPeriod('cannon');
      if (this.timers.turret >= cd) {
        this.timers.turret = 0;
        this.castEnergy('cannon', '炮台');
        const n = 1 + this.branchLv('cannon', '炮台', 'A');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('cannon', e.x, e.y));
        if (!alive.length) return;   // v1.16.18 没有敌人时不部署炮台
        for (let i = 0; i < n; i++) {
          const near = alive[Math.floor(Math.random() * alive.length)];
          const px = near.x + (Math.random() - 0.5) * 90;
          const py = near.y + (Math.random() - 0.5) * 90;
          const ttl = 8 + 2 * this.branchLv('cannon', '炮台', 'B');
          this.turrets = this.turrets || [];
          this.turrets.push({ x: px, y: py, ttl, atkT: 0, atkI: 0.9, dmg: this.shotDmg('cannon') * 0.68, r: 100 * (1 + 0.3 * this.branchLv('cannon', '炮台', 'C')) });
          g.fx.push({ type: 'turret', x: px, y: py, t: 0, dur: ttl, seed: Math.random() * 100 });
          this.fxRing(px, py, '#b5651d', 40, 0.5, 3.5);
        }
      }
    }
  }

  // ===== tickBoomerang =====


  /* ============ 回旋镖塔 ============ */
  /* ============ 回旋镖塔（v1.16 重做：折返增伤/穿透/多镖/接镖/猎手标记/风暴镖/镖阵/风痕） ============ */
  hitBoomerang(e, dmg) {
    // 猎手标记（v1.16.42 重做）：命中同目标叠加标记，标记持续 5 秒（到期自动清零）；
    //   A 深镖：受标记敌人受伤 +8%/16%/24%（damage 内全来源结算）；B 多标：层数上限 +2/+4/+6；C 猎杀：死亡扩散 1/2/3 个
    const markLv = this.lv('boomerang', '猎手标记');
    let v = dmg;
    if (markLv > 0) {
      const cap = 3 + 2 * this.branchLv('boomerang', '猎手标记', 'B');
      e._mark = Math.min(cap, (e._mark || 0) + 1);
      e._markT = 5;   // v1.16.42 标记持续 5 秒（每次命中刷新）
      // 标记视觉：目标头顶紫色标记计数
      this.fxParticle(e.x, e.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
    }
    this.damage(e, v, 'boomerang');
    // 普攻流血（v1.16.21→v1.16.53 统一判定）：20% 概率；「放血」+25%（20→45%）、A 刺骨 +15%/级（45→90%）
    this.tryAttackDebuff('boomerang', e, v);
    // 折返增伤（v1.16）：折返段 = 命中伤害 ×0.65×(1+0.25×A)；B 缓返命中减速 20%；C 宽返吸附已在 sweepDamage
    const fold = this.lv('boomerang', '折返增伤');
    if (fold > 0) {
      const foldDmg = v * 0.65 * (1 + 0.25 * this.branchLv('boomerang', '折返增伤', 'A'));
      this.damage(e, foldDmg, 'boomerang');
      if (this.branchLv('boomerang', '折返增伤', 'B') > 0) this.applySlow(e, 0.20, 1);
      // 折返视觉：紫色小回环
      this.fxRing(e.x, e.y, '#c39bd3', 34, 0.3, 2.5);
    }
    // （v1.16.14 回旋镖「穿透」已替换为「放血」dot 强化，穿透实现移除）
  }

  /* 普攻流血（v1.16.21 回旋镖塔重做）：每移动 10px 结算 4% 攻击伤害（每 100px 跳 40%）；「放血」：基础 +25% 概率（20→45%）/ A 刺骨 +15%/级（45→90%）/ B 时长 +1s/级 / C 溃烂 每 10px 伤害 4%→6/8/10% */
  applyBleed(e, dmg) {
    e.bleedT = 4 + 1 * this.branchLv('boomerang', '放血', 'B');          // 流血持续 4s（B +1s/级）
    const cLv = this.branchLv('boomerang', '放血', 'C');
    e._bleedDmg = dmg * (0.40 + 0.20 * cLv);                            // 每移动 100px 结算（= 每 10px 4% 攻击；C 溃烂 4%→6/8/10%）
    e._bleedDist = 0;
    e._bleedLastY = e.y;
    // 流血视觉：暗红血珠粒子
    this.fxParticle(e.x, e.y - 8, '#c0392b', 3, 18, 0.4, 70, 4);
  }

  tickBoomerang(dt) {
    const g = this.game;
    // 回旋镖·风暴镖（v1.16.21 重做）：每 12 秒在敌人密集区选一存活敌人，生成 120px 三同心圈（40/80/120）旋转小飞镖（内4/中6/外8枚，每镖 10% 伤害，命中即消失；A 转速 +25%/级；B 伤害 +20%/级；C 镖数每圈 +1/级）
    const cyclone = this.lv('boomerang', '风暴镖');
    if (cyclone > 0) {
      this.timers.storm = (this.timers.storm || 0) + dt;
      if (this.timers.storm >= 12 * this._weakPeriod('boomerang')) {
        this.timers.storm = 0;
        this.castEnergy('boomerang', '风暴镖');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          // 三圈角速度不同：内圈 2.6 顺时针 / 中圈 2.0 逆时针 / 外圈 2.4 顺时针（A 疾旋统一 +25%/级）
          const rings = [{ r: 40, base: 2.6 }, { r: 80, base: -2.0 }, { r: 120, base: 2.4 }];
          const baseN = [4, 6, 8];
          const nAdd = this.branchLv('boomerang', '风暴镖', 'C');
          const perDmg = this.shotDmg('boomerang') * 0.10 * (1 + 0.2 * this.branchLv('boomerang', '风暴镖', 'B'));
          const spdMul = 1 + 0.25 * this.branchLv('boomerang', '风暴镖', 'A');
          const darts = [];
          rings.forEach((rc, ri) => {
            const n = baseN[ri] + nAdd;
            const spd = rc.base * spdMul;   // 带方向符号（正=顺时针）
            for (let i = 0; i < n; i++) darts.push({ r: rc.r, spd, a: (Math.PI * 2 * i) / n, hitIds: {} });
          });
          this.storms = this.storms || [];
          const sto = { x: t.x, y: t.y, r: 120, ttl: 3, darts, perDmg };
          const fxo = { type: 'cyclone', x: t.x, y: t.y, r: 120, t: 0, dur: 3, darts };
          sto.fx = fxo;                    // v1.16.38 风暴镖 fx 引用（同步清除）
          this.storms.push(sto);
          g.fx.push(fxo);
        }
      }
    }
    // 回旋镖·弹力镖（v1.16.21 原镖阵重做，新单体）：每 8 秒射 2 枚十字飞镖，碰敌人或战斗区边缘反弹（60% 伤害，反弹 10 次结束）；A 增镖 +1/级；B 利刃 +25%/级；C 弹力增强 +5 次/级
    const ringN = this.lv('boomerang', '弹力镖');
    if (ringN > 0) {
      this.timers.ringN = (this.timers.ringN || 0) + dt;
      if (this.timers.ringN >= 8 * this._weakPeriod('boomerang')) {
        this.timers.ringN = 0;
        this.castEnergy('boomerang', '弹力镖');
        const alive = this.enemies().filter((e) => e.hp > 0 && this.inTowerRange('boomerang', e.x, e.y));
        const mus = this.towerMuzzle('boomerang');
        const n = 2 + 1 * this.branchLv('boomerang', '弹力镖', 'A');
        const perDmg = this.shotDmg('boomerang') * 0.60 * (1 + 0.25 * this.branchLv('boomerang', '弹力镖', 'B'));
        const maxB = 10 + 5 * this.branchLv('boomerang', '弹力镖', 'C');
        // 初始方向：射程内随机存活敌人方向 ± 散射（无敌人则全随机）
        let baseAng = Math.random() * Math.PI * 2;
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          baseAng = Math.atan2(t.y - mus.y, t.x - mus.x);
        }
        for (let i = 0; i < n; i++) {
          const ang = baseAng + (i - (n - 1) / 2) * 0.5;
          const d = { key: 'boomerang', dmg: perDmg, t: 0, dur: 8, x: mus.x, y: mus.y, ang, speed: 400, bounce: true, bounces: 0, maxB, hitR: 30, hitIds: {} };
          this.shots.push(d);
          const fxo = { type: 'shot', kind: 'bounce', ref: d, t: 0, dur: 8, color: '#c39bd3' };
          d.fx = fxo;                    // v1.16.38 弹力镖 fx 引用（提前结束同步清除）
          g.fx.push(fxo);
        }
      }
    }
  }

  /* ---------- 视觉 ---------- */


  /* ============ 公共：状态 / 几何 / 通用 ============ */
  applySlow(e, mult, ttl) {
    if (!e.slow || e.slow.ttl <= 0) e.slow = { mult: 1, ttl };
    else e.slow.ttl = Math.max(e.slow.ttl, ttl);
    e.slow.mult = 1 - mult;
  }

  towerMuzzle(key) {
    const g = this.game;
    const ly = this.ly();
    if (g.state === 'testfield') return { x: 15 + 50, y: 1053 + 50 };   // 渲染 testFieldLayer 硬编码单塔大槽（100×100，中心 65,1103）
    const n = ly.slotCount || 4;
    const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
    const startX = (750 - rowW) / 2;
    const slotW = ly.slotSize + ly.slotGap;
    const idx = g.run.slotOrder.indexOf(key);
    return { x: startX + Math.max(0, idx) * slotW + ly.slotSize / 2, y: ly.slotY + ly.slotSize / 2 };
  }

  /** 某点是否在当前塔攻击范围内（与普攻 pickTarget 同口径：行距离 ≤ 射程；v1.16.21 技能释放限定用） */
  inTowerRange(key, x, y) {
    return Math.abs(this.towerMuzzle(key).y - y) <= this.range(key);
  }

  hasDot(e, type) { return !!e.dots.find((d) => d.type === type); }

  explode(x, y, r, dmg, key, knock, slowAfter, exclude) {
    const g = this.game;
    // 协同（v1.16.20 修正）：重炮×大火球（SYNERGIES[1]）达成 → 爆炸类伤害 +50%（原引用 [0]/[2] 错位已修正）
    let mult = 1;
    if (g.run.effects.synergyDone && g.run.effects.synergyDone[1]) mult *= 1.5;
    const entryY = this.ly().areaY + this.ly().entryH;
    this.enemies().forEach((o) => {
      if (o.hp <= 0) return;
      if (exclude && o === exclude) return;   // 溅射不重复结算施爆点主目标（v1.16.12）
      const d = Math.hypot(o.x - x, o.y - y);
      if (d > r) return;
      this.damage(o, dmg * mult, key);
      if (knock > 0) o.y = Math.max(entryY + 10, o.y - knock * (1 - d / r));
      if (slowAfter > 0) this.applySlow(o, 0.3, slowAfter);   // slowAfter = 减速秒数（震击 C：1/1.5/2）
    });
    // 爆炸视觉：按塔类型着色的爆炸 + 冲击环
    const COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
    const col = COLOR[key] || '#ff9f43';
    g.fx.push({ type: 'boom', x, y, t: 0, dur: 0.5, color: col });
    this.fxRing(x, y, col, r, 0.4, 3.5);
    this.fxParticle(x, y, col, 6, r, 0.45, 130, 5);
  }

  /* ---------- 周期技（按塔分节：火/冰/电/毒/炮/回旋镖） ---------- */
  /** 周期技总入口（兼容旧调用/测试；update 已按塔直接调度） */
  tickPeriodic(dt) {
    this.tickFire(dt);
    this.tickIce(dt);
    this.tickElectric(dt);
    this.tickPoison(dt);
    this.tickCannon(dt);
    this.tickBoomerang(dt);
  }

  // ===== tickFire =====
  /* ---------- 视觉 ---------- */

  fxFlash(x, y, color) {
    this.game.fx.push({ type: 'flash', x, y, t: 0, dur: 0.3, color });
  }
  /** 粒子爆发（命中/DoT/技能落点） */
  fxParticle(x, y, color, n, spread, dur, speed, size) {
    this.game.fx.push({ type: 'particle', x, y, color, n, spread, dur, speed, size, t: 0 });
  }
  /** 扩散环（冰冻/爆炸/周期技冲击） */
  fxRing(x, y, color, rMax, dur, width) {
    this.game.fx.push({ type: 'ring', x, y, color, rMax, dur, width, t: 0 });
  }
  /** 两点连线（电连锁/电弧/毒链） */
  fxBeam(x1, y1, x2, y2, color, dur, width) {
    this.game.fx.push({ type: 'beam', x1, y1, x2, y2, color, dur, width, t: 0 });
  }

  /* ---------- v1.12 全局技能：消耗累计充能释放（1 次 = chargePerUse 点） ---------- */
  /** 释放全局技能：'shuffle' 打乱棋盘所有方块 / 'refill' 所有塔补充能量；累计充能不足返回 false */
  castGlobal(which) {
    const g = this.game;
    if (!g.run.spendAmmo(which)) return false;
    const GS = CONFIG.GLOBAL_SKILL;
    if (which === 'shuffle') {
      // 全局洗牌：打乱当前三消棋盘所有方块（重新生成，无初始三消）
      const b = g.run.board;
      if (b) b.grid = b.genBoard();
      g.anim = null;                       // 清掉进行中交换/消除动画，避免与新棋盘渲染冲突
      g.selected = null; g.pickCell = null;
      this.fxFlash(375, 800, '#ff8c42', 0.5);
      this.fxRing(375, 800, '#ff8c42', 300, 0.5, 8);
      g.toast && g.toast('🔀 全局洗牌', '#ff8c42');
      // v1.16.89 洗牌重做：额外触发一遍已有技能——周期技计时器置满立即触发一次 + 全体塔按已激活技能数追加普攻
      const n = this.castGlobalBurst();
      if (n > 0) g.toast && g.toast(`⚡ 技能齐发 · 全塔普攻 ×${n}`, '#ff8c42');
      // v1.16.96 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3（shotDmg 统一乘区）
      if (g.run.relic3('cm_shuffle')) g.run._shuffleBuffTtl = 2;
    } else {
      // 能量补给：所有已解锁塔各 +refillEnergy（封顶能量上限）
      let refilled = 0;
      Object.keys(g.run.slotOrder).forEach((_, i) => {
        const tk = g.run.slotOrder[i];
        const tw = g.run.effects.tower(tk);
        if (!tw || tw.level <= 0) return;
        const before = tw.energy;
        tw.energy = Math.min(before + GS.refillEnergy, g.run.armoryEnergyMax());
        refilled += tw.energy - before;
      });
      this.fxFlash(375, 800, '#7ef0a3', 0.5);
      this.fxRing(375, 800, '#7ef0a3', 300, 0.5, 8);
      g.toast && g.toast(`🔋 能量补给 +${GS.refillEnergy}`, '#7ef0a3');
      if (refilled > 0) g.toast && g.toast(`全场补给 ${Math.round(refilled)} 点`, '#7ef0a3');
    }
    return true;
  }

  /** v1.16.89 洗牌全局技能附带「技能齐发」：周期技计时器置满（下帧各触发一次并复位）+ 每塔按已激活技能总数追加等量普攻 */
  castGlobalBurst() {
    const g = this.game;
    // 统计已激活技能数（周期技 + 非周期技，含默认激活与三选一获取，level>0 即算）
    let n = 0;
    g.run.slotOrder.slice().forEach((key) => {
      const t = this.tower(key);
      if (!t || t.level === 0) return;
      n += (t.pool || []).filter((e) => e.level > 0).length;
    });
    // 周期技立即触发一遍：全部周期计时器置满 → 以极小 dt 推进各周期技 tick（越过阈值即触发并复位计时）
    Object.keys(this.timers).forEach((k) => { this.timers[k] = 9999; });
    this.tickFire(0.001); this.tickIce(0.001); this.tickElectric(0.001);
    this.tickPoison(0.001); this.tickCannon(0.001); this.tickBoomerang(0.001);
    // 每塔额外普攻 N 次（N = 已激活技能总数；无目标时 attackOnce 内部静默跳过）
    if (n > 0) g.run.slotOrder.slice().forEach((key) => {
      for (let i = 0; i < n; i++) this.attackOnce(key);
    });
    return n;
  }
}

module.exports = { CombatSystem, initEnemyState };
