/**
 * save.js —— 存档管理：读写 wx 本地存档（Meta 局外数据 + 对局镜像）
 * v5（v1.4.0）：技能卡/技能槽/圣物装备槽 已移除；圣物 = 唯一养成资源（拥有即常驻）。
 * 对局内塔等级/技能（本局成长）不持久化，重进游戏按每塔默认 3 技能重新激活。
 */
const CONFIG = require('./config.js');
const { Meta } = require('./meta.js');

const SAVE_KEY = 'xxfx_save_v1';

/** 存档读写器：负责 读档 → 恢复 → 写档 */
class SaveManager {
  constructor(game) {
    this.game = game;
  }

  /** 读取原始存档；无 wx / 损坏 / 版本不符 → null（v4 及以下由 Meta.fromJSON 迁移为 v5） */
  load() {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return null;
    try {
      const d = wx.getStorageSync(SAVE_KEY);
      if (!d) return null;
      if (d.version === 5 || d.version === 4 || d.version === 3) return d;
      if (d.version === 2) return this._migrateV2(d); // v2 旧档自动迁移（技能卡带等级）
      if (d.version === 1) return this._migrateV2(this._migrateV1(d));
      return null;
    } catch (e) { return null; }
  }

  /** v1 → v2 迁移：金币/塔解锁保留；塔等级经验不再跨局（技能卡系统接管） */
  _migrateV1(d) {
    return {
      version: 2,
      gold: d.gold || 0,
      skillCards: {},
      skillSlots: [null, null, null, null],
      relics: {},
      relicLevels: {},
      relicSlots: [null, null, null],
      chests: 0,
      chestTimer: null,
      towerUnlocks: d.towerUnlocks || [],
    };
  }

  /** v2 → v3 迁移：技能卡 count → {count, lv:1}；4 全局槽 → 每塔 1 卡位；+钻石/每日精选 */
  _migrateV2(d) {
    const skillCards = {};
    Object.keys(d.skillCards || {}).forEach((tk) => {
      skillCards[tk] = {};
      Object.keys(d.skillCards[tk]).forEach((sn) => {
        const v = d.skillCards[tk][sn];
        skillCards[tk][sn] = typeof v === 'object' ? { count: v.count || 0, lv: v.lv || 1 } : { count: v || 0, lv: 1 };
      });
    });
    // 4 全局槽 → 每塔 1 卡位（多槽同塔取第一个，其余塔各收一个；同名去重）
    const towerSkillSlots = {};
    (d.skillSlots || []).forEach((slot) => {
      if (!slot || !slot.tower || !slot.skill) return;
      if (!towerSkillSlots[slot.tower]) towerSkillSlots[slot.tower] = slot.skill;
    });
    return {
      version: 3,
      gold: d.gold || 0,
      diamond: 0,
      skillCards,
      towerSkillSlots,
      relics: d.relics || {},
      relicLevels: d.relicLevels || {},
      relicSlots: (d.relicSlots && d.relicSlots.length) ? d.relicSlots.slice() : [null, null, null],
      chests: d.chests || 0,
      chestTimer: d.chestTimer || null,
      dailyPicks: null,
      towerUnlocks: d.towerUnlocks || [],
    };
  }

  /** 把存档应用到当前局外数据（Meta） */
  applyMeta(saveData) {
    this.game.meta = Meta.fromJSON(saveData);
    return this.game.meta;
  }

  /** 把 Meta 应用进当前对局（金币镜像 + 塔位解锁顺序）；saveData 为 null 时用已建的 game.meta */
  apply(saveData) {
    const meta = this.game.meta || Meta.fromJSON(saveData);
    if (!meta) return;
    this.game.meta = meta;
    const run = this.game.run;
    run.gold = meta.gold; // 金币镜像
    // v1.6：塔位解锁不再跨局保留——每局从 0 塔开始，由最先消除的 4 种颜色决定出战塔
    // （先消先得写入 run.slotOrder，不持久化）
  }

  /** 写档（Meta 全量 + 对局镜像字段） */
  save() {
    if (typeof wx === 'undefined' || !wx.setStorageSync) return;
    const meta = this.game.meta;
    if (!meta) return;
    try {
      // v1.6：不再把对局塔位（先消先得）持久化到 towerUnlocks——每局从 0 塔开始
      wx.setStorageSync(SAVE_KEY, meta.toJSON());
    } catch (e) {}
  }
  /** 清档：删除本地存档（用于设置-清档重开） */
  clear() {
    if (typeof wx === 'undefined') return;
    try {
      if (wx.removeStorageSync) wx.removeStorageSync(SAVE_KEY);
      else wx.setStorageSync(SAVE_KEY, null);
    } catch (e) {}
  }
}

module.exports = { SaveManager };
