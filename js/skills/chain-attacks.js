/**
 * 连消全格弹道 · 纯数据模块（v1 · W 交付）
 *
 * 已拍板规则（owner 2026-10-30）：
 *   1) 新弹道**替换**旧连消额外攻击（不再调用 spawnChainShots 那一套）；
 *   2) 基础消除的**经验与充能保持原样**（本模块不碰 exp / energy / ammo）；
 *   3) 同一格同一步最多发射一次；同格在后续另一步重新出现可再次发射。
 *
 * 职责边界：
 *   - 输入：每级连锁消除的**消除前快照**（board.resolve 的 stepList[i].clearedDetails：[{r,c,color}]，可选 matches 用于识别彩虹）；
 *   - 输出：弹道描述（坐标/颜色/塔/类型）+ 每步统计；
 *   - 不持有 Run/Combat，不扣血、不发奖、不读当前棋盘、不调用随机数。
 *
 * 接线契约（由 owner 在 Run 侧调用）：
 *   const ChainAttacks = require('../skills/chain-attacks.js');
 *   const plan = ChainAttacks.plan({
 *     steps: ret.resolved.stepList,              // 直接传 stepList
 *     startGroup: this.gsState.chainstorm ? 2 : undefined,   // 不传则用现行阈值 4
 *     towerOfColor: (color) => CONFIG.COLORS[color] && CONFIG.COLORS[color].tower,
 *     activeTowers: this.slotOrder,               // 已出战塔；不传视为全部出战
 *     layout: { cols: L.cols, cell: L.size, originY: this.boardY },
 *   });
 *   // 逐级动画阶段发射（不要在一次 trySwap 里全部同帧飞出）：
 *   for (const shot of plan.shotsByStep[stageIndex]) this.combat.spawnChainShot(shot);
 *
 * 注意：Run._chainBonus 的「attack」分支应整体删除（含未出战塔的充能回退？不——充能回退保留在 Run 侧，
 * 由 plan.shots 里 kind==='charge' 的条目驱动，保证「颜色塔未出战 → 充能全局技」这一旧行为不丢）。
 */
'use strict';

const CONFIG = require('../config.js');

const TOWER_KEYS = ['fire', 'ice', 'poison', 'electric', 'cannon', 'boomerang'];

/** 现行阈值（CONFIG.MATCH_SKILL.chainStart 的默认值），不夹带改门槛 */
const DEFAULT_START_GROUP = (CONFIG.MATCH_SKILL && CONFIG.MATCH_SKILL.chainStart) || 4;

const DEFAULT_LAYOUT = (() => {
  const L = CONFIG.LAYOUT.boardCell;
  return {
    cols: L.cols,
    cell: L.size,
    // 与 run.js / render.js 同源：棋盘水平居中
    originX: Math.round((750 - L.cols * L.size) / 2),
    originY: 1089,
  };
})();

const DEFAULT_POLICY = {
  rainbow: 'skip',          // 'skip' | 'neutral'：彩虹无色格默认不发（不能默认成红塔）
  inactiveColor: 'charge',  // 'charge' | 'neutral' | 'skip'：未出战颜色塔 → 保留旧充能回退
  unknownColor: 'charge',   // 颜色查不到塔时同上
  maxShotsPerStep: 120,     // 视觉预算：超出只打标记，**不丢弃**（真实伤害不能静默丢）
};

/** 未出战 / 未知颜色的处理策略 → 描述符 kind */
function kindOfPolicy(policy) {
  if (policy === 'skip') return 'skip';
  if (policy === 'neutral') return 'neutral';
  return 'charge';
}

function noop() {}

/**
 * 主入口：把消除快照转成弹道计划。
 * @param {Object} input
 * @param {Array}  input.steps          stepList 形态：[{ clearedDetails:[{r,c,color}], matches?:[{cells,rainbow}] }]
 * @param {number} [input.startGroup]   第几组起算连消（默认 4）
 * @param {Function} [input.towerOfColor] color → 塔 key
 * @param {Array}  [input.activeTowers] 已出战塔 key 列表（null=全部出战）
 * @param {Object} [input.layout]       { cols, cell, originX, originY }
 * @param {Object} [input.policy]       覆盖 DEFAULT_POLICY
 * @returns {{
 *   shots: Array, shotsByStep: Array<Array>, perStep: Array, overflowBatches: Array,
 *   stats: Object, invariants: Object
 * }}
 */
function plan(input) {
  input = input || {};
  const steps = Array.isArray(input.steps) ? input.steps : [];
  const startGroup = Number.isFinite(input.startGroup) ? input.startGroup : DEFAULT_START_GROUP;
  const layout = Object.assign({}, DEFAULT_LAYOUT, input.layout || {});
  // 只换棋盘尺寸/格子大小但没给 originX 时，按"水平居中"重新推导（与 run/render 同口径）
  if (input.layout && input.layout.originX == null) {
    layout.originX = Math.round((750 - layout.cols * layout.cell) / 2);
  }
  const policy = Object.assign({}, DEFAULT_POLICY, input.policy || {});
  const towerOfColor = typeof input.towerOfColor === 'function'
    ? input.towerOfColor
    : (color) => (CONFIG.COLORS[color] && CONFIG.COLORS[color].tower) || null;
  const active = Array.isArray(input.activeTowers) ? input.activeTowers : null;
  const isActive = (tk) => (active ? active.indexOf(tk) >= 0 : true);

  const shots = [];
  const shotsByStep = [];
  const perStep = [];
  const overflowBatches = [];
  const stats = { steps: 0, cleared: 0, emitted: 0, duplicate: 0, skippedRainbow: 0, neutral: 0, charge: 0, overflow: 0, missingColor: 0};

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si] || {};
    const groupNo = si + 1;
    const stageShots = [];
    shotsByStep.push(stageShots);
    if (groupNo < startGroup) { continue; }

    stats.steps++;
    const records = collectRecords(step);
    stats.cleared += records.length;

    const seen = new Set();
    const rainbowCells = rainbowCellSet(step);
    let emittedThisStep = 0;

    for (const rec of records) {
      const key = rec.r + ',' + rec.c;
      if (seen.has(key)) { stats.duplicate++; continue; }   // 同步内去重：匹配组 ∩ 爆炸波及
      seen.add(key);

      const isRainbow = rec.rainbow === true || rainbowCells.has(key);
      let color = rec.color || null;
      if (!color) stats.missingColor++;

      let kind;
      let towerKey = null;

      if (isRainbow) {
        // 彩虹自身无颜色：显式按策略处理，绝不默认成红塔
        if (policy.rainbow === 'skip') { stats.skippedRainbow++; continue; }
        kind = 'neutral';
      } else if (!color) {
        kind = kindOfPolicy(policy.unknownColor);
      } else {
        towerKey = towerOfColor(color) || null;
        if (!towerKey) kind = kindOfPolicy(policy.unknownColor);
        else if (!isActive(towerKey)) kind = kindOfPolicy(policy.inactiveColor);
        else kind = 'tower';
      }

      if (kind === 'skip') { stats.skippedRainbow++; continue; }

      const overflow = emittedThisStep >= policy.maxShotsPerStep;
      if (overflow) stats.overflow++;
      if (kind === 'neutral') stats.neutral++;
      if (kind === 'charge') stats.charge++;

      const shot = {
        seq: shots.length,
        group: groupNo,
        stepIndex: si,
        row: rec.r,
        col: rec.c,
        x: layout.originX + rec.c * layout.cell + layout.cell / 2,
        y: layout.originY + rec.r * layout.cell + layout.cell / 2,
        color: isRainbow ? null : color,
        towerKey: kind === 'tower' ? towerKey : null,
        kind,                                          // 'tower' 真实弹道 / 'charge' 充能回退 / 'neutral' 通用表现弹
        neutral: kind === 'neutral',
        rainbow: isRainbow,
        overflow,                                      // true = 超出视觉预算，仍需结算（可聚合成一次齐射表现）
      };
      shots.push(shot);
      stageShots.push(shot);
      emittedThisStep++;
    }

    if (emittedThisStep > policy.maxShotsPerStep) {
      overflowBatches.push({ stepIndex: si, group: groupNo, count: emittedThisStep - policy.maxShotsPerStep });
    }
    perStep.push({
      stepIndex: si,
      group: groupNo,
      cleared: records.length,
      emitted: stageShots.length,
      duplicate: records.length - seen.size,
      overflow: Math.max(0, emittedThisStep - policy.maxShotsPerStep),
    });
  }

  stats.emitted = shots.length;

  return {
    shots,
    shotsByStep,
    perStep,
    overflowBatches,
    stats,
    // 给 owner 接线时可直接读的契约锁（测试会校验，防止后续误改口径）
    invariants: {
      replacesLegacyChainAttack: true,   // 新弹道替换 spawnChainShots 那套旧连消攻击
      keepsExp: true,                    // 基础消除经验保持原样（本模块不产出经验）
      keepsCharge: true,                 // 基础充能保持原样（本模块不产出充能）
      dedupePerStep: true,               // 同一步同格至多一次
      crossStepRefire: true,             // 同格在后续步骤可再次发射
      rngFree: true,                     // 不消耗逻辑随机数
      damageAtHitOnly: true,             // 仅命中时结算（本模块只描述弹道）
    },
    startGroup,
    policy,
    layout,
  };
}

/** 取该步的清除记录（优先用消除前快照 clearedDetails；兜底从 matches 展开）
 *  输出统一按 (row, col) 排序：与棋盘遍历序一致，保证不同调用方传入顺序不同也得到同一份弹道序列 */
function collectRecords(step) {
  if (Array.isArray(step.clearedDetails) && step.clearedDetails.length) {
    return step.clearedDetails.map((d) => ({
      r: d.r,
      c: d.c,
      color: d.color || null,
      rainbow: d.rainbow === true || d._rainbow === true,
    })).sort((a, b) => (a.r - b.r) || (a.c - b.c));
  }
  const out = [];
  const matches = Array.isArray(step.matches) ? step.matches : [];
  for (const m of matches) {
    const cells = Array.isArray(m.cells) ? m.cells : [];
    for (const cell of cells) out.push({ r: cell[0], c: cell[1], color: m.color || null, rainbow: m.rainbow === true });
  }
  return out.sort((a, b) => (a.r - b.r) || (a.c - b.c));
}

/** 彩虹格集合（来自 matches 的 rainbow 组；用于识别彩虹自身无色格） */
function rainbowCellSet(step) {
  const set = new Set();
  if (Array.isArray(step.clearedDetails) && step.clearedDetails.some(d => typeof d.rainbow === 'boolean')) {
    step.clearedDetails.forEach(d => { if (d.rainbow) set.add(d.r + ',' + d.c); });
    return set;
  }
  const matches = Array.isArray(step.matches) ? step.matches : [];
  for (const m of matches) {
    if (!m || m.rainbow !== true) continue;
    const cells = Array.isArray(m.cells) ? m.cells : [];
    for (const cell of cells) set.add(cell[0] + ',' + cell[1]);
  }
  return set;
}

module.exports = {
  plan,
  collectRecords,
  TOWER_KEYS,
  DEFAULT_START_GROUP,
  DEFAULT_LAYOUT,
  DEFAULT_POLICY,
  noop,
};
