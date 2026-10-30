const Migrations = require('./save/migrations.js');
const { copySaveData } = require('./save/snapshot.js');
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
    this.storageKey = SAVE_KEY;
    this.lastLoadStatus = 'missing';
    this._blockedKeys = new Set();
  }

  /** 读取原始存档；无 wx / 损坏 / 版本不符 → null（v4 及以下由 Meta.fromJSON 迁移为 v5） */
  load() {
    if (typeof wx === 'undefined' || !wx.getStorageSync) { this.lastLoadStatus = 'unavailable'; return null; }
    try {
      const d = copySaveData(wx.getStorageSync(this.storageKey));
      if (d == null || d === '') { this.lastLoadStatus = 'missing'; this._blockedKeys.delete(this.storageKey); return null; }
      let result;
      if (d.version === 5 || d.version === 4 || d.version === 3) result = this._renameIceSkills(this._renameBounceSkill(d));
      else if (d.version === 2) result = this._migrateV2(d);
      else if (d.version === 1) result = this._migrateV2(this._migrateV1(d));
      else { this.lastLoadStatus = 'unsupported'; this._blockedKeys.add(this.storageKey); return null; }
      this.lastLoadStatus = 'ok'; this._blockedKeys.delete(this.storageKey);
      return result;
    } catch (e) { this.lastLoadStatus = 'error'; this._blockedKeys.add(this.storageKey); return null; }
  }

  /** v1.13.19 技能改名迁移：弹跳 → 活电（旧档技能卡/槽位不丢失） */
  _renameBounceSkill(d) { return Migrations._renameBounceSkill(d); }

  /** v1.13.23-25 冰塔技能改名迁移：减速场→寒霜、寒潮→多重冰锥、霜星→冰花、冻结率→冬珠、低温全塔→碎冰、永冻→冰墙 */
  _renameIceSkills(d) { return Migrations._renameIceSkills(d); }

  /** v1 → v2 迁移：金币/塔解锁保留；塔等级经验不再跨局（技能卡系统接管） */
  _migrateV1(d) { return Migrations._migrateV1(d); }

  /** v2 → v3 迁移：技能卡 count → {count, lv:1}；4 全局槽 → 每塔 1 卡位；+钻石/每日精选 */
  _migrateV2(d) { return Migrations._migrateV2(d); }

  /** 把存档应用到当前局外数据（Meta） */
  applyMeta(saveData) {
    this.game.meta = Meta.fromJSON(saveData);
    return this.game.meta;
  }

  /** 把 Meta 应用进当前对局（塔位解锁顺序）；saveData 为 null 时用已建的 game.meta */
  apply(saveData) {
    const meta = this.game.meta || Meta.fromJSON(saveData);
    if (!meta) return;
    this.game.meta = meta;
    const run = this.game.run;
    // v1.16.77 局内金币不再镜像局外银币：局内金币由本局波末+击杀自持，战斗结束统一结算成银币
    // v1.6：塔位解锁不再跨局保留——每局从 0 塔开始，由最先消除的 4 种颜色决定出战塔
    // （先消先得写入 run.slotOrder，不持久化）
  }

  /** 写档（Meta 全量 + 对局镜像字段） */
  save() {
    if (typeof wx === 'undefined' || !wx.setStorageSync) return false;
    if (this._blockedKeys.has(this.storageKey)) return false;
    const meta = this.game.meta;
    if (!meta) return false;
    try {
      // v1.6：不再把对局塔位（先消先得）持久化到 towerUnlocks——每局从 0 塔开始
      wx.setStorageSync(this.storageKey, meta.toJSON());
      return true;
    } catch (e) { return false; }
  }
  /** 清档：删除本地存档（用于设置-清档重开） */
  clear() {
    if (typeof wx === 'undefined') return;
    try {
      if (wx.removeStorageSync) wx.removeStorageSync(this.storageKey);
      else wx.setStorageSync(this.storageKey, null);
      this._blockedKeys.delete(this.storageKey);
      this.lastLoadStatus = 'missing';
    } catch (e) {}
  }
}

module.exports = { SaveManager };
