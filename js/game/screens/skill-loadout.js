/**
 * skill-loadout.js —— 主页技能卡 + 技能配置面板（重构 R2：技能配置页面拆分，W工程师）
 *
 * 从 render.js 机械提取（逐行等价，不改交互、不改命中键）。v1.17 视觉验收有一处有意偏差：
 *   面板高度改为随候选行数自适应（panelH），消除候选少时的下部空洞；满页几何不变，见 panelH 注释。
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
 *       matchCfg{slot} / globalCfg{index} / mSkill{slot,id} / panelClose（来自面板外壳）
 *       （v1.17.45：globalPage 翻页键下架，全局面板改为视口内惯性滚动）
 *
 * 依赖注入（createSkillLoadout）：
 *   panelShell 必填：签名同 render._menuPanelShell(ctx, s, push, title, hgt, centered, pw) → 返回面板顶部 y
 *   skillIcon 选填：签名同 render._skillIcon(ctx, id, x, y, size, color)，缺省用本地兜底图标（仅预览用）
 *   wrapText  选填：签名同 render.wrapText(ctx, str, maxW, size)，缺省用本地兜底换行
 * 未注入时不得静默改变正式外观——Codex 集成时必须把 render 的真实实现传进来。
 */
const CONFIG = require('../../config.js');
const GlobalSkills = require('../../global-skills.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

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

  /** 主页技能卡一行（三消 2 卡 / 全局 2 槽）：127.5×170（4:3）+ 左侧竖排逐字标签
   *  v1.17.45：三消下架连消技配置槽（match4/match5 双卡，与全局双槽对齐）
   *  原 render._menuSkillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch) */
  function skillCards(ctx, s, push, label, cfg, x, y, w, h, isMatch, cardDX = 0) {
    const tint = isMatch ? '#b896ff' : '#f4cb79';
    const keys = isMatch ? ['match4', 'match5'] : GlobalSkills.slots(cfg);
    const labels = ['四连技能', '高连技能'];
    const ch = Math.min(h, 200) * 0.85, cw = ch * 3 / 4;
    const gap = keys.length > 1 ? (w - keys.length * cw) / (keys.length - 1) : 0;
    const left = x + 90 + cardDX;
    const labelStep = 28, labelTop = y + (ch - (label.length - 1) * labelStep) / 2;
    Array.from(label).forEach((letter, i) => text(ctx, letter, x + 30, labelTop + i * labelStep, 23, tint, 'center'));
    keys.forEach((key, i) => {
      const id = isMatch ? ((cfg && cfg[key]) || CONFIG.MATCH_SKILL.default[key]) : key;
      const def = isMatch
        ? (CONFIG.MATCH_SKILL[key].find((d) => d.id === id) || CONFIG.MATCH_SKILL[key][0])
        : GlobalSkills.get(id);
      const bx = left + i * (cw + gap), color = def.color || tint;
      text(ctx, isMatch ? labels[i] : '全局槽位 ' + (i + 1), bx + cw / 2, y - 17, 19, '#b4c6df', 'center');
      const grad = ctx.createLinearGradient(bx, y, bx + cw, y + ch);
      grad.addColorStop(0, '#27374e');
      grad.addColorStop(1, '#101b2c');
      fillRoundRect(ctx, bx, y, cw, ch, 20, grad);
      strokeRoundRect(ctx, bx, y, cw, ch, 20, color, 1.8);
      skillIcon(ctx, id, bx + cw / 2, y + ch * 0.36, 78, color);
      text(ctx, def.name, bx + cw / 2, y + ch * 0.76, 21, '#f0f5ff', 'center');
      push(isMatch ? 'matchCfg' : 'globalCfg', isMatch ? { slot: key } : { index: i }, bx, y, cw, ch);
    });
  }

  /** v5.3c 技能是否已解锁（未购买过时按默认解锁集判定）——纯函数，不读写存档 */
  function skillOwned(s, slot, id) {
    const un = (s.skillUnlocks && s.skillUnlocks[slot]) || [];
    const defs = CONFIG.SKILL_UNLOCK.defaults[slot] || [];
    return defs.includes(id) || un.includes(id);
  }

  /** v1.17 视觉验收：面板高度随候选行数自适应——候选少（高连4/连消2/全局末页4）不再拖出大片空洞。
   *  卡片区：oy+120 起，行高 268（252 卡 + 16 缝）；底部留白：带翻页 152（保持原满页几何逐像素不变）/ 不带 48 */
  function panelH(itemCount, withPager) {
    const rows = Math.max(1, Math.ceil(itemCount / 2));
    return 120 + rows * 268 - 16 + (withPager ? 152 : 48);
  }

  /** v5.3c 技能配置面板：2 列卡片列表（已解锁点选配置，未解锁点卡购买）
   *  原 render._skillChoiceCards：外壳由注入的 panelShell 绘制，命中键 mSkill{slot,id}
   *  opts.pager=true 时底部预留翻页区（全局面板用）；返回面板底边 y（供翻页区定位） */
  function skillChoiceCards(ctx, s, push, title, slot, items, current, tint, opts) {
    if (typeof panelShell !== 'function') {
      throw new Error('skill-loadout: 必须注入 panelShell（render._menuPanelShell）后才能渲染配置面板');
    }
    const withPager = !!(opts && opts.pager);
    const hgt = panelH(items.length, withPager);
    const oy = panelShell(ctx, s, push, title, hgt);
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
    return oy + hgt;   // 面板底边（翻页区定位用）
  }

  /** 三消技能槽选择面板（四连 5 / 高连 4），命中键 mSkill{slot,id}
   *  v1.17.45：随机抽取（match4 虚拟选项）下架；连消技不再提供配置入口 */
  function menuMatchCfg(ctx, s, push) {
    const slot = (s.panel && s.panel.slot) || 'match4';
    const names = { match4: '四连技', match5: '高连技' };
    if (!CONFIG.MATCH_SKILL[slot] || !names[slot]) return;
    const items = CONFIG.MATCH_SKILL[slot].slice();
    skillChoiceCards(ctx, s, push, names[slot] + ' · 技能选择', slot, items,
      (s.matchSkills && s.matchSkills[slot]) || CONFIG.MATCH_SKILL.default[slot], '#b896ff');
  }

  /** 全局技能选择面板（16 技能单列滚动 · 匀减速惯性，命中键 mSkill{slot:'global',id}）
   *  v1.17.45：翻页下架 → 视口内下滑浏览全部技能（拖动跟手 + 松手惯性，运动参数复用 config/relic-scroll.js）
   *  滚动态存 s.panel.scrollY（即 game.menuPanel，同一引用）；视口/最大滚动量经返回值交 render 存到
   *  renderer._globalCfgViewport / _globalCfgMaxScroll，供 input/panel-scroll.js 命中与物理更新使用 */
  function menuGlobalCfg(ctx, s, push) {
    const index = Number(s.panel.index || 0), slots = GlobalSkills.slots(s.globalSkills);
    const gap = 18, cw = 291, ch = 252, rowH = ch + 16;
    const items = GlobalSkills.POOL;
    const rows = Math.ceil(items.length / 2);
    const contentH = rows * rowH - 16;
    const viewportH = 3 * rowH - 16;                       // 视口可见 3 行
    const hintH = 48;                                      // 底部固定提示带
    const hgt = 120 + viewportH + hintH;
    const oy = panelShell(ctx, s, push, '全局槽位 ' + (index + 1) + ' · 技能选择', hgt);
    text(ctx, '仅显示当前槽位可用技能 · 上下滑动浏览', 375, oy + 84, 18, '#9cacc2', 'center');
    const vy0 = oy + 120;
    const maxScroll = Math.max(0, contentH - viewportH);
    const scroll = Math.max(0, Math.min(s.panel.scrollY || 0, maxScroll));
    s.panel.scrollY = scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(55, vy0, 640, viewportH);
    ctx.clip();
    items.forEach((it, i) => {
      const x = 75 + (i % 2) * (cw + gap), y = vy0 + Math.floor(i / 2) * rowH - scroll;
      if (y + ch < vy0 - 4 || y > vy0 + viewportH + 4) return;   // 视口外跳过绘制
      const owned = skillOwned(s, 'global', it.id), selected = it.id === slots[index];
      fillRoundRect(ctx, x, y, cw, ch, 18, selected ? '#26344a' : '#141f30');
      strokeRoundRect(ctx, x, y, cw, ch, 18, selected ? '#f4cb79' : (owned ? '#f4cb79' : '#685640'), selected ? 2.5 : 1.2);
      skillIcon(ctx, it.id, x + cw / 2, y + 46, 60, it.color || '#f4cb79');
      text(ctx, it.name, x + cw / 2, y + 94, 23, '#f1f5ff', 'center');
      wrapText(ctx, it.desc || '', cw - 36, 18).forEach((ln, j) => text(ctx, ln, x + 18, y + 126 + j * 24, 18, '#adbed3', 'left'));
      fillRoundRect(ctx, x + 14, y + ch - 42, cw - 28, 29, 10, selected ? '#665432' : '#223249');
      const status = selected
        ? (owned ? '✓ 已配置' : '当前槽位 · 待解锁')
        : (owned ? '点击配置' : '解锁 · ' + CONFIG.SKILL_UNLOCK.price.global + ' 金币');
      text(ctx, status, x + cw / 2, y + ch - 27, 16, selected ? '#ffe0a0' : '#b9cee7', 'center');
      push('mSkill', { slot: 'global', id: it.id }, x, y, cw, ch);
    });
    ctx.restore();
    text(ctx, '装备与另一槽相同的技能时，自动交换两个槽位', 375, oy + hgt - 24, 16, '#9cacc2', 'center');
    return { viewport: { x: 55, y: vy0, w: 640, h: viewportH }, maxScroll };
  }

  return { skillCards, skillOwned, skillChoiceCards, menuMatchCfg, menuGlobalCfg };
}

module.exports = { createSkillLoadout, fallbackSkillIcon, fallbackWrapText };
