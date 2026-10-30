/**
 * 战斗表现配置（v1 · W 交付，供 owner 接线）
 *
 * 只放"看得到的东西"的参数：怪物血条开关、伤害数字配色/字号/生命周期/合并。
 * 不含任何战斗数值（伤害公式、护甲、DoT 跳数仍由 combat/*.js 决定）。
 *
 * 约定：
 *  - 这里只做显示开关与表现参数，禁止影响 hp/maxHp/delayHp 与击杀奖励。
 *  - 改配色/字号只改本文件；改"显示哪些来源"用 damageNumbers.sources。
 */
'use strict';

/* 六塔表现色（沿用现有 UI 配色，与 TOWER_TINT 同源口径） */
const TOWER_TINT = {
  fire: '#ff7043',
  ice: '#7fd4ff',
  poison: '#7ee2a8',
  electric: '#f4d03f',
  boomerang: '#c39bd3',
  cannon: '#d89e63',
};

const UNKNOWN_TINT = '#cfd8e3';

module.exports = {
  version: 'v1',

  /* ---------------- 怪物血条 ---------------- */
  enemyBars: {
    // 显示开关：只影响绘制，hp/maxHp/delayHp/护甲/掉落/击杀统计一律保持
    show: true,
    showBoss: true,          // Boss 可单独保留（Boss 血条是战斗节奏锚点）
    showElite: true,
    tail: true,              // 延迟尾条（区分直接伤 / DoT 平滑掉血）
    keepLogic: true,         // 契约锁：无论 show 如何，血条相关字段与逻辑不得删除
  },

  /* ---------------- 伤害数字 ---------------- */
  damageNumbers: {
    enabled: true,
    // 按本次伤害的来源塔取色（sourceKey），不用受击后的 lastDmgKey 反推
    palette: Object.assign({}, TOWER_TINT, { unknown: UNKNOWN_TINT }),
    // 显示来源白名单：null = 全部显示。DoT（灼烧/中毒/流血/腐化真伤）同样可见，
    // 不按测试号日志规则隐藏。
    sources: null,
    size: { base: 22, big: 28, dot: 16, crit: 30 },
    life: { base: 0.75, dot: 0.6, big: 0.95 },
    rise: 46,                // 整个生命周期上飘的像素
    drift: 10,               // 横向漂移上限（确定性哈希，不消耗逻辑 RNG）
    stack: { step: 22, max: 4 },        // 同一个敌人同时多条时的纵向错位
    merge: { window: 0.12, kinds: ['dot'], maxPerEnemy: 6 },   // 密集 DoT 合并（只减视觉，不减真实伤害）
    bigAt: 100,              // ≥ 该值放大字号
    format: { wanAt: 10000, wanDigits: 1, maxText: '9999万+' },
    maxActive: 60,           // 表现上限：超出丢最旧（仅表现，不影响伤害结算）
    fadeIn: 0.08,            // 出现淡入时长（秒）
  },
};

module.exports.TOWER_TINT = TOWER_TINT;
module.exports.UNKNOWN_TINT = UNKNOWN_TINT;

/** sourceKey → 表现色（未知来源中性色；不抛错，渲染层可闭眼调用） */
module.exports.colorOf = function colorOf(sourceKey) {
  const p = module.exports.damageNumbers.palette;
  return p[sourceKey] || p.unknown;
};

/** 是否允许显示该来源（sources 为 null 表示全显示） */
module.exports.allowsSource = function allowsSource(sourceKey) {
  const list = module.exports.damageNumbers.sources;
  if (!list) return true;
  return list.indexOf(sourceKey) >= 0;
};
