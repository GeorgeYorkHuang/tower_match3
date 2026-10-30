/**
 * 伤害数字表现模块（v1 · W 交付）
 *
 * 职责单一：接收"纯数据事件"，做格式化 / 合并 / 错位 / 生命周期，输出可绘制条目。
 * 不持有 Run / Combat，不读棋盘，不扣血、不发奖、不改 enemy 任何字段。
 *
 * 接线契约（由 owner 在伤害入口调用）：
 *   const dn = DamageNumbers.create();                       // 每局一个实例
 *   // damage.js 扣血后、死亡递归回调前：
 *   dn.push({ enemyId: e.id, x: e.x, y: e.y - size*0.6, sourceKey: srcKey, amount: dealt, kind: 'hit' });
 *   // 每帧（战斗推进，暂停时不推进）：
 *   dn.step(dt);
 *   // 渲染层（敌人层之后）：
 *   dn.drawTo(ctx, { text });        // helpers.text = ui.js 的 text(ctx,str,x,y,size,color,align)
 *   // 退出战斗 / 重开：
 *   dn.clear();
 *
 * 关键约束：
 *   - 只用确定性哈希做横向漂移，**不调用 Math.random**（避免打乱逻辑侧 RNG 顺序）。
 *   - 合并/上限/丢弃只作用于表现，不改变真实伤害、击杀与奖励。
 */
'use strict';
const DEFAULT_CONFIG = require('../../config/combat-presentation.js').damageNumbers;

/* 确定性伪随机：把序号打散到 [-1,1]，不用 Math.random */
function jitter(seq) {
  let h = (seq * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return ((h % 2000) / 1000) - 1;
}

/** 数字格式化：≥1万 转「X.X万」（≥100万取整），超大兜底上限文案；最小显示 1（不显示 0） */
function formatAmount(amount, conf) {
  const c = conf || DEFAULT_CONFIG;
  const n = Math.round(Number(amount) || 0);
  if (n <= 0) return '1';
  const wanAt = (c.format && c.format.wanAt) || 10000;
  if (n < wanAt) return String(n);
  const d = (c.format && c.format.wanDigits) == null ? 1 : c.format.wanDigits;
  const wan = n / wanAt;
  if (wan >= 9999) return (c.format && c.format.maxText) || '9999万+';
  // 100 万以上不再保留小数，避免「100.0万」这类无意义精度（99.99万 → 100万）
  const w1 = Math.round(wan * 10) / 10;
  return (w1 >= 100 ? String(Math.round(wan)) : wan.toFixed(d)) + '万';
}

function create(opts) {
  opts = opts || {};
  const conf = opts.config || DEFAULT_CONFIG;
  const items = [];
  const stats = { pushed: 0, merged: 0, dropped: 0, expired: 0 };
  let seq = 0;

  const colorOf = (sourceKey) => conf.palette[sourceKey] || conf.palette.unknown;
  const isMergable = (kind) => (conf.merge && conf.merge.kinds ? conf.merge.kinds.indexOf(kind) >= 0 : false);

  /** 同一敌人当前活跃条数（用于纵向错位） */
  function stackIndex(enemyId) {
    let n = 0;
    for (const it of items) if (it.enemyId === enemyId) n++;
    return n;
  }

  /**
   * 入队一条伤害数字。
   * event: { enemyId, x, y, sourceKey, amount, kind: 'hit'|'dot'|'true'|'crit', crit?: bool }
   * 返回 { merged: bool, dropped: bool, id }
   */
  function push(ev) {
    stats.pushed++;
    const kind = ev.kind || 'hit';
    const life = ev.life || (kind === 'dot' ? conf.life.dot : (ev.big || ev.amount >= conf.bigAt ? conf.life.big : conf.life.base));
    const color = ev.color || colorOf(ev.sourceKey);

    // 1) 合并：同敌人 + 同来源 + 可合并类型 + 在窗口内
    if (isMergable(kind)) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.enemyId !== ev.enemyId || it.sourceKey !== ev.sourceKey || it.kind !== kind) continue;
        if (it.age > conf.merge.window) continue;
        it.amount += Math.max(0, Number(ev.amount) || 0);
        it.count++;
        it.age = 0;
        it.text = formatAmount(it.amount, conf);
        stats.merged++;
        return { merged: true, dropped: false, id: it.id };
      }
    }

    // 2) 表现上限：超出丢最旧（真实伤害已在逻辑层结算，不受影响）
    let dropped = false;
    while (items.length >= conf.maxActive) {
      items.shift();
      stats.dropped++;
      dropped = true;
    }

    const s = stackIndex(ev.enemyId);
    const id = ++seq;
    const size = kind === 'dot' ? conf.size.dot : (ev.amount >= conf.bigAt || ev.crit ? conf.size.big : conf.size.base);
    const item = {
      id,
      enemyId: ev.enemyId,
      x: ev.x + jitter(id) * conf.drift,
      y: ev.y,
      baseY: ev.y,
      sourceKey: ev.sourceKey,
      kind,
      amount: Math.max(0, Number(ev.amount) || 0),
      count: 1,
      age: 0,
      life,
      size: ev.crit ? conf.size.crit : size,
      color,
      text: formatAmount(ev.amount, conf),
      offsetY: Math.min(s, conf.stack.max - 1) * conf.stack.step,
    };
    items.push(item);
    return { merged: false, dropped, id };
  }

  /** 推进时间（秒）。仅战斗推进时调用；暂停/弹层/结算不推进。 */
  function step(dt) {
    if (!(dt > 0)) return 0;
    let removed = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      if (it.age >= it.life) { items.splice(i, 1); removed++; }
    }
    stats.expired += removed;
    return removed;
  }

  /** 当前可绘制条目（快照，调用方只读） */
  function visible() {
    return items.map((it) => {
      const p = Math.max(0, Math.min(1, it.age / it.life));
      const fin = conf.fadeIn > 0 ? Math.min(1, it.age / conf.fadeIn) : 1;
      // 后 25% 生命周期淡出
      const fadeOut = p <= 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      const pop = 0.86 + 0.14 * fin;
      return {
        id: it.id,
        enemyId: it.enemyId,
        text: it.text,
        x: it.x,
        y: it.baseY - conf.rise * p - it.offsetY,
        size: it.size * pop,
        color: it.color,
        alpha: Math.max(0, Math.min(1, fin * fadeOut)),
        kind: it.kind,
      };
    });
  }

  /** 绘制：helpers.text(ctx, str, x, y, size, color, align) 由渲染层注入 */
  function drawTo(ctx, helpers) {
    const text = helpers && helpers.text;
    if (typeof text !== 'function') return 0;
    const list = visible();
    for (const v of list) {
      ctx.globalAlpha = v.alpha;
      text(ctx, v.text, v.x, v.y, v.size, v.color, 'center');
    }
    ctx.globalAlpha = 1;
    return list.length;
  }

  function clear() {
    items.length = 0;
  }

  function statsOf() {
    return { pushed: stats.pushed, merged: stats.merged, dropped: stats.dropped, expired: stats.expired, active: items.length };
  }

  return { push, step, visible, drawTo, clear, stats: statsOf, config: conf };
}

module.exports = { create, formatAmount, jitter };
