/**
 * effects.js —— 塔特效构筑与三选一逻辑（roguelike 核心，纯逻辑无渲染）
 * =====================================================================
 * 口径与 tools/sim_effects.py 完全对齐（机制 v6）：
 *   - 每塔特效池：全池 8 特效（CONFIG.EFFECT.poolP0=false；poolP0=true 时退化为前 5）
 *   - 特效等级：0=未激活；Lv1 激活入槽；Lv3 满级移出池
 *   - 每塔 3 激活槽（activeSlots）；候选每次 3 个（pickSize）
 *   - 首选保底：本 run 首次三选一候选必含标志特效（火=燃爆/毒=毒爆/冰=冰冻/电=连锁）
 *   - 目标加权：候选生成时目标特效权重 ×targetWeight（缓解槽满锁定）
 *   - 槽满可替换：抽到未激活特效且槽满 → 替换非目标特效（保留目标）
 *   - 待选可攒：pending 上限 pendingCap（跨波），波末逐次结算
 *   - 协同组：燃爆×毒爆、冰冻×电连锁；达成后 DPS ×(1+synergyBonus)
 *   - DPS = baseDps×grow^(L-1) × Π(1+bonusPerLv×ef.level) × 协同乘区
 *
 * UI 流程（波末）：
 *   const queue = manager.settlePending();   // [{tower, candidates: [3]}]
 *   queue 逐组弹层，玩家从 candidates 选中 ef 后：
 *   manager.applyChoice(group.tower, ef);    // 消费该组、扣 pending
 */
const CONFIG = require('./config.js');

/* 标志特效（协同目标）映射：塔 key → 目标特效名 */
const TARGET_OF = { fire: '燃爆', poison: '毒爆', ice: '冰冻', electric: '连锁', cannon: '溅射' };

/** 单塔特效构筑 */
class TowerBuild {
  constructor(key) {
    this.key = key;
    const tcfg = CONFIG.TOWERS[key];
    this.color = tcfg.color;
    this.baseDps = tcfg.baseDps;
    this.grow = tcfg.grow;
    // 特效池（全池 8 特效；poolP0=true 时退化为前 5）
    let names = (CONFIG.EFFECT_POOLS[key] || []).map((e) => e.name);
    if (CONFIG.EFFECT.poolP0) names = names.slice(0, CONFIG.EFFECT.p0PoolSize);
    this.pool = names.map((name) => ({ name, level: 0 }));
    this.level = 0;          // 塔等级：0=未获得
    this.exp = 0;
    this.pending = 0;        // 待选次数（波末结算）
    this.activeNames = [];   // 本 run 已激活特效
    this.firstPickDone = false;
  }

  get unlocked() { return this.level > 0; }

  expNeed() {
    return CONFIG.EXP.base * Math.pow(CONFIG.EXP.growth, this.level - 1);
  }

  /** 获得经验；升级时 +1 待选（封顶 pendingCap）。未获得塔不吸收经验。 */
  gainExp(v) {
    if (this.level === 0) return;
    this.exp += v;
    while (this.level < CONFIG.EXP.towerMaxLevel && this.exp >= this.expNeed()) {
      this.exp -= this.expNeed();
      this.level += 1;
      this.pending = Math.min(this.pending + 1, CONFIG.EFFECT.pendingCap);
    }
  }

  /** 解锁塔（先消先得，run 层调用） */
  unlock() {
    if (this.level === 0) this.level = 1;
  }

  /** 特效满级？ */
  _maxed(ef) { return ef.level >= CONFIG.EFFECT.maxLevel; }

  /** 候选池：未满级特效（SWAP_ON_FULL 关时槽满仅剩已激活可升） */
  _eligible() {
    const slotsFull = this.activeNames.length >= CONFIG.EFFECT.activeSlots;
    return this.pool.filter((ef) => {
      if (this._maxed(ef)) return false;
      if (CONFIG.EFFECT.swapOnFull) return true;
      return !slotsFull || ef.level > 0;
    });
  }

  /**
   * 生成三选一候选，返回候选特效对象数组（长度 ≤ pickSize）。
   * targeting=true（模拟/自动路径）：目标特效排首位（加权入池）；
   * targeting=false（UI 展示）：仅按规则生成，由玩家选择。
   */
  pickChoices(targeting) {
    const eligible = this._eligible();
    if (!eligible.length) return [];
    const target = TARGET_OF[this.key];
    const hasTarget = target && eligible.some((e) => e.name === target);

    // 首选保底：本 run 首次三选一候选必含标志特效
    if (CONFIG.EFFECT.firstPickGuarantee && !this.firstPickDone && hasTarget) {
      this.firstPickDone = true;
      const tgt = eligible.find((e) => e.name === target);
      const rest = eligible.filter((e) => e !== tgt);
      shuffle(rest);
      const cands = [tgt].concat(rest.slice(0, CONFIG.EFFECT.pickSize - 1));
      return targeting ? this._targetFirst(cands, tgt) : cands;
    }

    if (targeting && hasTarget) {
      // 加权抽样：目标占 targetWeight 份，抽取去重候选
      const weighted = [];
      eligible.forEach((e) => {
        const w = e.name === target ? CONFIG.EFFECT.targetWeight : 1;
        for (let i = 0; i < w; i++) weighted.push(e);
      });
      shuffle(weighted);
      const seen = new Set();
      const cands = [];
      for (const e of weighted) {
        if (!seen.has(e.name)) { seen.add(e.name); cands.push(e); }
        if (cands.length >= CONFIG.EFFECT.pickSize) break;
      }
      return this._targetFirst(cands, eligible.find((e) => e.name === target));
    }

    shuffle(eligible);
    return eligible.slice(0, CONFIG.EFFECT.pickSize);
  }

  /** targeting 时把目标特效排首位（模拟策略：总是选目标） */
  _targetFirst(cands, tgt) {
    if (!tgt || !cands.includes(tgt)) return cands;
    return [tgt].concat(cands.filter((e) => e !== tgt));
  }

  /**
   * 应用一次选择（玩家从 pickChoices/upgradeChoices 结果中选中一项）。
   * 同塔候选（池内引用）作用于本塔；跨塔候选（upgradeChoices 带 fromTower）作用于来源塔。
   * 未激活：占槽（槽满且 SWAP_ON_FULL → 替换非目标特效，保留目标）；
   * 已激活：升级，封顶 maxLevel。返回 {ok, replaced, leveled}。
   */
  applyChoice(ef) {
    if (!ef) return { ok: false };
    const host = (ef.fromTower && this._mgr) ? this._mgr.towers[ef.fromTower] : this;
    if (!host) return { ok: false };
    const poolEf = host.pool.find((e) => e.name === ef.name);
    if (!poolEf) return { ok: false };
    const res = { ok: true, replaced: false, leveled: false };
    if (poolEf.level === 0) {
      if (host.activeNames.length >= CONFIG.EFFECT.activeSlots && CONFIG.EFFECT.swapOnFull) {
        const target = TARGET_OF[host.key];
        let victim = host.activeNames.find((n) => n !== target);
        if (victim === undefined) victim = host.activeNames[0];
        host.activeNames.splice(host.activeNames.indexOf(victim), 1);
        const victimEf = host.pool.find((e) => e.name === victim);
        if (victimEf) victimEf.level = 0;
        res.replaced = true;
      }
      poolEf.level = 1;
      host.activeNames.push(poolEf.name);
    } else {
      poolEf.level = Math.min(poolEf.level + 1, CONFIG.EFFECT.maxLevel);
      res.leveled = true;
    }
    // 扣除触发升级塔（group.tower）的待升级次数
    this.pending = Math.max(0, this.pending - 1);
    return res;
  }

  /** 塔 DPS：等级成长（v1.8 可传入整体等级 baseLevel）× 已激活特效乘区 × 协同乘区 */
  dps(synergyDone, baseLevel) {
    if (this.level === 0) return 0;
    const lv = (baseLevel && baseLevel > 0) ? baseLevel : this.level;
    let d = this.baseDps * Math.pow(this.grow, lv - 1);
    this.pool.forEach((ef) => {
      if (ef.level > 0) d *= (1 + CONFIG.EFFECT.bonusPerLv * ef.level);
    });
    if (synergyDone) d *= (1 + CONFIG.EFFECT.synergyBonus);
    return d;
  }

  /** 某特效是否已激活（level>0） */
  hasActive(name) {
    const ef = this.pool.find((e) => e.name === name);
    return !!ef && ef.level > 0;
  }

  /** run 间重置构筑（塔等级/金币跨 run 保留） */
  resetRunBuild() {
    this.pool.forEach((ef) => { ef.level = 0; });
    this.activeNames = [];
    this.pending = 0;
    this.exp = 0;
    this.firstPickDone = false;
  }
}

/* ---------- 多塔统筹 ---------- */

class EffectManager {
  constructor() {
    this.towers = {};
    // P0 可玩塔池：排除 p1 占位塔（如炮塔），其颜色转为惩罚色（对齐模拟脚本 TOWERS）
    Object.keys(CONFIG.TOWERS).forEach((key) => {
      if (CONFIG.TOWERS[key].p1) return;
      this.towers[key] = new TowerBuild(key);
      this.towers[key]._mgr = this; // 跨塔候选（upgradeChoices）定位来源塔用
    });
    this.synergyDone = CONFIG.SYNERGIES.map(() => false);
  }

  tower(key) { return this.towers[key]; }

  /**
   * 波末结算：按塔序为每个 pending 生成一组三选一，返回完整队列：
   *   [{ tower: key, candidates: [ef...] }]
   * 生成时已消耗候选随机性与首选保底位；UI 逐组弹层，选中后
   * applyChoice(group.tower, group.candidates[i]) 消费。
   */
  settlePending() {
    const queue = [];
    Object.keys(this.towers).forEach((key) => {
      const t = this.towers[key];
      const total = t.pending;              // 按待选次数生成，生成过程不扣减（由 applyChoice 扣）
      for (let i = 0; i < total; i++) {
        const cands = t.pickChoices(false);
        if (!cands.length) { t.pending = 0; break; }
        queue.push({ tower: key, candidates: cands, target: TARGET_OF[key] || null });
      }
    });
    return queue;
  }

  /**
   * 波末结算（自动/模拟路径）：targeting=true，逐次生成候选并选目标特效，
   * 直到全部 pending 清空。返回 {picks, replaced, leveled}。
   */
  settleAuto() {
    const detail = { picks: 0, replaced: 0, leveled: 0 };
    Object.keys(this.towers).forEach((key) => {
      const t = this.towers[key];
      while (t.pending > 0) {
        const cands = t.pickChoices(true);
        if (!cands.length) { t.pending = 0; break; }
        const res = t.applyChoice(cands[0]);
        detail.picks++;
        if (res.replaced) detail.replaced++;
        if (res.leveled) detail.leveled++;
      }
    });
    this.updateSynergies();
    return detail;
  }

  /** 玩家确认三选一（UI 路径）：消费 settlePending 队列中的候选对象 */
  applyChoice(towerKey, ef) {
    const t = this.towers[towerKey];
    if (!t) return { ok: false };
    const res = t.applyChoice(ef);
    if (res.ok) this.updateSynergies();
    return res;
  }

  /**
   * 升级三选一候选：跨塔随机——从所有已拥有塔（ownedKeys）的未满级技能中随机 pickSize 个。
   * 返回 [{...ef, fromTower}]（展开对象；applyChoice 按 fromTower 定位真实池内引用升级）。
   */
  upgradeChoices(ownedKeys) {
    const cands = [];
    ownedKeys.forEach((k) => {
      const t = this.towers[k];
      if (!t || t.level === 0) return;
      t.pool.forEach((ef) => {
        if (ef.level < CONFIG.EFFECT.maxLevel) cands.push(Object.assign({}, ef, { fromTower: k }));
      });
    });
    shuffle(cands);
    return cands.slice(0, CONFIG.EFFECT.pickSize);
  }

  /** 生成升级三选一队列：按塔序，每 pending 一组（跨塔候选） */
  buildUpgradeQueue(ownedKeys) {
    const queue = [];
    ownedKeys.forEach((k) => {
      const t = this.towers[k];
      if (!t) return;
      const total = t.pending;
      for (let i = 0; i < total; i++) {
        const cands = this.upgradeChoices(ownedKeys);
        if (!cands.length) { t.pending = 0; break; }
        queue.push({ tower: k, candidates: cands, target: null });
      }
    });
    return queue;
  }

  /** 全部待升级次数（各塔 pending 之和） */
  pendingTotal() {
    let n = 0;
    Object.keys(this.towers).forEach((k) => { n += this.towers[k].pending; });
    return n;
  }

  /** 协同组展开为 [k1,e1,k2,e2]（config 为 {a,b} 对象结构） */
  _synPairs() {    return CONFIG.SYNERGIES.map((s) => [s.a.tower, s.a.effect, s.b.tower, s.b.effect]);
  }

  /** 协同检测：燃爆×毒爆、冰冻×电连锁 */
  updateSynergies() {
    this._synPairs().forEach(([k1, e1, k2, e2], i) => {
      const t1 = this.towers[k1], t2 = this.towers[k2];
      if (t1 && t2 && t1.hasActive(e1) && t2.hasActive(e2)) this.synergyDone[i] = true;
    });
  }

  /** 当前协同状态：[{pair, done}] */
  synergyStatus() {
    return this._synPairs().map((pair, i) => ({ pair, done: this.synergyDone[i] }));
  }

  /** 单塔 DPS（v1.8：按整体等级成长；含协同乘区；与模拟一致以第一协同组为基准） */
  towerDps(key) {
    const t = this.towers[key];
    if (!t) return 0;
    const lv = (this.run && this.run.expLevel !== undefined) ? Math.max(1, this.run.expLevel) : t.level;
    return t.dps(this.synergyDone[0], lv);
  }

  /** 全塔总 DPS（防线结算用） */
  totalDps() {
    return Object.keys(this.towers).reduce((s, k) => s + this.towerDps(k), 0);
  }
}

/* ---------- 工具 ---------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

module.exports = { EffectManager, TowerBuild, TARGET_OF };
