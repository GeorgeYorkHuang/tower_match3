const { copySaveData } = require('./save/snapshot.js');
const ShopService = require('./economy/shop.js');
const SkillUnlocks = require('./skills/unlocks.js');
const { todayStr } = require('./economy/calendar.js');
const DeepChests = require('./relics/deep-chests.js');
const RelicProgression = require('./relics/progression.js');
/**
 * meta.js —— 局外持久化数据（主界面层，跨对局保留）
 * =====================================================================
 * v5（重构；起无默认技能）：
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
 *   - towerUnlocks    兼容保留字段（起不再跨局持久化塔位；每局 0 塔开局，先消先得写入对局内 slotOrder）
 */
const Mail=require('./economy/mail.js');
const GlobalSkills = require('./global-skills.js');
const CONFIG = require('./config.js');



class Meta {
  constructor() {
    this.mails=[];
    this.redeemedCodes={};
    this.adDaily = null;
    this.talents = {version:1,slots:[null,null,null,null,null,null],center:null};
    this.tutorial = { version: 1, done: false, step: 0 };
    this.gold = 0;
    this.diamond = 0;
    this.relics = {};            // { relicId: count }
    this.relicLevels = {};       // { relicId: level }
    this.chests = 0;
    this.chestTimer = null;      // { endAt: ms }
    this.dailyPicks = null;      // { date, picks: [{relic, price}] }
    this.towerUnlocks = [];
    this.musicOn = true;
    this.soundOn = true;             // 声音开关（默认开）
    this.runCodex = {};            // 局内圣遗物图鉴解锁 { id: 1 }（获得过才显示）
    this.towerCodex = { fire: 1, ice: 1, poison: 1, electric: 1 }; // 塔图鉴已学习塔（基础四塔默认解锁）
    /* ---------- 激励系统 ---------- */
    this.relicStars = {};          // 圣遗物星级 { id: 1|2|3 }（获得即 1★）
    this.relicDust = 0;
    this.shards = {};              // 圣遗物碎片 { id: count }
    this.deepChests = [];          // 深度宝箱槽位 [{ tier, gotAt, openAt }]（≤4）
    this.milestones = {};          // 里程碑首达 { wave: 1 }
    this.ancientBestWave = 0;
    this.normalFieldCleared = false;
    this.bestWave = 0;             // 历史最深波次
    this.dailyFirst = null;        // 每日首战加成 { date, counts: { field: n } }
    this.totalDiamondSpent = 0;    // 累计钻石消耗（速开等）
    this.matchSkills = Object.assign({}, CONFIG.MATCH_SKILL.default);   // 三消技能局外三槽配置
    this.globalSkills = { slots: ['shuffle', 'refill'] };   // 全局技能槽（预留；技能池 拍板后开放）
    this.skillUnlocks = {};        // 技能解锁 { slot: [id...] }（默认集免费，其余商店金币购买）
    this.shopDaily = null;         // 商店圣物宝箱每日限购 { date, chests: { bronze: n, gold: n } }
  }

  /* ---------- 塔图鉴（） ---------- */
  towerLearned(key) { return !!this.towerCodex[key]; }
  learnTower(key) { this.towerCodex[key] = 1; }

  /* ---------- 圣遗物星级 / 碎片（） ---------- */
  starOf(id) { return RelicProgression.starOf(this, id); }   // 0=未解锁
  /** 碎片入账：只加碎片，不再自动解锁（解锁改为玩家手动触发 unlockByShard）
   *   旧实现（）达阈值即静默解锁，与「凑齐也可选择不解锁、继续攒碎片」冲突 */
  addShard(id, n) { return RelicProgression.addShard(this, id, n); }
  /** 解锁所需碎片数（蓝 r=2 / 紫 sr=4 / 金 ssr=8），与升星消耗同源 */
  shardNeed(id) { return RelicProgression.shardNeed(this, id); }
  /** 可用碎片解锁？（未解锁 且 碎片已够） */
  canUnlockByShard(id) { return RelicProgression.canUnlockByShard(this, id); }
  /** 手动解锁（消耗碎片）：成功返回 null，失败返回错误文案 */
  unlockByShard(id) { return RelicProgression.unlockByShard(this, id); }
  /** 升星：成功返回 null，失败返回错误文案 */
  craftShard(id) { return RelicProgression.craftShard(this, id); }
  upStar(id) { return RelicProgression.upStar(this, id); }
  /** 里程碑首达：返回本次新达成的波次数组 */
  checkMilestone(wave) {
    const got = CONFIG.MILESTONES.filter((m) => wave >= m && !this.milestones[m]);
    got.forEach((m) => { this.milestones[m] = 1; });
    if (wave > this.bestWave) this.bestWave = wave;
    return got;
  }
  /* ---------- 深度宝箱（） ---------- */
  tierByWave(wave) { return DeepChests.tierByWave(this, wave); }
  grantDeepChest(tierDef) { return DeepChests.grantDeepChest(this, tierDef); }
  chestReady(ch) { return DeepChests.chestReady(this, ch); }
  /** 开启深度宝箱：返回收益摘要或 null（未就绪） */
  openDeepChest(idx) { return DeepChests.openDeepChest(this, idx); }
  /** 钻石速开：成功返回 true */
  speedOpen(idx) { return DeepChests.speedOpen(this, idx); }
  /* ---------- 每日首战加成（） ---------- */
  dailyFirstBonus(field, now) {
    const d = todayStr(now);
    if (!this.dailyFirst || this.dailyFirst.date !== d) this.dailyFirst = { date: d, counts: {} };
    const n = this.dailyFirst.counts[field] || 0;
    this.dailyFirst.counts[field] = n + 1;
    return n < 2 ? 1.5 : 0.5;   // 前 2 局 ×1.5，之后 ×0.5
  }

  /* ---------- 局内圣遗物图鉴 ---------- */
  codexOwned(id) { return RelicProgression.codexOwned(this, id); }
  codexUnlock(id) { return RelicProgression.codexUnlock(this, id); }

  /* ---------- 圣物 ---------- */
  relicDef(id) { return CONFIG.RELIC.list.find((r) => r.id === id) || null; }
  relicCount(id) { return this.relics[id] || 0; }
  relicLevel(id) { return this.relicLevels[id] || 0; }
  /** 是否已获取（持有 >0 或已升级） */
  relicOwned(id) { return !require('./config/retired-relics.js').includes(id) && ((this.relics[id] || 0) > 0 || (this.relicLevels[id] || 0) > 0); }
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

  /* ---------- 每日碎片精选（0 点刷新，碎片奖励） ---------- */
  buyShardOffer(offer) { return ShopService.buyShardOffer(this, offer); }
  ensureDailyPicks(nowMs) { return ShopService.ensureDailyPicks(this, nowMs); }

  /* ---------- 技能解锁（） ---------- */
  skillUnlocked(slot, id) { return SkillUnlocks.skillUnlocked(this, slot, id); }
  /** 解锁技能：金币购买；成功返回 { ok:true }，失败 { ok:false, reason:'gold'|'owned' } */
  unlockSkill(slot, id) { return SkillUnlocks.unlockSkill(this, slot, id); }

  /* ---------- 商店圣物宝箱（每日限购） ---------- */
  shopChestLeft(key) { return ShopService.shopChestLeft(this, key); }
  /** 购买圣物宝箱：返回 { ok, reason|gains }；gains = [{ id, n }] 聚合碎片 */
  buyShopChest(key) { return ShopService.buyShopChest(this, key); }

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
    return copySaveData({
      version: 5,
      gold: this.gold,
      diamond: this.diamond,
      relics: this.relics,
      relicLevels: this.relicLevels,
      chests: this.chests,
      chestTimer: this.chestTimer,
      dailyPicks: this.dailyPicks,
      towerUnlocks: this.towerUnlocks,
      musicOn: this.musicOn,
      soundOn: this.soundOn,             // 声音开关
      runCodex: this.runCodex,
      towerCodex: this.towerCodex,
      /* 激励系统 */
      relicStars: this.relicStars,
      mails:this.mails, redeemedCodes:this.redeemedCodes,
      adDaily: this.adDaily,
      talents: this.talents,
      tutorial: this.tutorial,
      relicDust: this.relicDust,
      shards: this.shards,
      deepChests: this.deepChests,
      milestones: this.milestones,
      ancientBestWave: this.ancientBestWave, normalFieldCleared: this.normalFieldCleared,
      bestWave: this.bestWave,
      dailyFirst: this.dailyFirst,
      totalDiamondSpent: this.totalDiamondSpent,
      /* 三消技能局外三槽配置（四连技/高连技/连消技） */
      matchSkills: this.matchSkills,
      globalSkills: this.globalSkills,
      skillUnlocks: this.skillUnlocks,
      shopDaily: this.shopDaily,
    });
  }
  static fromJSON(d) {
    const m = new Meta();
    if (!d) return m;
    d = copySaveData(d);
    Object.assign(m,Mail.normalize(d));
    m.adDaily = d.adDaily || null;
    m.talents = d.talents || {version:1,slots:[null,null,null,null,null,null],center:null};
    m.tutorial = d.tutorial && d.tutorial.version === 1 ? { version:1, done:!!d.tutorial.done, step:Math.max(0,Math.min(5,Number(d.tutorial.step)||0)), skipped:!!d.tutorial.skipped } : { version:1, done:true, legacy:true };
    m.gold = d.gold || 0;
    m.diamond = d.diamond || 0;
    m.relics = d.relics || {};
    m.relicLevels = d.relicLevels || {};
    m.chests = d.chests || 0;
    m.chestTimer = d.chestTimer || null;
    m.dailyPicks = d.dailyPicks || null;
    m.runCodex = d.runCodex || {};    // 局内圣遗物图鉴解锁（旧档无此字段 → 空）
    // 塔图鉴已学习塔（旧档无此字段 → 基础四塔默认解锁）
    m.towerCodex = Object.assign({ fire: 1, ice: 1, poison: 1, electric: 1 }, d.towerCodex || {});
    /* 激励系统（旧档兼容：无字段给默认值） */
    m.relicStars = d.relicStars || {};
    m.relicDust = Math.max(0, Math.floor(Number(d.relicDust) || 0));
    m.shards = Object.assign({}, d.shards || {});
    // 塔类圣遗物分批迁移：把已映射旧卡状态合并到新 ID；尚未迁移的塔继续沿用旧 ID。
    const relicMigration = CONFIG.RELIC_REWORK && CONFIG.RELIC_REWORK.RELIC_MIGRATION || {};
    Object.keys(relicMigration).forEach((oldId) => {
      if (!oldId.startsWith('fire_') && !oldId.startsWith('ice_') && !oldId.startsWith('poison_') && !oldId.startsWith('elec_') && !oldId.startsWith('can_') && !oldId.startsWith('boo_') && !oldId.startsWith('cm_')) return;
      const newId = relicMigration[oldId];
      if (newId === oldId) return;
      const active = Object.keys(CONFIG.RELIC_RUN.tower).some((key) => CONFIG.RELIC_RUN.tower[key].some((r) => r.id === newId))
        || CONFIG.RELIC_RUN.common.some((r) => r.id === newId)
        || (CONFIG.RELIC_RUN.ur || []).some((r) => r.id === newId);
      if (!active) return;
      if (m.relics[oldId]) m.relics[newId] = (m.relics[newId] || 0) + m.relics[oldId];
      if (m.runCodex[oldId]) m.runCodex[newId] = Math.max(m.runCodex[newId] || 0, m.runCodex[oldId]);
      if (m.relicStars[oldId]) m.relicStars[newId] = Math.max(m.relicStars[newId] || 0, m.relicStars[oldId]);
      if (m.shards[oldId]) m.shards[newId] = (m.shards[newId] || 0) + m.shards[oldId];
      delete m.relics[oldId];
      delete m.runCodex[oldId];
      delete m.relicStars[oldId];
      delete m.shards[oldId];
    });
    m.diamond += Math.max(0, Math.floor(Number(d.starStones) || 0)); // Legacy currency converts once; no longer saved.
    m.deepChests = Array.isArray(d.deepChests) ? d.deepChests.slice(0, CONFIG.DEPTH_CHEST.slots) : [];
    m.milestones = d.milestones || {};
    m.ancientBestWave = d.ancientBestWave || 0;
    m.normalFieldCleared = d.normalFieldCleared === true;
    m.bestWave = d.bestWave || 0;
    m.dailyFirst = d.dailyFirst || null;
    m.totalDiamondSpent = d.totalDiamondSpent || 0;
    // 三消技能三槽配置（旧档无字段 → 默认 cross/rainbow/attack）
    m.matchSkills = Object.assign({}, CONFIG.MATCH_SKILL.default, d.matchSkills || {});
    // 随机抽取下架：旧档配置了已下架 id（match4 'random'）→ 归一到该槽默认技，防止运行时仍走随机
    ['match4', 'match5', 'chain'].forEach((slot) => {
      const cur = m.matchSkills[slot];
      if (cur && !CONFIG.MATCH_SKILL[slot].some((def) => def.id === cur)) {
        m.matchSkills[slot] = CONFIG.MATCH_SKILL.default[slot];
      }
    });
    m.globalSkills = { slots: GlobalSkills.slots(d.globalSkills) };
    m.skillUnlocks = d.skillUnlocks || {};
    m.shopDaily = d.shopDaily || null;
    // ：塔位不再跨局持久化——读档后恒为空，每局由最先消除的 4 种颜色重新决定
    m.towerUnlocks = [];
    m.musicOn = d.musicOn !== false;
    m.soundOn = d.soundOn !== false;   // 声音开关（旧档默认开）
    // v4 及以下迁移：装备过的圣物视为已拥有（+1）；技能卡/技能槽丢弃（技能回归默认 3 个）
    if (d.relicSlots && Array.isArray(d.relicSlots)) {
      d.relicSlots.forEach((id) => {
        if (id && !m.relicOwned(id)) m.relics[id] = (m.relics[id] || 0) + 1;
      });
    }
    require('./relics/red-migration.js').migrate(m);
    Object.keys(m.shards).forEach(id => RelicProgression.normalizeShard(m, id));
    return m;
  }
}

module.exports = { Meta };
