const RetiredRelics = new Set(require('./config/retired-relics.js'));
const TalentRuntime = require('./talents/runtime.js');
const BattleShop = require('./economy/battle-shop.js');
const ChainAttacks = require('./skills/chain-attacks.js');
const WaveRelics = require('./relics/wave-hooks.js');
const MatchRelics = require('./relics/match-hooks.js');
const GS_BALANCE = require('./config/global-balance.js');
const TOWER_SKILLS = require('./config/tower-skills.js');
/**
 * run.js —— 对局（run）层：三消 → 经验 → 塔升级 → 波末三选一 → 战斗结算
 * =====================================================================
 * 口径与 tools/sim_effects.py 的 simulate_run / simulate_session 对齐：
 *   - 消除经验：塔经验按消除方块计算 = 每块基础经验 × 块数 × 形状倍率（3连1.0/直4 1.5/L5 1.5/直5 2.0/6+ 2.5）
 *   - 先消先得：未获得塔且塔位未满 → 得塔；塔位满 → 随机已有塔打折经验
 *   - 惩罚色（橙=炮塔 P1 无塔）：随机已有塔 gainExp(exp×PENALTY_RATIO)
 *   - 波末：三选一队列（effects.settlePending）→ 金币 60×1.08^(w-1) → 战斗结算
 *   - 战斗：enemyHp=1000×1.12^(w-1)，缺口扣防线；破防或 wave≥50 结束 run
 *   - run 间：特效构筑重置，塔全局等级/金币保留（session 级）
 *
 * 两种消除输入：
 *   - applyMatch(color, shape, size)：模拟/脚本路径（按操作模型直接结算）
 *   - trySwap(r1,c1,r2,c2)：真实路径（棋盘交换 → 按匹配组逐组结算，含连锁）
 */
const CONFIG = require('./config.js');
const GlobalSkills = require('./global-skills.js');
const Board = require('./board.js');
const { EffectManager } = require('./effects.js');

/* 消除经验：塔经验按消除方块计算 = 每块基础经验 × 块数 × 形状倍率（直4/L5/直5 更高） */
function expOfShape(shape, size) {
  const mult = size>=5 || ['5','L5','6+'].includes(shape) ? 1.5 : size===4 || shape==='4' ? 1.2 : 1;
  return CONFIG.EXP.perCell * size * mult;
}

/** 可复现随机（mulberry32） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Run {
  /**
   * @param opts {difficulty, seed?, rng?} rng: () => [0,1)；缺省 Math.random
   * @param session 可选：跨 run 状态（塔全局等级、累计金币）——由 simulateSession 维护
   */
  constructor(opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;
    this.globalSlots = GlobalSkills.slots(opts.globalSkills);
    this.gsState = {};
    this.difficulty = opts.difficulty || CONFIG.DIFFICULTY.default;
    this.matchSkills = Object.assign({}, CONFIG.MATCH_SKILL.default, opts.matchSkills || {});  // 三消技能配置槽
    this.board = new Board({ difficulty: this.difficulty, theme: opts.field || 'ancient', obstacles: ((CONFIG.FIELDS[opts.field] || {}).boardObstacles || []).map(p => p.slice()) });
    // 特殊方块挂钩：四连技 id / 高连技面板操作（board.resolve 播种段调用）
    this.board.hooks = {
      onMatch4: () => this.matchSkills.match4,
      onMatch5: () => this.matchSkills.match5,
      extraMatch4: () => { if (this.gsState.twins) { this.gsState.twins=false; return true; } return false; },
    };
    this.board.init();
    this.effects = new EffectManager({ rng: this.rng });
    this.effects.run = this;      // ：整体经验池（塔 DPS 不再随整体等级成长）
    this.exp = 0;                 // ：整体经验池（塔不再单独获取经验）
    this.expLevel = 0;            // 整体等级（经验条/等级圆显示；升级发放三选一——不再影响塔 DPS）
    this._upCount = {};           // 各塔累计升级次数（均衡轮转，跨波记忆）
    this.wave = 0;
    this.clearedWaves = 0;        // 全歼波数：一波的怪全部死亡（且投放完毕）才算完全击败；叠加波下按 waveNo 逐波归零统计
    this._evacSeen = 0;           // 已判定的撤离检查点数（每跨过 EVAC.interval 个全歼波判定一次撤离）
    this.lineHp = CONFIG.LINE.hp;
    this.gold = 0;
    this.broken = false;
    this.pendingPeak = 0;
    this.picks = 0;
    this.firstSynergyWave = null;
    this.shuffleAmmo = 0; this.refillAmmo = 0;  // 全局技能累计充能（每 chargePerUse 点 → 可释放 1 次）
    this.freeShuffle = 0;   // 战术转移：每波免费洗牌次数（优先于充能消耗）
    this._globalMap = null;            // 剩余 2 色的全局技能归属（4 塔确定后初始化）
    this.eliteBursts = [];
    this.storeTimers = {}; this.storeCooldowns = {}; this.pickRerolls = 0;
    this.store = {};                 // 本局购买次数；强化强度只读取storeTimers，不读取次数
    this.fieldCfg = null;              // 战场被动配置（由主流程注入：风场/诅咒触发器）
    this.windStacks = 0;               // 霜风峡谷：风场增速层数（每 windEvery 波 +1，移速 ×1.10^n）
    this.curseStacks = 0;              // 深渊裂隙：诅咒层数（每 curseEvery 波 +1，怪物血量 ×1.15^n）
    this._colors = Object.keys(CONFIG.COLOR_WEIGHT);
    this._weights = this._weightsFor();
    this._directSeq = ['red', 'green'];
    this._directDone = 0;
    this.slotOrder = [];      // 先消先得：塔获得顺序（前 TOWER_SLOTS 个占槽）
    this.runRelic = {};       // 局内圣遗物（rougelike）本局生效计数 { id: count }
    this.metaRef = null;      // 星级查询引用（main 注入 meta；模拟层缺省按 1★）
    /* 3★ 质变行为局内状态 */
    this.energyBank = 0;           // 弹药箱3★：三消能量溢出备用库（上限20，普攻能量不足时自动借用）
    this.cmPower3 = 0;             // 力量符3★：4连消全塔伤害叠层（本局累计 %，上限15）
    this.chargeSkillBoost = 0;     // 全局充能3★：充能溢出转技能伤害加成（%，上限50）
    this._bountyStreak = 0;        // 赏金猎人3★：连续无宝箱波计数
    this._waveChestDropped = false;// 本波是否已掉过战场宝箱
    this._tomeBuffTtl = 0;         // 智慧典籍3★：升级后全塔攻速+20%窗口（秒）
    this._shuffleBuffTtl = 0;      // 战术转移3★：洗牌后消除伤害×1.3窗口（秒）
    this.wallShield = 0;           // 生命回复3★：回复溢出转护盾（上限10%最大血量）
    this._waveStartHp = 0;         // 金库3★：波初城墙血量（无伤判定基准）
    this._triple3 = false;         // 三消之力3★：本次交换连锁≥2（经验再+50%）
    /* 火塔 3★ 局内状态 */
    this._fuelBoost = 0;           // 薪柴3★：灼烧概率溢出转灼烧伤害（%，上限20）
    this._forgeCount = 0;          // 熔炉之息3★：普攻计数（每5次免费火柱）
    this._forgeEnergyCd = 0;       // 熔炉之息3★：免费火柱返能冷却
    this._fireClock = 0;           // 火塔周期圣遗物计时基准
    this._fireCycleLast = null;    // 焚天3★：上一个周期技能施放时间
    this._fireCycleLastKey = null; // 焚天3★：上一个周期技能类型
    this._burnallChainCd = 0;      // 焚天3★：技能循环触发冷却
    this._burnallCooldownBoost = {}; // 焚天3★：对应技能下次冷却缩短
    /* UR 局内状态 */
    this._elecHaste = null;        // 疾电3★：电塔麻痹叠层攻速窗口 {n, ttl}
    this._fireTripleNext = false;  // 火弹3★：同一目标累计命中3次后，下一次攻击三连发
    this._emberShots = null;       // 余烬风暴3★：余烬弹队列（1秒后自动射向最近敌）
    /* 冰塔 3★ 局内状态 */
    this._wallDmgAcc = 0;          // 冰墙裂变3★：冰盾生效期间城墙受击伤害累计（每100点→冰塔1能量）
    /* 伤害统计弹窗（）：本局每塔实际扣血累计（普攻/DOT/周期技能三桶） */
    this.dmgStat = {};             // { [towerKey]: { total, normal, dot, skill: { [技能名]: n } } }
  }

  /** 伤害统计容器：懒初始化单塔条目（口径=实际扣血 healthLoss+shieldLoss） */
  dmgStatOf(key) {
    if (!this.dmgStat[key]) this.dmgStat[key] = { total: 0, normal: 0, dot: 0, skill: {} };
    return this.dmgStat[key];
  }

  /** 局内圣遗物拥有数（未获得返回 0） */
  relicRun(id) {
    if (RetiredRelics.has(id)) return 0;
    return this.runRelic[id] || 0;
  }

  /** 圣遗物当前星级数值（1★=desc 最后数字，2★=star2 最后数字）；未获得返回 0；模拟层无 metaRef 按 1★ */
  relicNum(id) {
    if (this.relicRun(id) <= 0) return 0;
    const star = this._testStar3 && this._testStar3[id] ? 3
      : Math.max(this._talentCenterId===id?1:0,(this.metaRef && this.metaRef.starOf) ? this.metaRef.starOf(id) : 1);
    return CONFIG.relicNum(id, star) * (CONFIG.relicRarity(id)==='r'?this.relicRun(id):1);
  }

  /** 新卡表显式数值字段读取；旧卡继续通过 relicNum 的兼容读取。 */
  relicValue(id, effect) {
    if (this.relicRun(id) <= 0 || typeof CONFIG.relicValue !== 'function') return 0;
    const star = this._testStar3 && this._testStar3[id] ? 3
      : Math.max(this._talentCenterId===id?1:0,(this.metaRef && this.metaRef.starOf) ? this.metaRef.starOf(id) : 1);
    return CONFIG.relicValue(id, effect, star) * (CONFIG.relicRarity(id)==='r'?this.relicRun(id):1);
  }

  /** 3★ 质变行为生效判定：STAR3_ENABLED 开启 + 拥有 + 星级≥3；模拟层无 metaRef 按 false（不生效）
   *  测试战场 3★ 模式：_testStar3Mode=true 且 _testStar3[id] 被注入时，该圣遗物按 3★ 质变生效（无需真实 3★ 解锁） */
  relic3(id) {
    if (!CONFIG.STAR3_ENABLED && !this._testStar3Mode) return false;
    if (this.relicRun(id) <= 0) return false;
    if (this._testStar3 && this._testStar3[id]) return true;
    if (!this.metaRef || !this.metaRef.starOf) return false;
    return this.metaRef.starOf(id) >= 3;
  }

  /** 圣遗物生效触发飘字：★星级 + 圣遗物名 + 触发文案（圣遗物色）
   *  由 main 注入 fxTarget（= game.fx）承接渲染；同款圣遗物 RELIC_FX.cooldown 秒内只显示一次。
   *  x/y 缺省显示在屏幕上部中央（375,240），避免遮挡塔区 */
  relicFx(id, text, x, y) {
    if (this.relicRun(id) <= 0) return false;
    const now = Date.now();
    this._relicFxTtl = this._relicFxTtl || {};
    const cd = CONFIG.RELIC_FX.cooldown || 0.8;
    if ((this._relicFxTtl[id] || 0) > now) return false;
    this._relicFxTtl[id] = now + cd * 1000;
    if (!this.fxTarget) return false;
    const def = CONFIG.relicDef(id);
    const star = (this._testStar3 && this._testStar3[id]) ? 3
      : Math.max(this._talentCenterId===id?1:0,(this.metaRef && this.metaRef.starOf) ? this.metaRef.starOf(id) : 1);
    this.fxTarget.push({
      type: 'floatText',
      text: `★${star} ${def ? def.name : id}${text ? ' ' + text : ''}`,
      x: x == null ? 375 : x, y: y == null ? 240 : y,
      t: 0, dur: 1.0, size: 20, color: CONFIG.relicColor(id),
    });
    return true;
  }

  /** 城墙受击统一入口：减伤护符3★ 大额伤害截断（超10%最大血量部分减免50%）→ 生命回复3★ 护盾优先抵扣 */
  applyWallDamage(d) {
    if (this.adReviveProtection > 0) return 0;
    if (!(d > 0)) return 0;
    // 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效），窗口内城墙完全免伤
    if ((this._wallInvT || 0) > 0) return 0;
    let dmg = d;
    if (this.gsState && this.gsState.shieldWave === this.wave && this.gsState.shield > 0) { const absorbed=Math.min(dmg,this.gsState.shield); this.gsState.shield-=absorbed; dmg-=absorbed; }
    // 冰墙裂变3★：城墙受击伤害累计（冰盾生效期间由 combat 转冰塔能量）
    this._wallDmgAcc = (this._wallDmgAcc || 0) + dmg;
    const maxHp = this.lineMaxHp || CONFIG.LINE.hp;
    if (this.relic3('cm_guard') && dmg > maxHp * 0.1) {
      dmg = maxHp * 0.1 + (dmg - maxHp * 0.1) * 0.5;
      this.relicFx('cm_guard', '大额伤害截断 50%'); // 生效提示
    }
    if (this.wallShield > 0) {
      const s = Math.min(this.wallShield, dmg);
      this.wallShield -= s;
      dmg -= s;
    }
    return dmg;
  }

  /** 城墙加固3★：城墙每损失10%最大血量，全塔攻击+1%（背水，最高+10%） */
  wallAtkBonus() {
    if (!this.relic3('cm_wall')) return 0;
    const maxHp = this.lineMaxHp || CONFIG.LINE.hp;
    if (maxHp <= 0) return 0;
    const pct = Math.floor((1 - this.lineHp / maxHp) * 10);
    return Math.max(0, Math.min(10, pct));
  }

  /** 弹药箱3★：普攻能量不足时从备用能量库借用（一次借足 1 发所需能量）。
   *  基础耗能按塔 attackCost 定价；普攻强化会按预期伤害倍率增加每发耗能。 */
  attackCost(t, multiplier = 1) {
    const c = t && t.key && CONFIG.TOWERS[t.key];
    return ((c && c.attackCost) || CONFIG.GLOBAL_SKILL.perAttack) * Math.max(1, Number(multiplier) || 1);
  }
  spendAttackEnergy(t, need = this.attackCost(t)) {
    if (t.energy < need && this.energyBank > 0) {
      const take = Math.min(this.energyBank, need - t.energy);
      this.energyBank -= take;
      t.energy += take;
    }
    if (t.energy >= need) t.energy -= need;
    else t.energy = 0;
  }

  /** 赏金猎人3★：连续3波不掉宝箱时，第4波必掉（调用方在掉落判定处消费） */

  _weightsFor() {
    const keys = CONFIG.DIFFICULTY.activeColors[this.difficulty] || this._colors;
    const w = CONFIG.COLOR_WEIGHT;
    const total = keys.reduce((s, k) => s + (w[k] || 0), 0);
    return { keys, weights: keys.map((k) => (w[k] || 0) / total) };
  }

  /** 加权抽色（模拟路径） */
  _pickColor() {
    const { keys, weights } = this._weights;
    let r = this.rng() * weights.reduce((s, x) => s + x, 0);
    for (let i = 0; i < keys.length; i++) {
      r -= weights[i];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  /* ---------- 波内：消除结算 ---------- */

  /** 整体经验：三段需求曲线；智慧典籍减免沿用。 */
  expNeed() {
    let need = CONFIG.EXP.need(this.expLevel);
    const n = this.relicNum('cm_tome');
    if (n > 0) need *= (1 - n / 100);
    return need;
  }

  /** 三消之力：每次三消获得的经验 +N%（按星级数值）；3★：连锁×2 以上时经验再 +50% */
  _relicExp(v, shape, size) {
    return MatchRelics.experience(this, v, shape, size);
  }

  /**
   * ：整体经验入池（消除/击杀/波末统一走这里，塔不再单独获取经验）。
   * 经验满 → 整体等级 +1 → 待选最少的已拥有塔 +1（均衡成长，升级三选一强化单塔）。
   * @returns 本次升级次数（>0 时调用方应触发升级三选一）
   */
  gainExp(v) {
    if (!(v > 0)) return 0;
    this.exp += v;
    let ups = 0;
    // 全局等级代表已发出的升级选择数：4 座塔各有 12 次选择额度，共 48 级。
    // 若当前没有可接收升级的塔（已满级或待选已攒满），经验留在池中，不空耗等级。
    const globalMaxLevel = CONFIG.TOWER_SLOTS * (CONFIG.EXP.towerMaxLevel - 1);
    while (this.expLevel < globalMaxLevel && this.exp >= this.expNeed()) {
      const t = this._nextPendingTower();
      if (!t) break;
      const need = this.expNeed();
      this.exp -= need;
      this.expLevel += 1;
      ups += 1;
      // 经验之心3★：升级时 20% 概率返还本级经验的 50%（滚雪球加速）
      // 智慧典籍3★：升级时触发全塔 3 秒攻速 +20%（窗口由 combat 递减）
      if (this.relic3('cm_tome')) {
        this._tomeBuffTtl = 3;
        this.relicFx('cm_tome', '升级攻速 +20%'); // 生效提示
      }
      t.pending = Math.min(t.pending + 1, CONFIG.EFFECT.pendingCap);
    }
    return ups;
  }

  /**
   * 结算一次消除（形状：'3' 三连 / '4' 直4 / 'L5' L形5 / '5' 直5 / '6+'）。
   * 三消奖励（能量口径）：
   *   - 塔色（已获得塔）：能量按形状供给（3消+6/4消+12/5消+20/6+(x块)20+6(x-5)）+ 整体经验；能量满 → 溢出均分充能两个全局技能
   *   - 未获得且塔位未满：得塔（初始能量 startEnergy；6 色均可成塔）
   *   - 塔位满后剩余 2 色（未选中）：动态分配两个全局技能充能色 → 按能量口径充能（energyShape 公式）+ 半量经验
   * 全局技能充能（）：累计补充充能（剩余色消除 + 塔色溢出），每 30 点 → 可释放 1 次，上限 3 次（90 点）。
   * @returns {tower, gotTower, penalized, exp, shape, ammoGain, shuffleGain, refillGain}
   */
  applyMatch(color, shape, size, energyCells = size) {
    TalentRuntime.gain(this,color,energyCells);
    const energyBonus = this.relicNum('cm_ammobox');
    const exp = energyCells===0 ? 0 : expOfShape(shape, size);
    const GS = CONFIG.GLOBAL_SKILL;
    // 连锁反应：三消触发4连概率 +N%（本次按直4 结算；模拟层按 1★ 数值）
    ({ shape, size } = MatchRelics.beforeMatch(this, shape, size));
    const t = this.effects.tower(CONFIG.COLORS[color] ? CONFIG.COLORS[color].tower : null);
    let gotTower = false, penalized = false, target = null;
    let ammoGain = 0, shuffleGain = 0, refillGain = 0;
    if (!t) {
      // 兜底（6 色均有塔池，理论上不触发）
      this.gainExp(this._relicExp(Math.floor(exp * CONFIG.PENALTY_RATIO), shape, size));
    } else if (t.level === 0) {
      const owned = Object.keys(this.effects.towers).filter((k) => this.effects.tower(k).level > 0).length;
      if (owned < CONFIG.TOWER_SLOTS) {
        t.unlock(); require('./tower-activation.js').prepare(t); gotTower = true; target = t;
        if (!this.slotOrder.includes(t.key)) this.slotOrder.push(t.key);
        // 激活塔能量 = 初始 40 + 本次激活消除形状供能（受能量上限约束）
        // 弹药箱：每次三消充能能量 +N（按 desc 星级数值）
        const colorEnergy = this.relicNum(`r_${t.key}_energy`);
        const gain = CONFIG.GLOBAL_SKILL.startEnergy + this._energyGain(shape, energyCells)*(1+TalentRuntime.bonus(this,t.key).charge) + energyBonus + colorEnergy;
        t.energy = Math.min(gain, this.armoryEnergyMax(t.key));
        ammoGain = t.energy;
        if (energyBonus > 0) this.relicFx('cm_ammobox', `能量 +${gain}`); // 生效提示
      } else {
        // 塔位满：该色未被选中 → 对应全局技能按能量口径充能（剩余 2 色动态分配）+ 半量经验
        // 全局充能 +N%、弹药箱 +N（按星级数值）
        const skill = this._globalSkillOf(color);
        const ammo = (this._energyGain(shape, energyCells) * (1 + this.relicNum('cm_charge') / 100) + energyBonus);
        if (this.relicNum('cm_charge') > 0) this.relicFx('cm_charge', `全局充能 +${this.relicNum('cm_charge')}%`); // 生效提示
        if (energyBonus > 0) this.relicFx('cm_ammobox', `充能 +${ammo}`); // 生效提示
        if (skill === 'shuffle') shuffleGain = this._chargeAmmo('shuffle', ammo);
        else if (skill === 'refill') refillGain = this._chargeAmmo('refill', ammo);
        this.gainExp(this._relicExp(Math.floor(exp * CONFIG.PENALTY_RATIO), shape, size));
      }
    } else {
      // 塔色：能量按形状供给 + 整体经验；能量满 → 溢出均分充能两个全局技能（能量口径）
      // 弹药箱：三消充能能量 +N（按星级数值）
      const colorEnergy = this.relicNum(`r_${t.key}_energy`);
      const gain = this._energyGain(shape, energyCells)*(1+TalentRuntime.bonus(this,t.key).charge) + energyBonus + colorEnergy;
      const before = t.energy;
      t.energy = Math.min(before + gain, this.armoryEnergyMax(t.key));
      ammoGain = t.energy - before;
      const over = Math.max(0, before + gain - this.armoryEnergyMax(t.key));
      if (over > 0) {
        // 弹药箱3★：能量溢出 50% 概率存入备用能量库（上限 20 点，普攻能量不足自动借用）
        MatchRelics.onTowerOverflow(this, over);
        const half = over / 2;
        shuffleGain = this._chargeAmmo('shuffle', half);
        refillGain = this._chargeAmmo('refill', over - half);
      }
      this.gainExp(this._relicExp(exp, shape, size));
      target = t;
    }
    // 更新待选峰值
    Object.keys(this.effects.towers).forEach((k) => {
      this.pendingPeak = Math.max(this.pendingPeak, this.effects.tower(k).pending);
    });
    return { tower: target ? target.key : null, gotTower, penalized, exp, shape, ammoGain, shuffleGain, refillGain };
  }

  /** 爆炸波及格按块奖励：每格按颜色充能对应塔（已激活 +2 能量；未激活色 → 充全局技能；塔激活以三消为准） */
  _blastReward(st) {
    let gain = 0;
    const seen = new Set();
    let exp=0;
    const perCell=new Map();
    for(const m of st.matches||[]){const mult=m.size>=5?1.5:m.size===4?1.2:1;for(const pos of m.cells||[]){const key=pos[0]+','+pos[1];perCell.set(key,Math.max(perCell.get(key)||1,mult));}}
    const blastMult=(st.matches||[]).reduce((n,m)=>Math.max(n,m.size>=5?1.5:m.size===4?1.2:1),1);
    for (const cell of st.clearedDetails || []) {
      const id = cell.r + ',' + cell.c;
      if (seen.has(id)) continue; seen.add(id);
      if (!cell.color) continue;
      const t = this.effects.tower(CONFIG.COLORS[cell.color] && CONFIG.COLORS[cell.color].tower);
      if (!t) continue;
      const mult=perCell.get(id)||blastMult;
      exp+=CONFIG.EXP.perCell*mult;
      const amount = this._energyGain('3', 1)*mult;
      if (t.level > 0) {
        const before = t.energy;
        t.energy = Math.min(before + amount, this.armoryEnergyMax(t.key));
        gain += t.energy - before;
        const over = Math.max(0, before + amount - this.armoryEnergyMax(t.key));
        if (over > 0) { this._chargeAmmo('shuffle',over/2); this._chargeAmmo('refill',over/2); }
      } else {
        const which = this._globalSkillOf(cell.color);
        if (which) this._chargeAmmo(which,amount * (1 + this.relicNum('cm_charge') / 100));
      }
    }
    if(exp>0)this.gainExp(this._relicExp(exp,'3',seen.size));
    return gain;
  }

  /** 剩余 2 色的全局技能归属（本局随机分配，不固定颜色）；4 塔未满时返回 null */
  _globalSkillOf(color) {
    if (!this._globalMap) this._initGlobalMap();
    return this._globalMap ? this._globalMap[color] : null;
  }

  /** 4 塔确定后：6 色中未选中 2 色 → 随机分配为「全局洗牌 / 弹药补给」充能色 */
  _initGlobalMap() {
    const remain = Object.keys(CONFIG.COLORS).filter((c) => {
      const tk = CONFIG.COLORS[c].tower;
      return tk && !this.slotOrder.includes(tk);
    });
    if (remain.length < 2) { this._globalMap = {}; return; }
    const rng = this.rng || Math.random;
    for (let i = remain.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = remain[i]; remain[i] = remain[j]; remain[j] = tmp;
    }
    this._globalMap = { [remain[0]]: 'shuffle', [remain[1]]: 'refill' };
  }

  /** 炮·军火库：充能上限 +30；A 填充量 +25%/级；B 全局技能充能速度 +25%/级 */
  armory() {
    const ct = this.effects ? this.effects.tower('cannon') : null;
    const arm = ct ? (ct.pool || []).find((e) => e.name === '军火库') : null;
    return arm ? { lv: arm.level, a: arm.branches ? arm.branches.A || 0 : 0, b: arm.branches ? arm.branches.B || 0 : 0 } : null;
  }

  /** 当前电磁过载状态；B分支缓解全局能量上限惩罚，A/C分别调整伤害。 */
  electricOverload() {
    const tower = this.effects && typeof this.effects.tower === 'function' ? this.effects.tower('electric') : null;
    const ef = tower && tower.pool && tower.pool.find((item) => item.name === '电磁过载');
    if (!ef || ef.level <= 0) return { level: 0, A: 0, B: 0, C: 0 };
    return { level: ef.level, A: ef.branches.A || 0, B: ef.branches.B || 0, C: ef.branches.C || 0 };
  }

  /** 基础100；军火库最多+30；弹药库圣遗物按星级+10/+20/+30；电磁过载再扣减全塔能量上限。 */
  armoryEnergyMax(key) {
    const a = this.armory();
    const armoryStar = this._testStar3 && this._testStar3.can_armory ? 3
      : (this.metaRef && this.metaRef.starOf ? this.metaRef.starOf('can_armory') : 1);
    const relicCap = this.relicRun('can_armory') > 0 ? [0, 10, 20, 30][Math.max(1, Math.min(3, armoryStar))] : 0;
    const skillCap = a && a.lv > 0 ? (TOWER_SKILLS.cannon['军火库'].energyMax || 30) : 0;
    const overload = this.electricOverload();
    const penalty = overload.level > 0 ? TOWER_SKILLS.electric['电磁过载'].energyPenaltyByBranch[overload.B] : 0;
    const colorCap = key ? this.relicNum(`r_${key}_cap`) : 0;
    return Math.max(1, Math.round((CONFIG.GLOBAL_SKILL.energyMax + skillCap + relicCap + colorCap) * (this.fieldAmmoMult || 1)) - penalty);
  }

  /** 塔色消除供能（能量口径）：3消 +6 / 4消 +12 / 5消（L5/直5）+20 / 5消以上(x块) 20+6(x-5)；军火库 A +25%/级 */
  _energyGain(shape, size) {
    let base = Math.max(0, size) * CONFIG.GLOBAL_SKILL.energyPerBlock * (size>=5 || ['5','L5','6+'].includes(shape)?1.5:size===4 || shape==='4'?1.2:1);
    const a = this.armory();
    if (a && a.lv > 0) base *= (1 + TOWER_SKILLS.cannon['军火库'].fillPerBranch * a.a);
    return base;
  }

  /** 全局技能累计充能（封顶 energyMaxGS=90；返回实际入账点） */
  _chargeAmmo(which, ammo) {
    if (!ammo || ammo <= 0) return 0;
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleAmmo' : 'refillAmmo';
    const before = this[key] || 0;
    this[key] = Math.min(before + ammo, GS.energyMaxGS);
    const got = this[key] - before;
    // 全局充能3★：充能溢出（已达上限）转为技能伤害加成（每溢出 +10%，上限50%）
    const over = Math.max(0, before + ammo - GS.energyMaxGS);
    MatchRelics.onGlobalOverflow(this, over);
    return got;
  }

  /** 消耗全局技能累计充能（释放 1 次 = chargePerUse 点；不足返回 false）；免费洗牌优先 */
  spendAmmo(which) {
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleAmmo' : 'refillAmmo';
    if ((this.globalSlots || ['shuffle','refill'])[which === 'shuffle' ? 0 : 1] === 'shuffle' && this.freeShuffle > 0) {
      this.freeShuffle -= 1;
      return true;
    }
    if ((this[key] || 0) < GS.chargePerUse) return false;
    this[key] -= GS.chargePerUse;
    return true;
  }

  /** 局内限时道具乘区；到期恢复，不将购买次数视为永久层数。 */
  storeBuff() { return BattleShop.buffs(this); }

  buyStoreItem(id) { return BattleShop.buy(this, id).ok; }

  /** 真实路径：棋盘交换 → 按连锁步逐组结算（每步单独成组，供逐级连锁动画逐级 toast）＋ 连消技 */
  trySwap(r1, c1, r2, c2) {
    const ret = this.board.trySwap(r1, c1, r2, c2);
    if (!ret.ok) return { ok: false };
    // 三消之力3★：连锁≥2 步时本次交换所有消除经验再 +50%
    this._triple3 = false;
    const settled = [], settledByStep = [], chainShotsByStep = [];
    const chainStart = this.gsState.chainstorm ? GS_BALANCE.chainstorm.startGroup : CONFIG.MATCH_SKILL.chainStart;
    this.gsState.chainstorm = false;
    if (this.gsState.charge) {
      const colors = ret.resolved.matches.map(m=>m.color);
      const ordered = [...new Set(colors.map(c=>CONFIG.COLORS[c] && CONFIG.COLORS[c].tower).concat(this.slotOrder))].filter(k=>this.slotOrder.includes(k)).slice(0,GS_BALANCE.charge.towerCount);
      ordered.forEach(k=>{const t=this.effects.tower(k);t.energy=Math.min(this.armoryEnergyMax(k),t.energy+GS_BALANCE.charge.energy);});
      this.gsState.charge=false;
    }
    ret.resolved.stepList.forEach((st, si) => {
      const stepSettled = [];
      const isChain = (si + 1) >= chainStart;   // 按统一阈值，从 Combo ×3 起算连锁
      st.matches.forEach((m) => {
        // 组色已在 resolve 清空前记录，避免连锁后棋盘移动取错色
        if (m.color) stepSettled.push(this.applyMatch(m.color, m.shape, m.size, 0));
      });
      // 爆炸波及格按块计入奖励：每格充能对应颜色塔（匹配组内格已由 applyMatch 按形状结算，跳过避免双算）
      const blastGain = this._blastReward(st);
      if (blastGain > 0) stepSettled.push({ tower: null, gotTower: false, penalized: false, shape: null, exp: 0, ammoGain: blastGain, shuffleGain: 0, refillGain: 0 });
      // 连消全格弹道：仅生成该步计划，真实发射由消除动画阶段驱动。
      chainShotsByStep[si] = [];
      if (isChain && this.combatRef) {
        // Keep the previous inactive-tower charge fallback once per three-match group.
        this._chainBonus(st, si + 1);
        const L = CONFIG.LAYOUT.boardCell;
        const plan = ChainAttacks.plan({ steps: [st], startGroup: 1,
          activeTowers: this.slotOrder.slice(),
          layout: { cols: L.cols, cell: this.boardCell || L.size,
            originX: this.boardX, originY: this.boardY || 1089 } });
        chainShotsByStep[si] = plan.shots.filter(shot => shot.kind === 'tower' || shot.kind === 'charge')
          .map(shot => ({ ...shot, stepIndex: si, group: si + 1 }));
      }
      // 连消飘字随 Match3 实际消除阶段播放，避免所有连消一次性提前弹出。
      settled.push(...stepSettled);
      settledByStep.push(stepSettled);
    });
    this._triple3 = false;
    return { ok: true, matches: ret.resolved.matches, steps: ret.resolved.steps, settled, settledByStep, chainShotsByStep, chainStart, stepList: ret.resolved.stepList };
  }


  /** 旧连消攻击已替换；仅保留未出战颜色三连组的原有充能回退。 */
  _chainBonus(st, comboN) {
    // Legacy attack/periodic rewards are replaced; retain only the old charge fallback.
    if (!['attack', 'skill'].includes(this.matchSkills.chain)) return;
    const three = st.matches.filter(m => !m.rainbow && m.shape === '3' && m.color);
    for (const m of three) {
      const key = CONFIG.COLORS[m.color] && CONFIG.COLORS[m.color].tower;
      if (!key) continue;
      const tower = this.effects.tower(key);
      if (tower.level > 0) continue;
      const half = Math.floor(CONFIG.MATCH_SKILL.chainEnergy / 2);
      this._chargeAmmo('shuffle', half);
      this._chargeAmmo('refill', CONFIG.MATCH_SKILL.chainEnergy - half);
    }
  }

  /** 升级发放目标：累计升级次数最少的已拥有塔（均衡轮转，跨波记忆；避免单塔长期不升级） */
  _nextPendingTower() {
    const owned = Object.keys(this.effects.towers).filter((k) => {
      const tower = this.effects.tower(k);
      return tower.level > 0 &&
        tower.level + tower.pending < CONFIG.EXP.towerMaxLevel &&
        tower.pending < CONFIG.EFFECT.pendingCap;
    });
    if (!owned.length) return null;
    let best = owned[0];
    owned.forEach((k) => {
      if ((this._upCount[k] || 0) < (this._upCount[best] || 0)) best = k;
    });
    this._upCount[best] = (this._upCount[best] || 0) + 1;
    return this.effects.tower(best);
  }

  _randomOwnedTower() {
    const owned = Object.keys(this.effects.towers).filter((k) => this.effects.tower(k).level > 0);
    if (!owned.length) return null;
    return this.effects.tower(owned[Math.floor(this.rng() * owned.length)]);
  }

  /* ---------- 波次 ---------- */

  /** 进入下一波（模拟/UI 统一入口） */
  startWave() {
    this.wave += 1;
    if (this.gsState) { this.gsState.shield=0; this.gsState.shieldWave=this.wave; }
    // 战场被动触发：霜风每 windEvery 波风场增速 +1 层；深渊每 curseEvery 波诅咒 +1 层
    const f = this.fieldCfg;
    if (f) {
      if (f.windEvery && this.wave % f.windEvery === 0) this.windStacks = (this.windStacks || 0) + 1;
      if (f.curseEvery && this.wave % f.curseEvery === 0) this.curseStacks = (this.curseStacks || 0) + 1;
    }
    WaveRelics.startWave(this);
    // 炮·军火库 B 战备：每波开始立即获得 6/12/18 点能量（开局即高能，早进正常/溢出区间）
    const armB = this.armory();
    if (armB && armB.lv > 0 && armB.b > 0) {
      const ctB = this.effects.tower('cannon');
      if (ctB) ctB.energy = Math.min(ctB.energy + TOWER_SKILLS.cannon['军火库'].startPerBranch * armB.b, this.armoryEnergyMax('cannon'));
    }
    // 波末银币拆成「满额基准 × 本波击杀完成度」：基准在开波时算，
    //   完成度由真实战斗在波末回填（一只没打 → 0；全歼 → 满额）。此前纯按波数发放，挂机也有全额收益。
    this._waveGoldBase = CONFIG.ECONOMY.waveSilver(this.wave);
    this._waveGold = this._waveGoldBase;
    this._waveGoldRatio = 1;
    return this.wave;
  }

  /**
   * 波末结算：银币 + 战斗 + 协同检测。
   * @param {boolean} [skipLeak] 真实战斗路径传 true：城墙血由「怪物攻城」实时扣减，
   *   不再按抽象漏怪模型重复扣（模拟路径不传，保持既有抽象口径）。
   * @returns {broken, leak, enemyHp, totalDps, waveGold, firstSynergyWave}
   */
  endWave(skipLeak) {
    // 银币按本波击杀完成度折算（模拟路径无完成度回填 → 默认 1，保持原口径）
    const ratio = (typeof this._waveGoldRatio === 'number' && isFinite(this._waveGoldRatio))
      ? Math.max(0, Math.min(1, this._waveGoldRatio)) : 1;
    const base = (this._waveGoldBase != null) ? this._waveGoldBase
      : CONFIG.ECONOMY.waveSilver(this.wave);
    this._waveGold = Math.round(base * ratio * 10) / 10;
    WaveRelics.endWave(this);
    // 战斗：敌人血量 vs 全塔 DPS（含协同）；战场被动：诅咒 ×1.15^n 血量，风场 /1.10^n 有效输出时长
    const curseMul = Math.pow(1.15, this.curseStacks || 0);
    const windMul = Math.pow(1.10, this.windStacks || 0);
    // 代际重构：本波总血量由等级表生成（与 wave.buildPlan 同口径）
    const enemyHp = this.bossWaveNo===this.wave && this.bossWaveHp ? this.bossWaveHp : CONFIG.ENEMY.waveTotalHp(this.wave, curseMul);
    const totalDps = this.effects.totalDps();
    const dealt = totalDps * CONFIG.WAVE.seconds / windMul;
    const leak = Math.max(0, enemyHp - dealt);
    if (!skipLeak) this.lineHp -= this.applyWallDamage(leak);
    // 协同检测（与模拟一致）
    this.effects.updateSynergies();
    if (this.firstSynergyWave === null && this.effects.synergyDone[0]) this.firstSynergyWave = this.wave;
    this.broken = this.lineHp <= 0 || this.wave >= CONFIG.WAVE.maxWave;
    return { broken: this.broken, leak, enemyHp, totalDps, waveGold: this._waveGold, firstSynergyWave: this.firstSynergyWave };
  }

  /** 波末三选一队列（包装 effects.settlePending） */
  settleQueue() { return this.effects.settlePending(); }

  /** 玩家/自动确认三选一 */
  applyChoice(towerKey, ef) {
    const result = this.effects.applyChoice(towerKey, ef);
    if (result.ok) {
      Object.keys(this.effects.towers || {}).forEach((key) => {
        const tower = this.effects.tower(key);
        const cap = this.armoryEnergyMax(key);
        if (tower && tower.level > 0 && tower.energy > cap) tower.energy = cap;
      });
    }
    return result;
  }

  /** run 间重置：特效构筑/待选/整体经验清空（金币由 session 保留——见 simulateSession） */
  resetRunBuild() {
    this.eliteBursts = [];
    this.store = {}; this.storeTimers = {}; this.storeCooldowns = {}; this.pickRerolls = 0;
    this.gsState = {};
    Object.keys(this.effects.towers).forEach((k) => this.effects.tower(k).resetRunBuild());
    this.wave = 0; this.lineHp = CONFIG.LINE.hp; this.broken = false;
    this.clearedWaves = 0;   // 全歼波数同局清零
    this._evacSeen = 0;      // 撤离检查点同局清零
    this.pendingPeak = 0; this.picks = 0; this.firstSynergyWave = null;
    this._directDone = 0;
    this.slotOrder = [];
    this.exp = 0; this.expLevel = 0;   // ：整体经验每局从 0 开始
    this._upCount = {};                // 均衡轮转计数同局清空
    this.shuffleAmmo = 0; this.refillAmmo = 0;  // 全局技能累计弹药（每局清零）
    this._globalMap = null;            // 剩余 2 色的全局技能归属（4 塔确定后初始化）
    this.dmgStat = {};                 // 伤害统计本局清零
  }

  /* ---------- 模拟一局（操作模型路径，对齐 python simulate_run） ---------- */

  /** 模拟单局：从 startWave 开始打到破防/50 波，返回结果对象 */
  simulateRun() {
    const result = { breakWave: this.wave, firstSynergyWave: null, picks: 0, pendingPeak: 0 };
    while (true) {
      this.startWave();
      // 波内：MATCHES_PER_WAVE 次消除（3连/直4/L5/直5 占比抽样；前 DIRECT_FIRST 定向红/绿）
      const SHAPE_SIZE = { '3': 3, '4': 4, L5: 5, '5': 5 };
      for (let i = 0; i < CONFIG.WAVE.matchesPerWave; i++) {
        const r = this.rng();
        let shape = '3';
        if (r < CONFIG.WAVE.matchDist['3'] + CONFIG.WAVE.matchDist['4']) {
          shape = r < CONFIG.WAVE.matchDist['3'] ? '3' : '4';
        } else {
          shape = (r < CONFIG.WAVE.matchDist['3'] + CONFIG.WAVE.matchDist['4'] + CONFIG.WAVE.matchDist['L5']) ? 'L5' : '5';
        }
        let color;
        if (this._directDone < CONFIG.DIRECT_FIRST && this._directDone < this._directSeq.length) {
          color = this._directSeq[this._directDone++];
        } else {
          color = this._pickColor();
        }
        this.applyMatch(color, shape, SHAPE_SIZE[shape]);
      }
      // 波末：三选一（targeting 自动路径）→ 金币 → 战斗
      const auto = this.effects.settleAuto();
      this.picks += auto.picks;
      const waveRes = this.endWave();
      result.pendingPeak = Math.max(result.pendingPeak, this.pendingPeak);
      if (waveRes.firstSynergyWave !== null && result.firstSynergyWave === null) {
        result.firstSynergyWave = waveRes.firstSynergyWave;
      }
      if (this.broken) { result.breakWave = this.wave; result.picks = this.picks; break; }
    }
    return result;
  }
}

/* ---------- 会话模拟（30 分钟窗口，多 run 连续） ---------- */

/**
 * @param opts {seed, durationSec, difficulty}
 * @returns {runs:[...], totalGold, wavesPlayed, elapsed, pickCapOk}
 */
function simulateSession(opts) {
  opts = opts || {};
  const seed = opts.seed !== undefined ? opts.seed : 20261017;
  const duration = opts.durationSec || CONFIG.WAVE.seconds * 45;
  const rng = mulberry32(seed);
  const run = new Run({ rng, difficulty: opts.difficulty });
  let elapsed = 0, waveIndex = 1, totalGold = 0, pickCapOk = true;
  const runs = [];
  while (elapsed < duration) {
    run.resetRunBuild();
    run.wave = waveIndex - 1;               // simulateRun 内 startWave 自增
    const res = run.simulateRun();
    runs.push(res);
    const g = run.gold; run.gold = 0;       // 单 run 金币计入会话累计
    totalGold += g;
    elapsed += (res.breakWave - waveIndex + 1) * CONFIG.WAVE.seconds;
    if (res.pendingPeak > CONFIG.EFFECT.pendingCap) pickCapOk = false;
    waveIndex = res.breakWave + 1;
  }
  return { runs, totalGold, wavesPlayed: waveIndex - 1, elapsed, pickCapOk };
}

module.exports = { Run, simulateSession, expOfShape, mulberry32 };
