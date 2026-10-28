/**
 * meta.js —— 局外持久化数据（主界面层，跨对局保留）
 * =====================================================================
 * v5（v1.4.0 重构；v1.12 起无默认技能）：
 *   - 技能卡/技能槽/圣物装备槽 已彻底移除；
 *     技能 = 无默认激活，全部通过「打怪经验 → 塔升级 → 战斗内跨塔三选一
 *     （技能卡激活 / 分支卡续升，每塔 8 技能 × 3 分支）」获取。
 *   - 圣物卡 = 唯一养成资源：宝箱开启 / 战斗中精英圣物宝箱三选一 / 商店每日精选 / 广告；
 *     无需装备，拥有即常驻加成（按等级）；重复获取可在圣物页升级。
 *   - gold            金币（局外永久货币；对局内 run.gold 为局内银币，结算时按深度池口径折算回金币）
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
    this.soundOn = true;             // v1.16.107 声音开关（默认开）
    this.runCodex = {};            // v1.16.60 局内圣遗物图鉴解锁 { id: 1 }（获得过才显示）
    this.towerCodex = { fire: 1, ice: 1, poison: 1, electric: 1 }; // v1.16.75 塔图鉴已学习塔（基础四塔默认解锁）
    /* ---------- v1.16.76 激励系统 ---------- */
    this.relicStars = {};          // 圣遗物星级 { id: 1|2|3 }（获得即 1★）
    this.shards = {};              // 圣遗物碎片 { id: count }
    this.starStones = 0;           // 星辉石（3★ 金级门槛）
    this.deepChests = [];          // 深度宝箱槽位 [{ tier, gotAt, openAt }]（≤4）
    this.milestones = {};          // 里程碑首达 { wave: 1 }
    this.bestWave = 0;             // 历史最深波次
    this.dailyFirst = null;        // 每日首战加成 { date, counts: { field: n } }
    this.totalDiamondSpent = 0;    // 累计钻石消耗（速开等）
    this.matchSkills = Object.assign({}, CONFIG.MATCH_SKILL.default);   // v5.2 三消技能局外三槽配置
    this.globalSkills = { slots: ['shuffle', 'refill', null] };   // v5.3 全局技能槽（预留；技能池 v5.3 拍板后开放）
  }

  /* ---------- 塔图鉴（v1.16.75） ---------- */
  towerLearned(key) { return !!this.towerCodex[key]; }
  learnTower(key) { this.towerCodex[key] = 1; }

  /* ---------- 圣遗物星级 / 碎片（v1.16.76） ---------- */
  starOf(id) { return this.relicStars[id] || (this.runCodex[id] ? 1 : 0); }   // 0=未解锁
  /** v1.17.20 碎片入账：只加碎片，不再自动解锁（解锁改为玩家手动触发 unlockByShard）
   *   旧实现（v1.16.78）达阈值即静默解锁，与「凑齐也可选择不解锁、继续攒碎片」冲突 */
  addShard(id, n) {
    this.shards[id] = (this.shards[id] || 0) + n;
  }
  /** 解锁所需碎片数（蓝 r=2 / 紫 sr=4 / 金 ssr=8），与升星消耗同源 */
  shardNeed(id) { return CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(id)] || 0; }
  /** 可用碎片解锁？（未解锁 且 碎片已够） */
  canUnlockByShard(id) {
    const need = this.shardNeed(id);
    return need > 0 && this.starOf(id) < 1 && (this.shards[id] || 0) >= need;
  }
  /** 手动解锁（消耗碎片）：成功返回 null，失败返回错误文案 */
  unlockByShard(id) {
    if (this.starOf(id) >= 1) return '已解锁';
    const need = this.shardNeed(id);
    if (!need) return '该圣遗物无需碎片解锁';
    const have = this.shards[id] || 0;
    if (have < need) return `碎片不足（${have}/${need}）`;
    this.shards[id] = have - need;
    this.codexUnlock(id);
    return null;
  }
  /** 升星：成功返回 null，失败返回错误文案 */
  upStar(id) {
    const cur = this.starOf(id);
    if (!cur) return '未解锁该圣遗物';
    if (cur >= 3) return '已达 3★';
    const next = cur + 1;
    const c = CONFIG.STAR_UP.cost[next];
    if (this.gold < c.gold) return '金币不足';
    if ((this.shards[id] || 0) < c.shards) return `碎片不足（${this.shards[id] || 0}/${c.shards}）`;
    if (next === 3 && CONFIG.STAR_UP.goldStarExtraStone && CONFIG.relicRarity(id) === 'ssr' && this.starStones < (c.stone || 0)) return '星辉石不足';
    this.gold -= c.gold;
    this.shards[id] -= c.shards;
    if (next === 3 && c.stone) this.starStones -= c.stone;
    this.relicStars[id] = next;
    return null;
  }
  /** 里程碑首达：返回本次新达成的波次数组 */
  checkMilestone(wave) {
    const got = CONFIG.MILESTONES.filter((m) => wave >= m && !this.milestones[m]);
    got.forEach((m) => { this.milestones[m] = 1; });
    if (wave > this.bestWave) this.bestWave = wave;
    return got;
  }
  /* ---------- 深度宝箱（v1.16.76） ---------- */
  tierByWave(wave) {
    const t = CONFIG.DEPTH_CHEST.tiers;
    for (const tier of t) if (wave <= tier.max) return tier;
    return t[t.length - 1];
  }
  grantDeepChest(tierDef) {
    if (this.deepChests.length >= CONFIG.DEPTH_CHEST.slots) return false;   // 槽满（设计：碎片金币走即时掉落线兜底）
    this.deepChests.push({ tier: tierDef.key, gotAt: Date.now(), openAt: Date.now() + tierDef.openSec * 1000 });
    return true;
  }
  chestReady(ch) { return Date.now() >= ch.openAt; }
  /** 开启深度宝箱：返回收益摘要或 null（未就绪） */
  openDeepChest(idx) {
    const ch = this.deepChests[idx];
    if (!ch || !this.chestReady(ch)) return null;
    const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
    this.deepChests.splice(idx, 1);
    const rnd = (a) => a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1));
    const gain = {
      gold: rnd(tier.gold),
      shards: rnd(tier.shards),
      diamond: tier.diamond || (tier.diamondChance && Math.random() < tier.diamondChance ? 1 : 0),
      stone: tier.stone || (tier.stoneChance && Math.random() < tier.stoneChance ? 1 : 0),
      card: null,
    };
    // 圣遗物卡：按 cardChance 出卡，黄金档 25% 升金卡
    if (Math.random() < tier.cardChance) {
      let rar = tier.cardRarity;
      if (tier.goldCardChance && Math.random() < tier.goldCardChance) rar = 'ssr';
      gain.card = CONFIG.randomShardCardId(rar);
      if (gain.card) this.addShard(gain.card, 5);   // 卡=直接注入 5 碎片（简化：卡即碎片包）
    }
    this.gold += gain.gold;
    if (gain.diamond) this.diamond += gain.diamond;
    if (gain.stone) this.starStones += gain.stone;
    return gain;
  }
  /** 钻石速开：成功返回 true */
  speedOpen(idx) {
    const ch = this.deepChests[idx];
    if (!ch) return false;
    const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
    const remainMin = Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000));
    const cost = Math.max(1, Math.ceil(remainMin / 60 * 4));   // ≈4💎/小时
    if (this.diamond < cost) return false;
    this.diamond -= cost; this.totalDiamondSpent += cost;
    ch.openAt = Date.now();
    return true;
  }
  /* ---------- 每日首战加成（v1.16.76） ---------- */
  dailyFirstBonus(field, now) {
    const d = todayStr(now);
    if (!this.dailyFirst || this.dailyFirst.date !== d) this.dailyFirst = { date: d, counts: {} };
    const n = this.dailyFirst.counts[field] || 0;
    this.dailyFirst.counts[field] = n + 1;
    return n < 2 ? 1.5 : 0.5;   // 前 2 局 ×1.5，之后 ×0.5
  }

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
      soundOn: this.soundOn,             // v1.16.107 声音开关
      runCodex: this.runCodex,
      towerCodex: this.towerCodex,
      /* v1.16.76 激励系统 */
      relicStars: this.relicStars,
      shards: this.shards,
      starStones: this.starStones,
      deepChests: this.deepChests,
      milestones: this.milestones,
      bestWave: this.bestWave,
      dailyFirst: this.dailyFirst,
      totalDiamondSpent: this.totalDiamondSpent,
      /* v5.2 三消技能局外三槽配置（四连技/高连技/连消技） */
      matchSkills: this.matchSkills,
      globalSkills: this.globalSkills,
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
    /* v1.16.76 激励系统（旧档兼容：无字段给默认值） */
    m.relicStars = d.relicStars || {};
    m.shards = d.shards || {};
    m.starStones = d.starStones || 0;
    m.deepChests = Array.isArray(d.deepChests) ? d.deepChests.slice(0, CONFIG.DEPTH_CHEST.slots) : [];
    m.milestones = d.milestones || {};
    m.bestWave = d.bestWave || 0;
    m.dailyFirst = d.dailyFirst || null;
    m.totalDiamondSpent = d.totalDiamondSpent || 0;
    // v5.2 三消技能三槽配置（旧档无字段 → 默认 cross/rainbow/attack）
    m.matchSkills = Object.assign({}, CONFIG.MATCH_SKILL.default, d.matchSkills || {});
    m.globalSkills = { slots: ['shuffle', 'refill', null], ...(d.globalSkills || {}) };
    // v1.6：塔位不再跨局持久化——读档后恒为空，每局由最先消除的 4 种颜色重新决定
    m.towerUnlocks = [];
    m.soundOn = d.soundOn !== false;   // v1.16.107 声音开关（旧档默认开）
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
