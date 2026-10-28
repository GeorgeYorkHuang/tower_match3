/**
 * effects.js —— 塔特效构筑与三选一逻辑（roguelike 核心，纯逻辑无渲染）
 * =====================================================================
 * 口径与 tools/sim_effects.py 对齐（机制 v7 / v1.11）：
 *   - 每塔特效池：全池 8 特效（镖塔归一：砍「双镖」「范围回旋」）
 *   - 特效结构：{ name, branches: { A, B, C } }，分支等级 0-3；
 *     level 派生 = max(分支等级)（激活判定 + 战斗数值读取，兼容 combat.lv()）
 *   - 每塔 3 激活槽（activeSlots）；候选每次 3 个（pickSize）
 *   - 三选一候选跨塔统一技能池（v1.16.28b）：所有已激活塔的技能卡/分支卡摊平进一个大池
 *     随机抽 3 张（无塔配额，可同塔多张；仅 1 座激活塔时自然单塔选）；
 *     卡分两级（v1.11）：技能卡（未激活技能，type='skill'）——选中=激活（默认分支 A Lv1）；
 *     分支卡（已激活技能的未满分支，type='branch'）——选中=该分支 Lv+1
 *     先选技能；技能激活后，后续升级才会出现分支（分支继续升级，封顶 3）
 *   - 首选保底：本 run 首次三选一候选必含标志特效（火=爆燃/毒=毒爆/冰=冰冻/电=连锁）
 *   - 目标加权：targeting 时目标特效权重 ×targetWeight
 *   - 槽满可替换：抽到未激活技能且槽满 → 替换非目标特效（保留目标）
 *   - 待选可攒：pending 上限 pendingCap（跨波），波末逐次结算
 *   - 协同组：冰冻×电连锁、重炮×大火球；达成后 DPS ×(1+synergyBonus)
 *   - DPS = (baseDps + perLv×(L-1)) × Π(1+bonusPerLv×ef.level) × 协同乘区（v1.17 线性化）
 */
const CONFIG = require('./config.js');

/* 标志特效（协同目标）映射：塔 key → 目标特效名 */
const TARGET_OF = { fire: '爆燃', poison: '毒爆', ice: '冰冻', electric: '连锁', cannon: '溅射' };
const BRANCH_KEYS = ['A', 'B', 'C'];

/** 单塔特效构筑 */
class TowerBuild {
  constructor(key) {
    this.key = key;
    const tcfg = CONFIG.TOWERS[key];
    this.color = tcfg.color;
    this.baseDps = tcfg.baseDps;
    this.perLv = tcfg.perLv;               // v1.17 线性成长：DPS = baseDps + perLv×(L-1)
    // 特效池（全池 8 特效；poolP0=true 时退化为前 5）
    let names = (CONFIG.EFFECT_POOLS[key] || []).map((e) => e.name);
    if (CONFIG.EFFECT.poolP0) names = names.slice(0, CONFIG.EFFECT.p0PoolSize);
    this.pool = names.map((name) => {
      const ef = { name, branches: { A: 0, B: 0, C: 0 }, act: false };
      // v1.16.5 技能等级口径：激活即 Lv1（分支未选=0）；每升一级分支 +1 → 技能 Lv2/3/4（满级 4 = LvMAX）
      // level 派生：act ? 1 + max(分支) : 0（激活判定、DPS 乘区统一用此口径）
      Object.defineProperty(ef, 'level', {
        get() { return ef.act ? 1 + Math.max(ef.branches.A, ef.branches.B, ef.branches.C) : 0; },
      });
      return ef;
    });
    this.picked = new Set();   // v1.11：经三选一获取/升级的技能名（详情弹层仅展示这些；默认技能不在此列）
    this.energy = 0;           // v1.16.77 能量：三消供能，普攻每次耗 0.5；上限 energyMax，得塔时给 startEnergy
    this.level = 0;          // 塔等级：0=未获得
    this.exp = 0;
    this.pending = 0;        // 待选次数（波末结算）
    this.activeNames = [];   // 本 run 已激活特效
    this.firstPickDone = false;
  }

  get unlocked() { return this.level > 0; }

  expNeed() {
    // v1.16.17 塔级成长进度 = 已做选择（level-1）+ 待选（pending）；等级=选择次数+1
    const prog = (this.level - 1) + this.pending;
    return CONFIG.EXP.base * Math.pow(CONFIG.EXP.growth, Math.max(0, prog));
  }

  /** 获得经验；升级产出 1 次选择机会（v1.16.17 塔等级 = 该塔累计选择次数 + 1，经验不直接涨级）。未获得塔不吸收经验。
   *  正式游戏经验统一入整体池（run.gainExp），此塔级方法为兜底/测试路径。 */
  gainExp(v) {
    if (this.level === 0) return;
    this.exp += v;
    // 机会上限 = 剩余选择额度：已做（level-1）+ 待选（pending）< towerMaxLevel-1（建塔基数占 1 级）
    while ((this.level - 1) + this.pending < CONFIG.EXP.towerMaxLevel - 1 && this.exp >= this.expNeed()) {
      this.exp -= this.expNeed();
      this.pending += 1;
    }
  }

  /** 解锁塔（先消先得，run 层调用）；得塔时补初始能量。建塔（0→Lv1）不赠选择机会 */
  unlock() {
    if (this.level === 0) {
      this.level = 1;
      this.energy = CONFIG.GLOBAL_SKILL.startEnergy;
    }
  }

  /** 特效满级？（分支维度判定：任一分支达 maxLevel 即满，v1.16.5 对齐 1+分支 口径） */
  _maxed(ef) { return Math.max(ef.branches.A, ef.branches.B, ef.branches.C) >= CONFIG.EFFECT.maxLevel; }

  /** 该技能是否已激活（任一分支 > 0） */
  _activated(ef) { return ef.level > 0; }

  /** 技能配置（icon/color/desc/分支文案） */
  cfgOf(name) { return (CONFIG.EFFECT_POOLS[this.key] || []).find((e) => e.name === name) || {}; }

  /**
   * 生成该塔的两级三选一候选（v1.11 + v1.13.4）：
   *   · 未激活技能 → 技能卡（type='skill'；槽满后不再刷新未激活技能，只升级已有技能）
   *   · 已激活技能 → 最多 1 张分支卡（type='branch'，取等级最低的未满分支——同一技能每轮升级只能选一个）
   * 返回 [{name, icon, color, desc, type, branch?, branchLv?, fromTower, level}]。
   */
  _choices() {
    const cands = [];
    const slotsFull = this.activeNames.length >= CONFIG.EFFECT.activeSlots;
    this.pool.forEach((ef) => {
      const cfg = this.cfgOf(ef.name);
      if (!this._activated(ef)) {
        // v1.13.4：槽满 3 技能后不再刷新未激活技能
        if (!slotsFull) {
          cands.push({
            name: ef.name, icon: cfg.icon, color: cfg.color, desc: cfg.pick || cfg.desc || '',
            type: 'skill', fromTower: this.key, level: 0,
          });
        }
      } else {
        // v1.13.5 分支锁定：技能任一分支升级后，其余两个分支移出抽卡池（后续只升级已选分支）
        // v1.17.9c 分支三选一：尚无分支升级 → A/B/C 三分支各出一张卡，由三选一真正决定方向（不再恒为 A）
        const raised = BRANCH_KEYS.filter((br) => ef.branches[br] > 0);
        if (raised.length) {
          // 已定路线：只出锁定分支的升级卡
          const br = raised.find((b) => ef.branches[b] < CONFIG.EFFECT.maxLevel);
          if (br !== undefined) {
            const brk = br.toLowerCase();
            cands.push({
              name: ef.name, icon: cfg.icon, color: cfg.color,
              desc: tierText(cfg[brk + 'p'], ef.branches[br]) || cfg[brk] || cfg.desc || '',
              type: 'branch', branch: br, branchLv: ef.branches[br],
              fromTower: this.key, level: ef.level,
            });
          }
        } else {
          // 未定路线：A/B/C 全量供给（每分支一张），三选一选中的即确认方向
          for (const br of BRANCH_KEYS) {
            const brk = br.toLowerCase();
            cands.push({
              name: ef.name, icon: cfg.icon, color: cfg.color,
              desc: tierText(cfg[brk + 'p'], 0) || cfg[brk] || cfg.desc || '',
              type: 'branch', branch: br, branchLv: 0,
              fromTower: this.key, level: ef.level,
            });
          }
        }
      }
    });
    return cands;
  }

  /**
   * 生成三选一候选，返回候选对象数组（长度 ≤ pickSize）。
   * targeting=true（模拟/自动路径）：目标特效（未激活技能卡）排首位；
   * targeting=false（UI 展示）：仅按规则生成，由玩家选择。
   */
  pickChoices(targeting) {
    const eligible = this._choices();
    if (!eligible.length) return [];
    const target = TARGET_OF[this.key];
    const isTgtSkill = (e) => e.type === 'skill' && e.name === target;
    const isTgtBranch = (e) => e.type === 'branch' && e.name === target;
    const tgtSkill = eligible.find(isTgtSkill);
    // 目标分支：三分支候选中随机取一张（v1.17.9c 分支三选一展开后均匀随机，避免模拟路径死磕 A）
    const tgtBranchList = eligible.filter(isTgtBranch);
    const tgtBranch = tgtBranchList.length ? tgtBranchList[Math.floor(this.rng() * tgtBranchList.length)] : null;
    const tgtCand = tgtSkill || tgtBranch;   // 目标候选：未激活→技能卡；已激活→未满分支卡

    // 首选保底：本 run 首次三选一候选必含标志特效（技能卡，未激活时）
    if (CONFIG.EFFECT.firstPickGuarantee && !this.firstPickDone && tgtSkill) {
      this.firstPickDone = true;
      const rest = eligible.filter((e) => e !== tgtSkill);
      shuffle(rest, this.rng);
      const cands = [tgtSkill].concat(rest.slice(0, CONFIG.EFFECT.pickSize - 1));
      return targeting ? this._targetFirst(cands, tgtSkill) : cands;
    }

    if (targeting && tgtCand) {
      // 模拟/自动路径：目标（技能卡或分支卡）强制入列并置首位，其余补足至 pickSize（保证“总是选目标”策略 100% 生效）
      const rest = eligible.filter((e) => e !== tgtCand);
      shuffle(rest, this.rng);
      const cands = [tgtCand].concat(rest.slice(0, CONFIG.EFFECT.pickSize - 1));
      return this._targetFirst(cands, tgtCand);
    }

    shuffle(eligible, this.rng);
    return eligible.slice(0, CONFIG.EFFECT.pickSize);
  }

  /** targeting 时把目标特效排首位（模拟策略：总是选目标） */
  _targetFirst(cands, tgt) {
    if (!tgt || !cands.includes(tgt)) return cands;
    return [tgt].concat(cands.filter((e) => e !== tgt));
  }

  /**
   * 应用一次选择（玩家从候选组中选中一项）。
   * v1.16.28 候选为跨塔随机：选中哪张卡就作用于哪座塔（fromTower）并涨 1 级。
   * 技能卡（未激活）：激活（默认分支 A Lv1；槽满且 SWAP_ON_FULL → 替换非目标特效）；
   * 分支卡（已激活技能未满分支）：该分支 Lv+1（封顶 maxLevel）。
   * 返回 {ok, activated, replaced, leveled}。
   */
  applyChoice(ef) {
    if (!ef) return { ok: false };
    const host = (ef.fromTower && this._mgr) ? this._mgr.towers[ef.fromTower] : this;
    if (!host) return { ok: false };
    const poolEf = host.pool.find((e) => e.name === ef.name);
    if (!poolEf) return { ok: false };
    const res = { ok: true, activated: false, replaced: false, leveled: false };
    if (ef.type === 'branch') {
      // 分支卡：仅对已激活技能生效，该分支 +1
      if (!host._activated(poolEf)) return { ok: false };
      const br = ef.branch;
      if (!BRANCH_KEYS.includes(br)) return { ok: false };
      poolEf.branches[br] = Math.min(poolEf.branches[br] + 1, CONFIG.EFFECT.maxLevel);
      host.picked.add(poolEf.name);   // 分支升级 = 三选一获取（详情展示）
      res.leveled = true;
    } else {
      // 技能卡：激活（防御：若已激活则按分支 A 升级）
      if (host._activated(poolEf)) {
        poolEf.branches.A = Math.min(poolEf.branches.A + 1, CONFIG.EFFECT.maxLevel);
        host.picked.add(poolEf.name);
        res.leveled = true;
      } else if (host.activeNames.length >= CONFIG.EFFECT.activeSlots) {
        // v1.13.4：槽满 3 技能后不允许再激活新技能（候选已排除；防御拒绝超槽）
        return { ok: false };
      } else {
        // v1.16.5 技能卡激活：只标记激活、不锁定分支（分支保持 0，技能 Lv1；第一次分支升级才是「选分支」）
        poolEf.act = true;
        if (!host.activeNames.includes(poolEf.name)) host.activeNames.push(poolEf.name);
        host.picked.add(poolEf.name);
        res.activated = true;
      }
    }
    // v1.16.38 跨塔三选一扣减修正：待选机会（pending）属于触发升级的塔（this = towers[queue.tower]），
    // 选中候选后扣除触发塔的待选次数（旧实现按候选首张来源塔扣，跨塔时被跳过塔的 pending 残留 → 一次升级反复弹三选一）；
    // 成长归属选中候选来源塔 host（等级 = 累计选择次数 + 1，v1.16.17）
    this.pending = Math.max(0, this.pending - 1);
    host.level = Math.min(host.level + 1, CONFIG.EXP.towerMaxLevel);
    return res;
  }

  /** 塔 DPS：等级成长（v1.8 可传入整体等级 baseLevel）× 已激活特效乘区 × 协同乘区
   *  v1.16.5：战斗乘区按数值口径 max(1, 分支档)（与原版激活即 1 档一致）；显示口径 1+分支 见 level getter */
  dps(synergyDone, baseLevel) {
    if (this.level === 0) return 0;
    const lv = (baseLevel && baseLevel > 0) ? baseLevel : this.level;
    let d = this.baseDps + this.perLv * (lv - 1);   // v1.17 线性成长（替代原 grow 乘法）
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

  /** 技能分支等级（A/B/C；0=未升级） */
  branchLv(name, br) {
    const ef = this.pool.find((e) => e.name === name);
    return ef && BRANCH_KEYS.includes(br) ? (ef.branches[br] || 0) : 0;
  }

  /** 技能总等级（最高分支等级；0=未激活） */
  skillLv(name) {
    const ef = this.pool.find((e) => e.name === name);
    return ef ? ef.level : 0;
  }

  /** run 间重置构筑（塔等级/金币跨 run 保留；v1.16.17 塔等级 = 选择次数+1，重开局技能清零等级回建塔基数） */
  resetRunBuild() {
    this.pool.forEach((ef) => { ef.branches.A = 0; ef.branches.B = 0; ef.branches.C = 0; ef.act = false; });
    this.activeNames = [];
    this.picked = new Set();
    this.pending = 0;
    this.exp = 0;
    this.energy = 0;
    this.firstPickDone = false;
    this.level = this.level > 0 ? 1 : 0;   // 保留拥有状态，等级回建塔基数（选择清零）
  }
}

/* ---------- 多塔统筹 ---------- */

class EffectManager {
  constructor(opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;  // 模拟路径注入 seeded rng（候选 shuffle 确定性）
    this.towers = {};
    this._firstAnyDone = false;          // v1.16.28 跨塔三选一：本 run 首次候选是否已含标志特效
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
   * 跨塔统一技能池三选一（v1.16.28b 用户口径）：把所有已激活塔的候选卡（每塔 _choices()：
   * 未激活技能→技能卡 + 已激活技能→未满分支卡；槽满塔未激活技能已被过滤）摊平成一个大池，
   * 随机抽 pickSize 张 —— 无塔配额，同一轮可出同一塔多张卡；仅激活 1 座塔时天然单塔选。
   * 返回 { tower, cands, target } 或 null（无候选塔）。
   * target = 组内标志特效名（首选保底：本 run 首次三选一必含任一塔的标志特效卡）。
   */
  _buildGroup(poolKeys) {
    const pickSize = CONFIG.EFFECT.pickSize;
    const pool = [];
    (poolKeys || Object.keys(this.towers)).forEach((key) => {
      const t = this.towers[key];
      if (t && t.level > 0) {
        t._choices().forEach((ef) => pool.push(ef));
      }
    });
    if (!pool.length) return null;
    shuffle(pool, this.rng);
    const cands = pool.slice(0, pickSize);
    // 首选保底：组内替换一张为标志特效卡（若尚未达成）
    if (CONFIG.EFFECT.firstPickGuarantee && !this._firstAnyDone) {
      const hasTgt = cands.some((c) => TARGET_OF[c.fromTower] === c.name);
      if (!hasTgt) {
        const tgtPool = pool.filter((c) => TARGET_OF[c.fromTower] === c.name);
        if (tgtPool.length) {
          cands[Math.floor(this.rng() * cands.length)] = tgtPool[Math.floor(this.rng() * tgtPool.length)];
        }
      }
      this._firstAnyDone = true;
    }
    const tgt = cands.find((c) => TARGET_OF[c.fromTower] === c.name);
    return { tower: cands[0].fromTower, cands, target: (tgt && tgt.name) || null };
  }

  /**
   * 波末结算：为所有已激活塔（level>0）的 pending 生成三选一队列，返回：
   *   [{ tower: key, candidates: [ef...] }]
   * v1.16.28：每组 3 张候选分别来自随机 3 座已激活塔（跨塔三选一）；组数 = Σpending；
   * 选中后 applyChoice 按候选 fromTower 扣对应塔 pending。
   */
  settlePending() {
    const queue = [];
    const slots = [];
    Object.keys(this.towers).forEach((key) => {
      const t = this.towers[key];
      if (t.level <= 0 || t.pending <= 0) return;   // 只出已激活塔
      for (let i = 0; i < t.pending; i++) slots.push(key);
    });
    shuffle(slots, this.rng);                        // 槽级随机：跨塔交错
    slots.forEach((slotKey) => {
      const g = this._buildGroup();
      if (!g) { Object.keys(this.towers).forEach((k) => { this.towers[k].pending = 0; }); return; }
      // v1.16.38 queue.tower = 触发塔（持有该 pending 的塔），选中后据此扣除；候选来自全池（可跨塔）
      queue.push({ tower: slotKey, candidates: g.cands, target: g.target });
    });
    return queue;
  }

  /**
   * 波末结算（自动/模拟路径）：targeting=true，逐次生成候选并选目标特效，
   * 直到全部 pending 清空。返回 {picks, activated, replaced, leveled}。
   */
  settleAuto() {
    const detail = { picks: 0, activated: 0, replaced: 0, leveled: 0 };
    Object.keys(this.towers).forEach((key) => {
      const t = this.towers[key];
      while (t.pending > 0) {
        const cands = t.pickChoices(true);
        if (!cands.length) { t.pending = 0; break; }
        const res = t.applyChoice(cands[0]);
        detail.picks++;
        if (res.activated) detail.activated++;
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
   * 生成升级三选一队列：每组 3 张候选分别来自随机 3 座已激活塔（v1.16.28 跨塔三选一；
   * ownedKeys 限制塔池为出战塔，level>0 过滤未拥有塔）。
   */
  buildUpgradeQueue(ownedKeys) {
    const queue = [];
    const slots = [];
    (ownedKeys || Object.keys(this.towers)).forEach((k) => {
      const t = this.towers[k];
      if (!t || t.level <= 0 || t.pending <= 0) return;
      for (let i = 0; i < t.pending; i++) slots.push(k);
    });
    shuffle(slots, this.rng);
    slots.forEach((slotKey) => {
      const g = this._buildGroup(ownedKeys);
      if (!g) { (ownedKeys || Object.keys(this.towers)).forEach((k) => { if (this.towers[k]) this.towers[k].pending = 0; }); return; }
      // v1.16.38 queue.tower = 触发塔（持有该 pending 的塔），选中后据此扣除；候选来自全池（可跨塔）
      queue.push({ tower: slotKey, candidates: g.cands, target: null });
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

  /** 协同检测：爆燃×毒爆、冰冻×电连锁；测试战场（_activeKeys 非空）只检测出战塔 */
  updateSynergies() {
    const a = this._activeKeys;
    const ok = (k) => !a || !a.length || a.includes(k);
    this._synPairs().forEach(([k1, e1, k2, e2], i) => {
      const t1 = this.towers[k1], t2 = this.towers[k2];
      if (t1 && t2 && ok(k1) && ok(k2) && t1.hasActive(e1) && t2.hasActive(e2)) this.synergyDone[i] = true;
    });
  }

  /** 生效塔集合（v1.16.4）：测试战场切塔后只有出战塔生效；keys=null/[] 表示全部生效 */
  setActiveKeys(keys) {
    this._activeKeys = keys || null;
    this.updateSynergies();
  }

  /** 当前协同状态：[{pair, done}] */
  synergyStatus() {
    return this._synPairs().map((pair, i) => ({ pair, done: this.synergyDone[i] }));
  }

  /** 单塔 DPS（v1.16.55：按塔自身等级成长，不再随整体等级；含协同乘区；与模拟一致以第一协同组为基准） */
  towerDps(key) {
    const t = this.towers[key];
    if (!t) return 0;
    return t.dps(this.synergyDone[0], t.level);
  }

  /** 全塔总 DPS（防线结算用） */
  totalDps() {
    return Object.keys(this.towers).reduce((s, k) => s + this.towerDps(k), 0);
  }
}

/* ---------- 工具 ---------- */

/** 三档文案按分支等级取档（v1.16.47）：ap/bp/cp 为 [Lv1→2, Lv2→3, Lv3→4] 数组；
 *  lv = 分支当前等级（0→取 Lv1→2 档、1→Lv2→3 档、2→Lv3→4 档，封顶最后一档）；非数组原样返回 */
function tierText(v, lv) {
  if (Array.isArray(v)) return v[Math.min(Math.max(0, lv || 0), v.length - 1)] || '';
  return v || '';
}

function shuffle(arr, rng) {
  const rand = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

module.exports = { EffectManager, TowerBuild, TARGET_OF };
