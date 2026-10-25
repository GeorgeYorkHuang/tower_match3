/**
 * meta.js —— 局外持久化数据（主界面层，跨对局保留）
 * =====================================================================
 * v5（v1.4.0 重构；v1.12 起无默认技能）：
 *   - 技能卡/技能槽/圣物装备槽 已彻底移除；
 *     技能 = 无默认激活，全部通过「打怪经验 → 塔升级 → 战斗内跨塔三选一
 *     （技能卡激活 / 分支卡续升，每塔 8 技能 × 3 分支）」获取。
 *   - 圣物卡 = 唯一养成资源：宝箱开启 / 战斗中精英圣物宝箱三选一 / 商店每日精选 / 广告；
 *     无需装备，拥有即常驻加成（按等级）；重复获取可在圣物页升级。
 *   - gold            金币（唯一源；对局内 run.gold 为其镜像）
 *   - diamond         钻石（充值货币，后续开放；可购宝箱/金币）
 *   - relics          圣物持有数：{ gold: 3, exp: 1, ... }
 *   - relicLevels     圣物等级：{ gold: 2, ... }（升级消耗 1 同名圣物 + 金币）
 *   - chests          宝箱数量（Boss 掉落 / 钻石购买）
 *   - chestTimer      开箱倒计时：{ endAt: timestamp } 进行中 / null
 *   - dailyPicks      每日精选：{ date: 'YYYY-MM-DD', picks: [{relic, price}] }
 *   - towerUnlocks    兼容保留字段（v1.6 起不再跨局持久化塔位；每局 0 塔开局，先消先得写入对局内 slotOrder）
 */
const CONFIG = require('./config.js');

function todayStr(nowMs) {
  const d = new Date(nowMs || Date.now());
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

class Meta {
  constructor() {
    this.gold = 0;
    this.diamond = 0;
    this.relics = {};            // { relicId: count }
    this.relicLevels = {};       // { relicId: level }
    this.chests = 0;
    this.chestTimer = null;      // { endAt: ms }
    this.dailyPicks = null;      // { date, picks: [{relic, price}] }
    this.towerUnlocks = [];
    this.runCodex = {};            // v1.16.60 局内圣遗物图鉴解锁 { id: 1 }（获得过才显示）
    this.towerCodex = { fire: 1, ice: 1, poison: 1, electric: 1 }; // v1.16.75 塔图鉴已学习塔（基础四塔默认解锁）
  }

  /* ---------- 塔图鉴（v1.16.75） ---------- */
  towerLearned(key) { return !!this.towerCodex[key]; }
  learnTower(key) { this.towerCodex[key] = 1; }

  /* ---------- 局内圣遗物图鉴 ---------- */
  codexOwned(id) { return (this.runCodex[id] || 0) > 0; }
  codexUnlock(id) { this.runCodex[id] = 1; }

  /* ---------- 圣物 ---------- */
  relicDef(id) { return CONFIG.RELIC.list.find((r) => r.id === id) || null; }
  relicCount(id) { return this.relics[id] || 0; }
  relicLevel(id) { return this.relicLevels[id] || 0; }
  /** 是否已获取（持有 >0 或已升级） */
  relicOwned(id) { return (this.relics[id] || 0) > 0 || (this.relicLevels[id] || 0) > 0; }
  addRelic(id) { this.relics[id] = (this.relics[id] || 0) + 1; }
  /** 升级消耗：{ gold, relic }（金币 costBase×costGrowth^lv + 1 个同名圣物） */
  relicUpCost(id) {
    const def = this.relicDef(id);
    if (!def) return { gold: Infinity, relic: 1 };
    const lv = this.relicLevel(id);
    return { gold: Math.round(def.costBase * Math.pow(def.costGrowth, lv)), relic: 1 };
  }
  upgradeRelic(id) {
    const cost = this.relicUpCost(id);
    if (this.relicCount(id) < cost.relic) return { ok: false, reason: 'relic' };
    if (this.gold < cost.gold) return { ok: false, reason: 'gold' };
    this.gold -= cost.gold;
    this.relics[id] -= cost.relic;
    this.relicLevels[id] = (this.relicLevels[id] || 0) + 1;
    return { ok: true, level: this.relicLevels[id], gold: cost.gold };
  }
  /** 圣物加成：全部已获取圣物按等级常驻生效（无需装备） */
  relicBonus() {
    const b = { gold: 0, exp: 0, speed: 0, wall: 0, dmg: 0, chest: 0 };
    CONFIG.RELIC.list.forEach((def) => {
      const lv = this.relicLevel(def.id) || 0;
      if (!this.relicOwned(def.id)) return;
      if (def.id === 'gold') b.gold = lv;
      if (def.id === 'exp') b.exp = lv;
      if (def.id === 'speed') b.speed = lv;
      if (def.id === 'wall') b.wall = lv;
      if (def.id === 'dmg') b.dmg = lv;
      if (def.id === 'chest') b.chest = lv;
    });
    return b;
  }
  /** 按掉率权重随机一个圣物 id（优先低拥有数，用于宝箱/广告/战斗掉落） */
  randomRelicId() {
    const list = CONFIG.RELIC.list.slice().sort((a, b) => (this.relicCount(a.id) - this.relicCount(b.id)));
    const total = list.reduce((s, r) => s + r.drop, 0);
    let r = Math.random() * total;
    for (const def of list) {
      r -= def.drop;
      if (r <= 0) return def.id;
    }
    return list[list.length - 1].id;
  }

  /* ---------- 每日精选（0 点刷新，圣物卡） ---------- */
  ensureDailyPicks(nowMs) {
    const date = todayStr(nowMs);
    if (this.dailyPicks && this.dailyPicks.date === date) return this.dailyPicks;
    const picks = [];
    while (picks.length < CONFIG.DAILY.perDay) {
      const id = this.randomRelicId();
      if (picks.some((p) => p.relic === id)) continue;
      picks.push({ relic: id, price: CONFIG.DAILY.price });
    }
    this.dailyPicks = { date, picks };
    return this.dailyPicks;
  }

  /* ---------- 宝箱 ---------- */
  /** 开箱倒计时剩余秒数（0=可开启，null=无进行中） */
  chestRemainSec(nowMs) {
    if (!this.chestTimer) return null;
    const left = Math.max(0, Math.ceil((this.chestTimer.endAt - nowMs) / 1000));
    return left > 0 ? left : 0;
  }
  /** 开启一个宝箱：需要至少 1 个宝箱且无进行中倒计时 */
  startChest(nowMs) {
    if (this.chests <= 0) return { ok: false, reason: 'none' };
    if (this.chestTimer) return { ok: false, reason: 'opening' };
    this.chests -= 1;
    this.chestTimer = { endAt: nowMs + CONFIG.RELIC.chestOpenSec * 1000 };
    return { ok: true };
  }
  /** 倒计时结束 → 发圣物卡；返回获得的圣物 {id, name, icon} 或 null */
  finishChest(nowMs) {
    if (!this.chestTimer) return null;
    if (nowMs < this.chestTimer.endAt) return null;
    this.chestTimer = null;
    return this._randomRelicReward();
  }
  _randomRelicReward() {
    // 随机一张圣物卡（按掉率权重，优先低拥有数）
    const id = this.randomRelicId();
    this.addRelic(id);
    const def = this.relicDef(id);
    return { id, name: def ? def.name : id, icon: def ? def.icon : '📿' };
  }

  /* ---------- 序列化 ---------- */
  toJSON() {
    return {
      version: 5,
      gold: this.gold,
      diamond: this.diamond,
      relics: this.relics,
      relicLevels: this.relicLevels,
      chests: this.chests,
      chestTimer: this.chestTimer,
      dailyPicks: this.dailyPicks,
      towerUnlocks: this.towerUnlocks,
      runCodex: this.runCodex,
      towerCodex: this.towerCodex,
    };
  }
  static fromJSON(d) {
    const m = new Meta();
    if (!d) return m;
    m.gold = d.gold || 0;
    m.diamond = d.diamond || 0;
    m.relics = d.relics || {};
    m.relicLevels = d.relicLevels || {};
    m.chests = d.chests || 0;
    m.chestTimer = d.chestTimer || null;
    m.dailyPicks = d.dailyPicks || null;
    m.runCodex = d.runCodex || {};    // v1.16.60 局内圣遗物图鉴解锁（旧档无此字段 → 空）
    // v1.16.75 塔图鉴已学习塔（旧档无此字段 → 基础四塔默认解锁）
    m.towerCodex = Object.assign({ fire: 1, ice: 1, poison: 1, electric: 1 }, d.towerCodex || {});
    // v1.6：塔位不再跨局持久化——读档后恒为空，每局由最先消除的 4 种颜色重新决定
    m.towerUnlocks = [];
    // v4 及以下迁移：装备过的圣物视为已拥有（+1）；技能卡/技能槽丢弃（技能回归默认 3 个）
    if (d.relicSlots && Array.isArray(d.relicSlots)) {
      d.relicSlots.forEach((id) => {
        if (id && !m.relicOwned(id)) m.relics[id] = (m.relics[id] || 0) + 1;
      });
    }
    return m;
  }
}

module.exports = { Meta };
