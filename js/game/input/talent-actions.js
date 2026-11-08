/**
 * talent-actions.js —— 天赋点击交互：处理镶嵌、卸载、自选圣遗物、详情弹窗及测试入口。
 * 集中校验可选范围与保存结果；羁绊自选只允许图鉴已解锁且品质符合条件的圣遗物。
 */
'use strict';
const T = require('../../talents/model.js');
const CONFIG = require('../../config.js');
const Progression = require('../../relics/progression.js');

// 羁绊件数限制可选品质；碎片尚未解锁的圣遗物不会进入自选池。
function centerCandidates(meta) {
  const a = T.analyze(meta),
    ranks = { r: 1, sr: 2, ssr: 3 };
  if (!a.rank) return [];
  return Object.values(CONFIG.RELIC_RUN.tower)
    .flat()
    .concat(CONFIG.RELIC_RUN.common)
    .filter(
      (d) =>
        (ranks[CONFIG.relicRarity(d.id)] || 99) <= ranks[a.rank] &&
        Progression.starOf(meta, d.id) > 0
    )
    .map((d) => ({ ...d, rarity: CONFIG.relicRarity(d.id), star: Progression.starOf(meta, d.id) }));
}

// 读取旧选择时重新校验，防止卸下红卡或旧存档绕过当前可选范围。
function center(meta) {
  const id = T.normalize(meta).center;
  return centerCandidates(meta).find((c) => c.id === id) || null;
}

// 装配修改统一经过保存入口，失败回滚，并清理已失效的中央自选。
function persist(g, mutate) {
  const old = g.meta.talents;
  const error = mutate();
  if (error) {
    g.meta.talents = old;
    g.toast(error, '#f5ac8e');
    return false;
  }
  const next = T.normalize(g.meta);
  g.meta.talents = next;
  if (!center(g.meta)) next.center = null;
  if (g.save.save() === false) {
    g.meta.talents = old;
    g.toast('保存失败，请重试', '#f5ac8e');
    return false;
  }
  return true;
}

function handle(g, p) {
  const panel = g.menuPanel,
    isPanel = panel && String(panel.type).startsWith('talent');
  if (panel && !isPanel) return false;
  if (g.menuTab !== 'talent' && !isPanel) return false;
  const items = g.menuHits || [];
  if (isPanel) {
    const bounds = items.find((h) => h.key === 'panelBounds');
    if (bounds && !bounds.hit(p.x, p.y)) {
      g.menuPanel = null;
      return true;
    }
  }
  // 当前弹窗只接收自己的操作，避免点击穿透到下方天赋盘。
  const allowed = isPanel
    ? {
        talentSlot: ['talentUnequip', 'talentDetails'],
        talentPicker: ['talentClose', 'talentEquip', 'talentPage', 'talentTestStar'],
        talentDetails: ['talentClose', 'talentReplace'],
        talentNode: ['talentClose'],
        talentSummary: ['talentClose'],
        talentCenter: ['talentClose', 'talentCenterPick', 'talentPage'],
        talentTest: ['talentClose', 'talentTestPreset'],
      }[panel.type] || []
    : [
        'talentSlot',
        'talentNode',
        'talentGold',
        'talentCenter',
        'talentReset',
        'talentTestOpen',
        'talentSummary',
        'talentTestPreset',
      ];
  const hit = items.find((h) => allowed.includes(h.key) && h.hit(p.x, p.y));
  if (!hit) return !!isPanel;
  const { key, data } = hit;
  if (key === 'talentTestOpen') {
    if (g.testProfile) g.menuPanel = { type: 'talentTest' };
    return true;
  }
  if (key === 'talentTestStar') {
    require('../../talents/testing.js').setStar(g, data.id, data.star);
    return true;
  }
  if (key === 'talentTestPreset') {
    require('../../talents/testing.js').applyPreset(g, data);
    return true;
  }
  if (key === 'talentReset') {
    require('../../talents/view.js').reset(g);
    return true;
  }
  if (key === 'talentClose') {
    g.menuPanel = null;
    return true;
  }
  if (key === 'talentSlot') {
    g.menuPanel = { type: 'talentSlot', slot: data, anchor: { x: p.x, y: p.y } };
    return true;
  }
  if (key === 'talentDetails') {
    g.menuPanel = { type: 'talentPicker', slot: data, page: 0, scrollY: 0 };
    return true;
  }
  if (key === 'talentReplace') {
    g.menuPanel = { type: 'talentPicker', slot: data, page: 0, scrollY: 0 };
    return true;
  }
  if (key === 'talentUnequip') {
    if (persist(g, () => T.unequip(g.meta, data))) g.menuPanel = null;
    return true;
  }
  if (key === 'talentEquip') {
    if (persist(g, () => T.equip(g.meta, data.slot, data.id))) {
      g.menuPanel = null;
      g.toast('圣遗物已装配', '#91d99d');
    }
    return true;
  }
  if (key === 'talentPage') {
    const total =
      panel.type === 'talentCenter'
        ? Math.ceil(centerCandidates(g.meta).length / (T.C.centerPageSize || 12))
        : T.candidates(g.meta).length;
    panel.page = Math.max(0, Math.min(Math.max(0, total - 1), (panel.page || 0) + data));
    return true;
  }
  if (key === 'talentSummary') {
    g.menuPanel = { type: 'talentSummary', scrollY: 0 };
    return true;
  }
  if (key === 'talentCenter') {
    g.menuPanel = { type: 'talentCenter', page: 0 };
    return true;
  }
  // 点击确认时再次校验候选资格，不依赖绘制列表时的旧状态。
  if (key === 'talentCenterPick') {
    if (
      persist(g, () => {
        if (!centerCandidates(g.meta).some((c) => c.id === data))
          return '请选择图鉴已解锁且符合羁绊品质的圣遗物';
        const state = T.normalize(g.meta);
        state.center = data;
        g.meta.talents = state;
        return null;
      })
    )
      g.menuPanel = null;
    return true;
  }
  if (key === 'talentNode' || key === 'talentGold') {
    const a = T.analyze(g.meta);
    let description = '',
      kind = 'purple',
      cardName = '';
    if (key === 'talentGold') {
      const id = data && typeof data === 'object' ? a.state.slots[data.slot] : data,
        c = a.cards.find((c) => c.id === id);
      kind = 'gold';
      if (c && a.gold.includes(c.id)) {
        cardName = c.def.gold.name;
        description = c.def.gold.desc;
      } else description = '未镶嵌圣遗物';
    } else {
      const n = T.C.nodes.find((n) => n.id === data);
      if (!n) return true;
      kind = n.type;
      if (n.type === 'green') description = n.desc;
      else if (n.type === 'white') description = '攻击力 +3';
      else {
        const c = a.cards.find((c) => c.def.purpleNode === data);
        if (c) {
          cardName = c.def.name;
          description = c.def.purple.desc;
        } else description = '未镶嵌圣遗物';
      }
    }
    g.menuPanel = { type: 'talentNode', kind, cardName, description, anchor: { x: p.x, y: p.y } };
    return true;
  }

  return true;
}

module.exports = { handle, centerCandidates, center, persist };
