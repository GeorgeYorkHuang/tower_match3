'use strict';
// Pure legacy migration operations; caller supplies an owned snapshot.
// 旧格式可能已携带战场记录；逐级迁移只保留确实存在的字段，不推断通关或赠礼。
function progressFields(data) {
  const result = {};
  for (const key of ['bestWave', 'ancientBestWave', 'normalFieldCleared', 'prologue']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) result[key] = data[key];
  }
  return result;
}
function _renameBounceSkill(d) {
    Object.keys(d.skillCards || {}).forEach((tk) => {
      const sc = d.skillCards[tk];
      if (sc && sc['弹跳'] && !sc['活电']) { sc['活电'] = sc['弹跳']; delete sc['弹跳']; }
    });
    Object.keys(d.towerSkillSlots || {}).forEach((tk) => {
      if (d.towerSkillSlots[tk] === '弹跳') d.towerSkillSlots[tk] = '活电';
    });
    return d;
}

function _renameIceSkills(d) {
    const MAP = { '减速场': '寒霜', '寒潮': '多重冰锥', '霜星': '冰花', '冻结率': '冬珠', '低温全塔': '碎冰', '永冻': '冰墙' };
    Object.keys(d.skillCards || {}).forEach((tk) => {
      const sc = d.skillCards[tk];
      Object.keys(MAP).forEach((old) => {
        if (sc && sc[old] && !sc[MAP[old]]) { sc[MAP[old]] = sc[old]; delete sc[old]; }
      });
    });
    Object.keys(d.towerSkillSlots || {}).forEach((tk) => {
      if (d.towerSkillSlots[tk] && MAP[d.towerSkillSlots[tk]]) d.towerSkillSlots[tk] = MAP[d.towerSkillSlots[tk]];
    });
    return d;
}

function _migrateV1(d) {
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
      ...progressFields(d),
    };
}

function _migrateV2(d) {
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
      ...progressFields(d),
    };
}
module.exports = { _renameBounceSkill, _renameIceSkills, _migrateV1, _migrateV2 };
