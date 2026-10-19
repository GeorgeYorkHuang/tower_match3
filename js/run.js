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
    this.effects.run = this;      // v1.8：整体经验 → 塔 DPS 按整体等级成长
    this.exp = 0;                 // v1.8：整体经验池（塔不再单独获取经验）
    this.expLevel = 0;            // 整体等级（经验条/等级圆显示；塔 DPS 成长依据）
    this._upCount = {};           // 各塔累计升级次数（均衡轮转，跨波记忆）
    this.wave = 0;
    this.lineHp = CONFIG.LINE.hp;
    this.gold = 0;
    this.broken = false;
    this.pendingPeak = 0;
    this.picks = 0;
    this.firstSynergyWave = null;
    this.shuffleEnergy = 0; this.freezeEnergy = 0;  // v1.12 全局技能能量（点）
    this._globalMap = null;            // 剩余 2 色的全局技能归属（4 塔确定后初始化）
    this._colors = Object.keys(CONFIG.COLOR_WEIGHT);
    this._weights = this._weightsFor();
    this._directSeq = ['red', 'green'];
    this._directDone = 0;
    this.slotOrder = [];      // 先消先得：塔获得顺序（前 TOWER_SLOTS 个占槽）
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

  /** 整体经验：升级需求 = base × growth^expLevel（L0 起：30 / 42 / 58.8 ...） */
  expNeed() {
    return CONFIG.EXP.base * Math.pow(CONFIG.EXP.growth, this.expLevel);
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
      this.exp -= this.expNeed();
      this.expLevel += 1;
      ups += 1;
      const t = this._nextPendingTower();
      if (t) t.pending = Math.min(t.pending + 1, CONFIG.EFFECT.pendingCap);
    }
    return ups;
  }

  /**
   * 结算一次消除（形状：'3' 三连 / '4' 直4 / 'L5' L形5 / '5' 直5 / '6+'）。
   * v1.12 三消奖励重做：
   *   - 塔色（已获得塔）：弹药 +size（封顶 ammoMax）+ 整体经验；弹药满 → 溢出均匀充能两个全局技能
   *   - 未获得且塔位未满：得塔（初始弹药 startAmmo；6 色均可成塔）
   *   - 塔位满后剩余 2 色（未选中）：动态分配两个全局技能充能色（不固定颜色）→ 按形状充能能量 + 半量经验
   * 充能数值：3连 +3 / 直4 +5 / 5 消及以上 块数×2。
   * @returns {tower, gotTower, penalized, exp, shape, ammoGain, shuffleGain, frzGain}
   */
  applyMatch(color, shape, size) {
    const exp = expOfShape(shape, size);
    const GS = CONFIG.GLOBAL_SKILL;
    const t = this.effects.tower(CONFIG.COLORS[color] ? CONFIG.COLORS[color].tower : null);
    let gotTower = false, penalized = false, target = null;
    let ammoGain = 0, shuffleGain = 0, frzGain = 0;
    if (!t) {
      // 兜底（6 色均有塔池，理论上不触发）
      this.gainExp(Math.floor(exp * CONFIG.PENALTY_RATIO));
    } else if (t.level === 0) {
      const owned = Object.keys(this.effects.towers).filter((k) => this.effects.tower(k).level > 0).length;
      if (owned < CONFIG.TOWER_SLOTS) {
        t.unlock(); gotTower = true; target = t;
        if (!this.slotOrder.includes(t.key)) this.slotOrder.push(t.key);
        ammoGain = GS.startAmmo;
      } else {
        // 塔位满：该色未被选中 → 对应全局技能充能（剩余 2 色动态分配）+ 半量经验
        const skill = this._globalSkillOf(color);
        const pts = this._energyPoints(shape, size);
        if (skill === 'shuffle') shuffleGain = this._chargeEnergy('shuffle', pts);
        else if (skill === 'freeze') frzGain = this._chargeEnergy('freeze', pts);
        this.gainExp(Math.floor(exp * CONFIG.PENALTY_RATIO));
      }
    } else {
      // 塔色：弹药 + 整体经验；弹药满 → 溢出均匀充能两个全局技能
      const before = t.ammo;
      t.ammo = Math.min(before + size, GS.ammoMax);
      ammoGain = t.ammo - before;
      const over = Math.max(0, before + size - GS.ammoMax);
      if (over > 0) {
        const half = Math.floor(over / 2);
        shuffleGain = this._chargeEnergy('shuffle', half);
        frzGain = this._chargeEnergy('freeze', over - half);
      }
      this.gainExp(exp);
      target = t;
    }
    // 更新待选峰值
    Object.keys(this.effects.towers).forEach((k) => {
      this.pendingPeak = Math.max(this.pendingPeak, this.effects.tower(k).pending);
    });
    return { tower: target ? target.key : null, gotTower, penalized, exp, shape, ammoGain, shuffleGain, frzGain };
  }

  /** 剩余 2 色的全局技能归属（本局随机分配，不固定颜色）；4 塔未满时返回 null */
  _globalSkillOf(color) {
    if (!this._globalMap) this._initGlobalMap();
    return this._globalMap ? this._globalMap[color] : null;
  }

  /** 4 塔确定后：6 色中未选中 2 色 → 随机分配为「全局洗牌 / 全局冰冻」充能色 */
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
    this._globalMap = { [remain[0]]: 'shuffle', [remain[1]]: 'freeze' };
  }

  /** 形状充能点数：3连 +3 / 直4 +5 / 5 消及以上 块数×2 */
  _energyPoints(shape, size) {
    const fixed = CONFIG.GLOBAL_SKILL.chargeShape[shape];
    if (fixed !== undefined) return fixed;
    return size * 2;
  }

  /** 全局技能能量充能（封顶 energyMax；返回实际入账点数） */
  _chargeEnergy(which, points) {
    if (!points || points <= 0) return 0;
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleEnergy' : 'freezeEnergy';
    const before = this[key] || 0;
    this[key] = Math.min(before + points, GS.energyMax);
    return this[key] - before;
  }

  /** 消耗全局技能能量（释放 1 格；不足返回 false） */
  spendEnergy(which) {
    const GS = CONFIG.GLOBAL_SKILL;
    const key = which === 'shuffle' ? 'shuffleEnergy' : 'freezeEnergy';
    if ((this[key] || 0) < GS.energyPerCell) return false;
    this[key] -= GS.energyPerCell;
    return true;
  }

  /** 真实路径：棋盘交换 → 按连锁步逐组结算（每步单独成组，供逐级连锁动画逐级 toast） */
  trySwap(r1, c1, r2, c2) {
    const ret = this.board.trySwap(r1, c1, r2, c2);
    if (!ret.ok) return { ok: false };
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
    this.gold += this._waveGold;
    // 战斗：敌人血量 vs 全塔 DPS（含协同）
    const enemyHp = CONFIG.ENEMY.hpBase * Math.pow(CONFIG.ENEMY.hpGrowth, this.wave - 1);
    const totalDps = this.effects.totalDps();
    const dealt = totalDps * CONFIG.WAVE.seconds;
    const leak = Math.max(0, enemyHp - dealt);
    if (!skipLeak) this.lineHp -= leak;
    // 协同检测（与模拟一致）
    this.effects.updateSynergies();
    if (this.firstSynergyWave === null && this.effects.synergyDone[0]) this.firstSynergyWave = this.wave;
    this.broken = this.lineHp <= 0 || this.wave >= 50;
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
    this.shuffleEnergy = 0; this.freezeEnergy = 0;  // v1.12 全局技能能量（点，每局清零）
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
