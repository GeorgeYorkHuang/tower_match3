/**
 * skill-loadout.js —— 主页技能卡 + 技能配置面板（重构 R2：技能配置页面拆分，W工程师）
 *
 * 从 render.js 机械提取（逐行等价，不改交互、不改样式、不改命中键）：
 *   render._menuSkillCards   → skillCards
 *   render._skillOwned       → skillOwned
 *   render._skillChoiceCards → skillChoiceCards
 *   render.menuMatchCfg      → menuMatchCfg
 *   render.menuGlobalCfg     → menuGlobalCfg
 *
 * 设计约束（协作计划 v0.2 §三）：
 *   - 保留 Renderer 入口与原方法签名，子模块用显式依赖注入，避免复制上下文常量、避免循环 require；
 *   - 绘制层只画，不扣款、不发奖、不变更装备（装备与扣费仍由 main.js 处理）；
 *   - 命中区沿用 push(key, data, x, y, w, h)，键名与旧实现完全一致：
 *       matchCfg{slot} / globalCfg{index} / mSkill{slot,id} / globalPage{page} / panelClose（来自面板外壳）
 *
 * 依赖注入（createSkillLoadout）：
 *   panelShell 必填：签名同 render._menuPanelShell(ctx, s, push, title, hgt, centered, pw) → 返回面板顶部 y
 *   skillIcon 选填：签名同 render._skillIcon(ctx, id, x, y, size, color)，缺省用本地兜底图标（仅预览用）
 *   wrapText  选填：签名同 render.wrapText(ctx, str, maxW, size)，缺省用本地兜底换行
 * 未注入时不得静默改变正式外观——Codex 集成时必须把 render 的真实实现传进来。
 */
const CONFIG = require('../../config.js');
const GlobalSkills = require('../../global-skills.js');
const { fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');

/** 兜底图标：圆形底 + 图标首字（仅在未注入 skillIcon 时使用，正式接入不允许走到这里） */
function fallbackSkillIcon(ctx, id, x, y, size, color) {
  const c = color || '#b896ff';
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const label = String(id || '?').charAt(0).toUpperCase();
  text(ctx, label, x, y + size * 0.16, Math.round(size * 0.56), '#ffffff', 'center');
}

/** 兜底换行：逐字测量，规则与 render.wrapText 一致（bold Npx sans-serif） */
function fallbackWrapText(ctx, str, maxW, size) {
  const lines = [];
  if (!str) return [''];
  const font = ctx.font || '';
  ctx.font = `bold ${size}px sans-serif`;
  let cur = '';
  for (const ch of String(str)) {
    const t = cur + ch;
    if (cur && ctx.measureText(t).width > maxW) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  if (font) ctx.font = font;
  return lines.length ? lines : [str];
}

/**
 * 创建技能配置页面绘制器。
 * @param {{panelShell:Function, skillIcon?:Function, wrapText?:Function}} deps
 * @returns {{skillCards:Function, skillOwned:Function, skillChoiceCards:Function, menuMatchCfg:Function, menuGlobalCfg:Function}}
 */
function createSkillLoadout(deps = {}) {
  const panelShell = deps.panelShell;
  const skillIcon = deps.skillIcon || fallbackSkillIcon;
  const wrapText = deps.wrapText || fallbackWrapText;

  /** 主页技能卡一行（三消 3 卡 / 全局 3 槽）：150×200（4:3）+ 左侧竖排逐字标签
   *  原 render._menuSkillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch) */
  function skillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch) {
    const tint = isMatch ? '#b896ff' : '#f4cb79';
    const keys = isMatch ? ['match4', 'match5', 'chain'] : GlobalSkills.slots(cfg);
    const labels = ['四连技能', '高连技能', '连消技能'];
    const gap = 18, ch = Math.min(h, 200), cw = ch * 3 / 4;
    const left = x + 90;
    const labelStep = 28, labelTop = y + (ch - (label.length - 1) * labelStep) / 2;
    Array.from(label).forEach((letter, i) => text(ctx, letter, x + 30, labelTop + i * labelStep, 23, tint, 'center'));
    keys.forEach((key, i) => {
      const id = isMatch ? ((cfg && cfg[key]) || CONFIG.MATCH_SKILL.default[key]) : key;
      const def = isMatch
        ? (CONFIG.MATCH_SKILL[key].find((d) => d.id === id) || { id: 'random', name: '随机抽取' })
        : GlobalSkills.get(id);
      const bx = left + i * (cw + gap), color = def.color || tint;
      text(ctx, isMatch ? labels[i] : '全局槽位 ' + (i + 1), bx + cw / 2, y - 17, 19, '#b4c6df', 'center');
      const grad = ctx.createLinearGradient(bx, y, bx + cw, y + ch);
      grad.addColorStop(0, '#27374e');
      grad.addColorStop(1, '#101b2c');
      fillRoundRect(ctx, bx, y, cw, ch, 20, grad);
      strokeRoundRect(ctx, bx, y, cw, ch, 20, color, 1.8);
      fillRoundRect(ctx, bx + 12, y + 12, cw - 24, 4, 2, color);
      skillIcon(ctx, id, bx + cw / 2, y + 64, 72, color);
      text(ctx, def.name, bx + cw / 2, y + 124, 21, '#f0f5ff', 'center');
      text(ctx, isMatch ? '三消触发' : def.category, bx + cw / 2, y + 153, 15, color, 'center');
      text(ctx, '点击更换  ›', bx + cw / 2, y + ch - 21, 16, '#8fa6c2', 'center');
      push(isMatch ? 'matchCfg' : 'globalCfg', isMatch ? { slot: key } : { index: i }, bx, y, cw, ch);
    });
  }

  /** v5.3c 技能是否已解锁（未购买过时按默认解锁集判定）——纯函数，不读写存档 */
  function skillOwned(s, slot, id) {
    const un = (s.skillUnlocks && s.skillUnlocks[slot]) || [];
    if (un.length) return un.includes(id);
    const defs = CONFIG.SKILL_UNLOCK.defaults[slot] || [];
    return defs.includes(id);
  }

  /** v5.3c 技能配置面板：2 列卡片列表（已解锁点选配置，未解锁点卡购买）
   *  原 render._skillChoiceCards：外壳由注入的 panelShell 绘制，命中键 mSkill{slot,id} */
  function skillChoiceCards(ctx, s, push, title, slot, items, current, tint) {
    if (typeof panelShell !== 'function') {
      throw new Error('skill-loadout: 必须注入 panelShell（render._menuPanelShell）后才能渲染配置面板');
    }
    const oy = panelShell(ctx, s, push, title, 1060);
    text(ctx, '仅显示当前槽位可用技能 · 点击卡片配置', 375, oy + 84, 18, '#9cacc2', 'center');
    const gap = 18, cw = 291, ch = 252;
    items.forEach((it, i) => {
      const x = 75 + (i % 2) * (cw + gap), y = oy + 120 + Math.floor(i / 2) * (ch + 16);
      const owned = skillOwned(s, slot, it.id), selected = it.id === current;
      fillRoundRect(ctx, x, y, cw, ch, 18, selected ? '#26344a' : '#141f30');
      strokeRoundRect(ctx, x, y, cw, ch, 18, selected ? '#f4cb79' : (owned ? tint : '#685640'), selected ? 2.5 : 1.2);
      skillIcon(ctx, it.id, x + cw / 2, y + 46, 60, it.color || tint);
      text(ctx, it.name, x + cw / 2, y + 94, 23, '#f1f5ff', 'center');
      wrapText(ctx, it.desc || '', cw - 36, 18).forEach((ln, j) => text(ctx, ln, x + 18, y + 126 + j * 24, 18, '#adbed3', 'left'));
      fillRoundRect(ctx, x + 14, y + ch - 42, cw - 28, 29, 10, selected ? '#665432' : '#223249');
      const status = selected
        ? (owned ? '✓ 已配置' : '当前槽位 · 待解锁')
        : (owned ? '点击配置' : '解锁 · ' + CONFIG.SKILL_UNLOCK.price[slot] + ' 金币');
      text(ctx, status, x + cw / 2, y + ch - 27, 16, selected ? '#ffe0a0' : '#b9cee7', 'center');
      push('mSkill', { slot, id: it.id }, x, y, cw, ch);
    });
  }

  /** 三消技能槽选择面板（四连 5 + 随机 / 高连 4 / 连消 2），命中键 mSkill{slot,id} */
  function menuMatchCfg(ctx, s, push) {
    const slot = (s.panel && s.panel.slot) || 'match4';
    const names = { match4: '四连技', match5: '高连技', chain: '连消技' };
    if (!CONFIG.MATCH_SKILL[slot] || !names[slot]) return;
    const items = CONFIG.MATCH_SKILL[slot].slice();
    if (slot === 'match4') items.unshift({ id: 'random', name: '随机抽取', desc: '每次触发四消时，从五种四连技能中随机抽取一种。' });
    skillChoiceCards(ctx, s, push, names[slot] + ' · 技能选择', slot, items,
      (s.matchSkills && s.matchSkills[slot]) || CONFIG.MATCH_SKILL.default[slot], '#b896ff');
  }

  /** 全局技能槽选择面板（16 技能 / 3 页 / 双槽互换提示），命中键 mSkill{slot:'global',id} + globalPage{page} */
  function menuGlobalCfg(ctx, s, push) {
    const index = Number(s.panel.index || 0), slots = GlobalSkills.slots(s.globalSkills);
    const page = Math.max(0, Math.min(2, s.panel.page || 0));
    const items = GlobalSkills.POOL.slice(page * 6, page * 6 + 6);
    skillChoiceCards(ctx, s, push, '全局槽位 ' + (index + 1) + ' · 技能选择', 'global', items, slots[index], '#f4cb79');
    text(ctx, '装备与另一槽相同的技能时，自动交换两个槽位', 375, 1197, 16, '#9cacc2', 'center');
    if (page > 0) { button(ctx, 80, 1150, 130, 36, '‹ 上一页'); push('globalPage', page - 1, 80, 1150, 130, 36); }
    text(ctx, (page + 1) + ' / 3', 375, 1168, 20, '#f4cb79', 'center');
    if (page < 2) { button(ctx, 540, 1150, 130, 36, '下一页 ›'); push('globalPage', page + 1, 540, 1150, 130, 36); }
  }

  return { skillCards, skillOwned, skillChoiceCards, menuMatchCfg, menuGlobalCfg };
}

module.exports = { createSkillLoadout, fallbackSkillIcon, fallbackWrapText };
