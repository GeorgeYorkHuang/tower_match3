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
const Board = require('./board.js');
const { EffectManager } = require('./effects.js');

/* 消除经验：塔经验按消除方块计算 = 每块基础经验 × 块数 × 形状倍率（直4/L5/直5 更高） */
function expOfShape(shape, size) {
  const mult = CONFIG.EXP.shape[shape] || 1.0;
  return Math.floor((CONFIG.EXP.perCell * size) * mult);
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
    this.difficulty = opts.difficulty || CONFIG.DIFFICULTY.default;
    this.board = new Board({ difficulty: this.difficulty });
    this.board.init();
    this.effects = new EffectManager({ rng: this.rng });
    this.effects.run = this;      // v1.8：整体经验池（v1.16.55 塔 DPS 不再随整体等级成长）
    this.exp = 0;                 // v1.8：整体经验池（塔不再单独获取经验）
    this.expLevel = 0;            // 整体等级（经验条/等级圆显示；升级发放三选一——v1.16.55 不再影响塔 DPS）
    this._upCount = {};           // 各塔累计升级次数（均衡轮转，跨波记忆）
    this.wave = 0;
    this.lineHp = CONFIG.LINE.hp;
    this.gold = 0;
    this.broken = false;
    this.pendingPeak = 0;
    this.picks = 0;
    this.firstSynergyWave = null;
    this.shuffleAmmo = 0; this.refillAmmo = 0;  // v1.12.4 全局技能累计充能（每 chargePerUse 点 → 可释放 1 次）
    this.freeShuffle = 0;   // v1.16.78 战术转移：每波免费洗牌次数（优先于充能消耗）
    this._globalMap = null;            // 剩余 2 色的全局技能归属（4 塔确定后初始化）
    this.store = { atk: 0, spd: 0 };   // v1.16.77 局内商店临时强化层数（本局生效，局末清零）
    this.fieldCfg = null;              // v1.16.78 战场被动配置（由主流程注入：风场/诅咒触发器）
    this.windStacks = 0;               // v1.16.78 霜风峡谷：风场增速层数（每 windEvery 波 +1，移速 ×1.10^n）
    this.curseStacks = 0;              // v1.16.78 深渊裂隙：诅咒层数（每 curseEvery 波 +1，怪物血量 ×1.15^n）
    this._colors = Object.keys(CONFIG.COLOR_WEIGHT);
    this._weights = this._weightsFor();
    this._directSeq = ['red', 'green'];
    this._directDone = 0;
    this.slotOrder = [];      // 先消先得：塔获得顺序（前 TOWER_SLOTS 个占槽）
    this.runRelic = {};       // v1.16.60 局内圣遗物（rougelike）本局生效计数 { id: count }
    this.metaRef = null;      // v1.16.78 星级查询引用（main 注入 meta；模拟层缺省按 1★）
    /* v1.16.96 3★ 质变行为局内状态 */
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
    /* v1.16.96 火塔 3★ 局内状态 */
    this._fuelBoost = 0;           // 薪柴3★：灼烧概率溢出转灼烧伤害（%，上限50）
    this._forgeCount = 0;          // 熔炉之息3★：普攻计数（每5次免费火柱）
    this._burnallTtl = 0;          // 焚天3★：火柱/火墙/火雨施放后全塔攻速+25%窗口（秒）
    this._fireTripleNext = false;  // 焰雨3★：火球命中同一目标3次后，下次攻击必为三连火球
    this._emberShots = null;       // 余烬风暴3★：余烬弹队列（1秒后自动射向最近敌）
    /* v1.16.98 冰塔 3★ 局内状态 */
    this._wallDmgAcc = 0;          // 冰墙裂变3★：冰盾生效期间城墙受击伤害累计（每100点→冰塔1能量）
  }

  /** 局内圣遗物拥有数（未获得返回 0） */
  relicRun(id) {
    return this.runRelic[id] || 0;
  }

  /** v1.16.78 圣遗物当前星级数值（1★=desc 最后数字，2★=star2 最后数字）；未获得返回 0；模拟层无 metaRef 按 1★ */
  relicNum(id) {
    if (this.relicRun(id) <= 0) return 0;
    const star = (this.metaRef && this.metaRef.starOf) ? this.metaRef.starOf(id) : 1;
    return CONFIG.relicNum(id, star);
  }

  /** v1.16.96 3★ 质变行为生效判定：STAR3_ENABLED 开启 + 拥有 + 星级≥3；模拟层无 metaRef 按 false（不生效）
   *  v1.16.104 测试战场 3★ 模式：_testStar3Mode=true 且 _testStar3[id] 被注入时，该圣遗物按 3★ 质变生效（无需真实 3★ 解锁） */
  relic3(id) {
    if (!CONFIG.STAR3_ENABLED && !this._testStar3Mode) return false;
    if (this.relicRun(id) <= 0) return false;
    if (this._testStar3 && this._testStar3[id]) return true;
    if (!this.metaRef || !this.metaRef.starOf) return false;
    return this.metaRef.starOf(id) >= 3;
  }

  /** v1.17 圣遗物生效触发飘字：★星级 + 圣遗物名 + 触发文案（圣遗物色）
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
      : (this.metaRef && this.metaRef.starOf) ? this.metaRef.starOf(id) : 1;
    this.fxTarget.push({
      type: 'floatText',
      text: `★${star} ${def ? def.name : id}${text ? ' ' + text : ''}`,
      x: x == null ? 375 : x, y: y == null ? 240 : y,
      t: 0, dur: 1.0, size: 20, color: CONFIG.relicColor(id),
    });
    return true;
  }

  /** v1.16.96 城墙受击统一入口：减伤护符3★ 大额伤害截断（超10%最大血量部分减免50%）→ 生命回复3★ 护盾优先抵扣 */
  applyWallDamage(d) {
    if (!(d > 0)) return 0;
    // v1.16.102 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效），窗口内城墙完全免伤
    if ((this._wallInvT || 0) > 0) return 0;
    let dmg = d;
    // v1.16.98 冰墙裂变3★：城墙受击伤害累计（冰盾生效期间由 combat 转冰塔能量）
    this._wallDmgAcc = (this._wallDmgAcc || 0) + dmg;
    const maxHp = this.lineMaxHp || CONFIG.LINE.hp;
    if (this.relic3('cm_guard') && dmg > maxHp * 0.1) {
      dmg = maxHp * 0.1 + (dmg - maxHp * 0.1) * 0.5;
      this.relicFx('cm_guard', '大额伤害截断 50%'); // v1.17 生效提示
    }
    if (this.wallShield > 0) {
      const s = Math.min(this.wallShield, dmg);
      this.wallShield -= s;
      dmg -= s;
    }
    return dmg;
  }

  /** v1.16.96 城墙加固3★：城墙每损失10%最大血量，全塔攻击+1%（背水，最高+10%） */
  wallAtkBonus() {
    if (!this.relic3('cm_wall')) return 0;
    const maxHp = this.lineMaxHp || CONFIG.LINE.hp;
    if (maxHp <= 0) return 0;
    const pct = Math.floor((1 - this.lineHp / maxHp) * 10);
    return Math.max(0, Math.min(10, pct));
  }

  /** v1.16.96 弹药箱3★：普攻能量不足时从备用能量库借用（一次借足 0.5 发） */
  spendAttackEnergy(t) {
    const need = CONFIG.GLOBAL_SKILL.perAttack;
    if (t.energy < need && this.energyBank > 0) {
      const take = Math.min(this.energyBank, need - t.energy);
      this.energyBank -= take;
      t.energy += take;
    }
    if (t.energy >= need) t.energy -= need;
    else t.energy = 0;
  }

  /** v1.16.96 赏金猎人3★：连续3波不掉宝箱时，第4波必掉（调用方在掉落判定处消费） */
  bountyGuarantee() {
    if (!this.relic3('cm_bounty') || this._bountyStreak < 3) return false;
    this._bountyStreak = 0;
    return true;
  }

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

  /** 整体经验：升级需求 = base × growth^expLevel（L0 起：30 / 42 / 58.8 ...）；v1.16.60 智慧典籍 -10%（v1.16.78 按星级） */
  expNeed() {
    let need = CONFIG.EXP.base * Math.pow(CONFIG.EXP.growth, this.expLevel);
    const n = this.relicNum('cm_tome');
    if (n > 0) need *= (1 - n / 100);
    return need;
  }

  /** v1.16.60 三消之力：每次三消获得的经验 +N%（v1.16.78 按星级数值）；v1.16.96 3★：连锁×2 以上时经验再 +50% */
  _relicExp(v) {
    let e = Math.round(v * (1 + this.relicNum('cm_triple') / 100));
    if (this._triple3) e = Math.round(e * 1.5);
    return e;
  }

  /**
   * v1.8：整体经验入池（消除/击杀/波末统一走这里，塔不再单独获取经验）。
   * 经验满 → 整体等级 +1 → 待选最少的已拥有塔 +1（均衡成长，升级三选一强化单塔）。
   * @returns 本次升级次数（>0 时调用方应触发升级三选一）
   */
  gainExp(v) {
    if (!(v > 0)) return 0;
    this.exp += v;
    let ups = 0;
    while (this.expLevel < CONFIG.EXP.towerMaxLevel && this.exp >= this.expNeed()) {
      const need = this.expNeed();
      this.exp -= need;
      this.expLevel += 1;
      ups += 1;
      // v1.16.96 经验之心3★：升级时 20% 概率返还本级经验的 50%（滚雪球加速）
      if (this.relic3('cm_exp') && this.rng() < 0.2) {
        this.exp += Math.round(need * 0.5);
        this.relicFx('cm_exp', '升级返还 50% 经验'); // v1.17 生效提示
      }
      // v1.16.96 智慧典籍3★：升级时触发全塔 3 秒攻速 +20%（窗口由 combat 递减）
      if (this.relic3('cm_tome')) {
        this._tomeBuffTtl = 3;
        this.relicFx('cm_tome', '升级攻速 +20%'); // v1.17 生效提示
      }
      const t = this._nextPendingTower();
      if (t) t.pending = Math.min(t.pending + 1, CONFIG.EFFECT.pendingCap);
    }
    return ups;
  }

  /**
   * 结算一次消除（形状：'3' 三连 / '4' 直4 / 'L5' L形5 / '5' 直5 / '6+'）。
   * v1.16.77 三消奖励（能量口径）：
   *   - 塔色（已获得塔）：能量按形状供给（3消+6/4消+12/5消+20/6+(x块)20+6(x-5)）+ 整体经验；能量满 → 溢出均分充能两个全局技能
   *   - 未获得且塔位未满：得塔（初始能量 startEnergy；6 色均可成塔）
   *   - 塔位满后剩余 2 色（未选中）：动态分配两个全局技能充能色 → 按能量口径充能（energyShape 公式）+ 半量经验
   * 全局技能充能（v1.12.4）：累计补充充能（剩余色消除 + 塔色溢出），每 30 点 → 可释放 1 次，上限 3 次（90 点）。
   * @returns {tower, gotTower, penalized, exp, shape, ammoGain, shuffleGain, refillGain}
   */
  applyMatch(color, shape, size) {
    const exp = expOfShape(shape, size);
    const GS = CONFIG.GLOBAL_SKILL;
    // v1.16.78 连锁反应：三消触发4连概率 +N%（本次按直4 结算；模拟层按 1★ 数值）
    const comboN = this.relicNum('cm_combo');
    if (comboN > 0 && size <= 3 && this.rng() < comboN / 100) {
      shape = '4'; size = 4;
      this.relicFx('cm_combo', `4连触发 +${comboN}%`); // v1.17 生效提示
    }
    // v1.16.96 力量符3★：4连及以上消除 → 全塔伤害永久 +0.5%（本局，上限15%）
    if (this.relic3('cm_power') && (size >= 4 || shape === '4' || shape === 'L5' || shape === '5')) {
      this.cmPower3 = Math.min(15, this.cmPower3 + 0.5);
      this.relicFx('cm_power', `4连叠伤 +${this.cmPower3}%`); // v1.17 生效提示
    }
    const t = this.effects.tower(CONFIG.COLORS[color] ? CONFIG.COLORS[color].tower : null);
    let gotTower = false, penalized = false, target = null;
    let ammoGain = 0, shuffleGain = 0, refillGain = 0;
    if (!t) {
      // 兜底（6 色均有塔池，理论上不触发）
      this.gainExp(this._relicExp(Math.floor(exp * CONFIG.PENALTY_RATIO)));
    } else if (t.level === 0) {
      const owned = Object.keys(this.effects.towers).filter((k) => this.effects.tower(k).level > 0).length;
      if (owned < CONFIG.TOWER_SLOTS) {
        t.unlock(); gotTower = true; target = t;
        if (!this.slotOrder.includes(t.key)) this.slotOrder.push(t.key);
        // v1.16.37 激活塔能量 = 15 + 本次消除形状供能（4消/5消初次激活即有收益；上限能量上限）
        // v1.16.60 弹药箱：每次三消充能能量 +N（v1.16.78 按 desc 星级数值）
        const gain = 15 + this._energyGain(shape, size) + this.relicNum('cm_ammobox');
        t.energy = Math.min(gain, this.armoryEnergyMax());
        ammoGain = t.energy;
        if (this.relicNum('cm_ammobox') > 0) this.relicFx('cm_ammobox', `能量 +${gain}`); // v1.17 生效提示
      } else {
        // 塔位满：该色未被选中 → 对应全局技能按能量口径充能（剩余 2 色动态分配）+ 半量经验
        // v1.16.60 全局充能 +N%、弹药箱 +N（v1.16.78 按星级数值）
        const skill = this._globalSkillOf(color);
        const ammo = Math.round(this._energyGain(shape, size) * (1 + this.relicNum('cm_charge') / 100) + this.relicNum('cm_ammobox'));
        if (this.relicNum('cm_charge') > 0) this.relicFx('cm_charge', `全局充能 +${this.relicNum('cm_charge')}%`); // v1.17 生效提示
        if (this.relicNum('cm_ammobox') > 0) this.relicFx('cm_ammobox', `充能 +${ammo}`); // v1.17 生效提示
        if (skill === 'shuffle') shuffleGain = this._chargeAmmo('shuffle', ammo);
        else if (skill === 'refill') refillGain = this._chargeAmmo('refill', ammo);
        this.gainExp(this._relicExp(Math.floor(exp * CONFIG.PENALTY_RATIO)));
      }
    } else {
      // 塔色：能量按形状供给 + 整体经验；能量满 → 溢出均分充能两个全局技能（能量口径）
      // v1.16.60 弹药箱：三消充能能量 +N（v1.16.78 按星级数值）
      const gain = this._energyGain(shape, size) + this.relicNum('cm_ammobox');
      const before = t.energy;
      t.energy = Math.min(before + gain, this.armoryEnergyMax());
      ammoGain = t.energy - before;
      const over = Math.max(0, before + gain - this.armoryEnergyMax());
      if (over > 0) {
        // v1.16.96 弹药箱3★：能量溢出 50% 概率存入备用能量库（上限 20 点，普攻能量不足自动借用）
        if (this.relic3('cm_ammobox') && this.rng() < 0.5) {
          const room = 20 - this.energyBank;
          if (room > 0) this.energyBank += Math.min(over, room);
        }
        const half = Math.floor(over / 2);
        shuffleGain = this._chargeAmmo('shuffle', half);
        refillGain = this._chargeAmmo('refill', over - half);
      }
      this.gainExp(this._relicExp(exp));
      target = t;
    }
    // 更新待选峰值
    Object.keys(this.effects.towers).forEach((k) => {
      this.pendingPeak = Math.max(this.pendingPeak, this.effects.tower(k).pending);
    });
    return { tower: target ? target.key : null, gotTower, penalized, exp, shape, ammoGain, shuffleGain, refillGain };
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

  /** 炮·军火库（v1.16.14）：选择后弹药库上限 +50；A 填充量 +25%/级；B 全局技能充能速度 +25%/级 */
  armory() {
    const ct = this.effects ? this.effects.tower('cannon') : null;
    const arm = ct ? (ct.pool || []).find((e) => e.name === '军火库') : null;
    return arm ? { lv: arm.level, a: arm.branches ? arm.branches.A || 0 : 0, b: arm.branches ? arm.branches.B || 0 : 0 } : null;
  }

  /** 塔能量上限（军火库 +50；v1.16.76 战场扭曲：熔岩矿场 ×0.7） */
  armoryEnergyMax() {
    const a = this.armory();
    return Math.round((CONFIG.GLOBAL_SKILL.energyMax + (a && a.lv > 0 ? 50 : 0)) * (this.fieldAmmoMult || 1));
  }

  /** 塔色消除供能（v1.16.77 能量口径）：3消 +6 / 4消 +12 / 5消（L5/直5）+20 / 5消以上(x块) 20+6(x-5)；军火库 A +25%/级 */
  _energyGain(shape, size) {
    const fixed = CONFIG.GLOBAL_SKILL.energyShape[shape];
    let base = fixed !== undefined ? fixed : 20 + 6 * (size - 5);   // '6+'（x 块，x≥6）
    const a = this.armory();
    if (a && a.lv > 0) base = Math.round(base * (1 + 0.25 * a.a));
    return base;
  }

  /** 全局技能累计充能（封顶 energyMaxGS=90；返回实际入账点；军火库 B 充能速度 +25%/级） */
  _chargeAmmo(which, ammo) {
    if (!ammo || ammo <= 0) return 0;
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleAmmo' : 'refillAmmo';
    const a = this.armory();
    if (a && a.lv > 0) ammo = Math.round(ammo * (1 + 0.25 * a.b));
    const before = this[key] || 0;
    this[key] = Math.min(before + ammo, GS.energyMaxGS);
    const got = this[key] - before;
    // v1.16.96 全局充能3★：充能溢出（已达上限）转为技能伤害加成（每溢出 +10%，上限50%）
    const over = Math.max(0, before + ammo - GS.energyMaxGS);
    if (over > 0 && this.relic3('cm_charge')) this.chargeSkillBoost = Math.min(50, this.chargeSkillBoost + 10);
    return got;
  }

  /** 消耗全局技能累计充能（释放 1 次 = chargePerUse 点；不足返回 false）；v1.16.78 免费洗牌优先 */
  spendAmmo(which) {
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleAmmo' : 'refillAmmo';
    if (which === 'shuffle' && this.freeShuffle > 0) {
      this.freeShuffle -= 1;
      return true;
    }
    if ((this[key] || 0) < GS.chargePerUse) return false;
    this[key] -= GS.chargePerUse;
    return true;
  }

  /** v1.16.77 局内商店强化查询：攻击层数 / 攻速层数（战斗时直接乘以 1+0.2×atk、1/(1+0.15×spd) 档） */
  storeBuff() {
    return { atk: this.store.atk || 0, spd: this.store.spd || 0 };
  }

  /** v1.16.77 局内商店购买：扣局内金币并施加临时强化（失败返回 false） */
  buyStoreItem(id) {
    const item = (CONFIG.STORE.items || []).find((s) => s.id === id);
    if (!item) return false;
    const bought = this.store[id] || 0;
    if (bought >= item.max) return false;
    const cost = item.cost[bought];
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.store[id] = bought + 1;
    return true;
  }

  /** 真实路径：棋盘交换 → 按连锁步逐组结算（每步单独成组，供逐级连锁动画逐级 toast） */
  trySwap(r1, c1, r2, c2) {
    const ret = this.board.trySwap(r1, c1, r2, c2);
    if (!ret.ok) return { ok: false };
    // v1.16.96 三消之力3★：连锁≥2 步时本次交换所有消除经验再 +50%
    this._triple3 = this.relic3('cm_triple') && (ret.resolved.steps || 0) >= 2;
    const settled = [], settledByStep = [];
    ret.resolved.stepList.forEach((st) => {
      const stepSettled = [];
      st.matches.forEach((m) => {
        // 组色已在 resolve 清空前记录，避免连锁后棋盘移动取错色
        if (m.color) stepSettled.push(this.applyMatch(m.color, m.shape, m.size));
      });
      settled.push(...stepSettled);
      settledByStep.push(stepSettled);
    });
    this._triple3 = false;
    return { ok: true, matches: ret.resolved.matches, steps: ret.resolved.steps, settled, settledByStep, stepList: ret.resolved.stepList };
  }

  /** 升级发放目标：累计升级次数最少的已拥有塔（均衡轮转，跨波记忆；避免单塔长期不升级） */
  _nextPendingTower() {
    const owned = Object.keys(this.effects.towers).filter((k) => this.effects.tower(k).level > 0);
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
    // v1.16.78 战场被动触发：霜风每 windEvery 波风场增速 +1 层；深渊每 curseEvery 波诅咒 +1 层
    const f = this.fieldCfg;
    if (f) {
      if (f.windEvery && this.wave % f.windEvery === 0) this.windStacks = (this.windStacks || 0) + 1;
      if (f.curseEvery && this.wave % f.curseEvery === 0) this.curseStacks = (this.curseStacks || 0) + 1;
    }
    // v1.16.78 战术转移：每波免费洗牌 +N 次（按星级）；v1.16.96 3★ 额外 +1 次
    const shN = this.relicNum('cm_shuffle');
    if (shN > 0) {
      this.freeShuffle += shN + (this.relic3('cm_shuffle') ? 1 : 0);
      this.relicFx('cm_shuffle', `免费洗牌 +${shN + (this.relic3('cm_shuffle') ? 1 : 0)}`); // v1.17 生效提示
    }
    // v1.16.96 金库3★：记录波初城墙血（波末无伤判定）；赏金猎人3★：连续无宝箱波计数
    this._waveStartHp = this.lineHp;
    if (this.relic3('cm_bounty')) {
      if (this._waveChestDropped) this._bountyStreak = 0;
      else this._bountyStreak += 1;
    }
    this._waveChestDropped = false;
    this._waveGold = CONFIG.ECONOMY.goldPerWaveBase * Math.pow(CONFIG.ECONOMY.goldPerWaveGrowth, this.wave - 1);
    return this.wave;
  }

  /**
   * 波末结算：金币 + 战斗 + 协同检测。
   * @param {boolean} [skipLeak] 真实战斗路径传 true：城墙血由「怪物攻城」实时扣减，
   *   不再按抽象漏怪模型重复扣（模拟路径不传，保持既有抽象口径）。
   * @returns {broken, leak, enemyHp, totalDps, waveGold, firstSynergyWave}
   */
  endWave(skipLeak) {
    // v1.16.78 金库：每波结束金币 +N%（按星级）；v1.16.96 3★：本波城墙无伤时金币额外 +30%
    this.gold += Math.round(this._waveGold * (1 + this.relicNum('cm_vault') / 100));
    if (this.relic3('cm_vault') && this.lineHp >= this._waveStartHp - 0.001) {
      this.gold += Math.round(this._waveGold * 0.3);
      this.relicFx('cm_vault', '无伤金币 +30%'); // v1.17 生效提示
    }
    // v1.16.78 生命回复：每波结束城墙回复 N% 生命；v1.16.96 3★：回复溢出转为护盾（上限10%最大血量）
    const regen = this.relicNum('cm_regen');
    if (regen > 0) {
      const maxHp = this.lineMaxHp || CONFIG.LINE.hp;
      const healed = maxHp * regen / 100;
      const before = this.lineHp;
      this.lineHp = Math.min(maxHp, this.lineHp + healed);
      const overflow = healed - (this.lineHp - before);
      if (overflow > 0 && this.relic3('cm_regen')) {
        this.wallShield = Math.min(maxHp * 0.1, this.wallShield + overflow);
      }
      this.relicFx('cm_regen', `城墙回复 ${regen}%`); // v1.17 生效提示
    }
    // 战斗：敌人血量 vs 全塔 DPS（含协同）；v1.16.78 战场被动：诅咒 ×1.15^n 血量，风场 /1.10^n 有效输出时长
    const curseMul = Math.pow(1.15, this.curseStacks || 0);
    const windMul = Math.pow(1.10, this.windStacks || 0);
    // v1.17 代际重构：本波总血量由等级表生成（与 wave.buildPlan 同口径）
    const enemyHp = CONFIG.ENEMY.waveTotalHp(this.wave, curseMul);
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
  applyChoice(towerKey, ef) { return this.effects.applyChoice(towerKey, ef); }

  /** run 间重置：特效构筑/待选/整体经验清空（金币由 session 保留——见 simulateSession） */
  resetRunBuild() {
    Object.keys(this.effects.towers).forEach((k) => this.effects.tower(k).resetRunBuild());
    this.wave = 0; this.lineHp = CONFIG.LINE.hp; this.broken = false;
    this.pendingPeak = 0; this.picks = 0; this.firstSynergyWave = null;
    this._directDone = 0;
    this.slotOrder = [];
    this.exp = 0; this.expLevel = 0;   // v1.8：整体经验每局从 0 开始
    this._upCount = {};                // 均衡轮转计数同局清空
    this.shuffleAmmo = 0; this.refillAmmo = 0;  // v1.12.4 全局技能累计弹药（每局清零）
    this._globalMap = null;            // 剩余 2 色的全局技能归属（4 塔确定后初始化）
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
