/**
 * skill-loadout.js —— 主页技能卡 + 技能配置面板（重构 R2：技能配置页面拆分，W工程师）
 *
 * 从 render.js 机械提取（逐行等价，不改交互、不改命中键）。视觉验收有一处有意偏差：
 *   面板高度改为随候选行数自适应（panelH），消除候选少时的下部空洞；满页几何不变，见 panelH 注释。
 *   render._menuSkillCards   → skillCards（预览工具仍在用；主页已改用 skillRow）
 *   render._menuSkillRow     → skillRow（主页单行双分区）
 *   render._skillOwned       → skillOwned
 *   render._skillChoiceCards → skillChoiceCards
 *   render.menuMatchCfg      → menuMatchCfg
 *   render.menuGlobalCfg     → menuGlobalCfg
 *
 * 设计约束（协作计划 §三）：
 *   - 保留 Renderer 入口与原方法签名，子模块用显式依赖注入，避免复制上下文常量、避免循环 require；
 *   - 绘制层只画，不扣款、不发奖、不变更装备（装备与扣费仍由 main.js 处理）；
 *   - 命中区沿用 push(key, data, x, y, w, h)，键名与旧实现完全一致：
 *       matchCfg{slot} / globalCfg{index} / mSkill{slot,id} / panelClose（来自面板外壳）
 *       （：globalPage 翻页键下架，全局面板改为视口内惯性滚动）
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
 * @returns {{skillCards:Function, skillRow:Function, skillOwned:Function, skillChoiceCards:Function, menuMatchCfg:Function, menuGlobalCfg:Function}}
 */
function createSkillLoadout(deps = {}) {
  const drawImg = deps.drawImg || (() => false);
  const panelShell = (...args) => {
    const [ctx, state, push, title, height, centered, width] = args;
    const withoutClose = (key, ...rest) => { if (key !== 'panelClose') push(key, ...rest); };
    const oy = deps.panelShell(ctx, state, withoutClose, title, height, centered, width);
    const w = width || 700, x = (750 - w) / 2;
    drawImg(ctx, state.panel && state.panel.type === 'globalCfg' ? 'garden:globalPanel' : 'garden:matchPanel', x, oy, w, height);
    text(ctx, title, 375, oy + 54, 34, '#ffffff', 'center');
    return oy;
  };
  const skillIcon = deps.skillIcon || fallbackSkillIcon;
  const wrapText = deps.wrapText || fallbackWrapText;

  /** 单张技能卡（渐变底 + 描边 + 图标 + 技能名 + 命中区）——skillCards / skillRow 共用，卡片本身不带任何槽位文字 */
  function skillCard(ctx, push, bx, y, cw, ch, id, def, tint, hitKey, hitData) {
    const color = def.color || tint;
    const grad = ctx.createLinearGradient(bx, y, bx + cw, y + ch);
    grad.addColorStop(0, '#334864');
    grad.addColorStop(0.48, '#1d2d43');
    grad.addColorStop(1, '#101827');
    ctx.save();
    ctx.shadowColor = 'rgba(25,54,30,0.35)'; ctx.shadowBlur = 5;
    fillRoundRect(ctx, bx, y + 2, cw, ch - 2, 20, grad);
    ctx.shadowBlur = 0;
    drawImg(ctx, 'assets/images/interface/home/skill-card-garden-v1.png', bx, y, cw, ch);
    ctx.restore();
    skillIcon(ctx, id, bx + cw / 2, y + ch * 0.36, Math.min(86, cw * 0.67), color);
    fillRoundRect(ctx, bx + 7, y + ch - 48, cw - 14, 39, 13, '#ead5a2');
    strokeRoundRect(ctx, bx + 8, y + ch - 47, cw - 16, 37, 12, 'rgba(255,255,255,0.18)', 1);
    text(ctx, def.name, bx + cw / 2, y + ch - 28, 24, '#29422d', 'center');
    push(hitKey, hitData, bx, y, cw, ch);
  }

  /** 主页技能卡一行（三消 2 卡 / 全局 2 槽）：127.5×170（4:3）+ 左侧竖排逐字标签
   *  ：三消下架连消技配置槽（match4/match5 双卡，与全局双槽对齐）
   *  ：主页改用 skillRow（单行双分区），本函数保留给预览工具 / 等价测试
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
      const bx = left + i * (cw + gap);
      text(ctx, isMatch ? labels[i] : '全局槽位 ' + (i + 1), bx + cw / 2, y - 17, 19, '#b4c6df', 'center');
      skillCard(ctx, push, bx, y, cw, ch, id, def, tint, isMatch ? 'matchCfg' : 'globalCfg', isMatch ? { slot: key } : { index: i });
    });
  }

  /**
   * 主页技能配置行（）：单行双分区 —— 左「全局技能」/ 右「三消技能」
   *  · 分区标题居中悬于该区卡片正上方，分组底板把两区在视觉上分开；
   *  · 每区固定 2 张卡，卡片在分区内两边缘对齐、中间均分（分散排布）；
   *  · 卡片上不再出现「四连技能 / 高连技能 / 全局槽位 N」等文字，只留图标 + 技能名。
   *  命中键与旧实现一致：globalCfg{index} / matchCfg{slot}
   *  @param {number} x 整行左缘  @param {number} y 卡片上缘  @param {number} w 整行宽  @param {number} ch 卡片高
   */
  function skillRow(ctx, s, push, x, y, w, ch) {
    const ROW_GAP = 48;                    // 两分区之间的空隙（含各自 8px 内边距 → 观感约 32）
    const rw = (w - ROW_GAP) / 2;          // 单分区宽（640 行宽 → 296）
    const cw = ch * 3 / 4;                 // 卡片 3:4（ch=170 → 127.5×170，尺寸与旧版一致）
    const spread = rw - cw * 2;            // 分区内两卡之间的均分缝（296-255 = 41）
    const regions = [
      { title: '全局技能', tint: '#f4cb79', line: 'rgba(244,203,121,0.30)', rx: x, keys: GlobalSkills.slots(s.globalSkills), isMatch: false },
      { title: '三消技能', tint: '#b896ff', line: 'rgba(184,150,255,0.30)', rx: x + rw + ROW_GAP, keys: ['match4', 'match5'], isMatch: true },
    ];
    regions.forEach((r) => {
      // fillRoundRect(ctx, r.rx - 8, y - 76, rw + 16, ch + 94, 22, 'rgba(0,226,190,0.82)');
      // strokeRoundRect(ctx, r.rx - 8, y - 76, rw + 16, ch + 94, 22, '#89916b', 1.2);
      // fillRoundRect(ctx, r.rx + 18, y - 66, rw - 36, 48, 14, '#f1e4c3');
      // strokeRoundRect(ctx, r.rx + 18, y - 66, rw - 36, 48, 14, r.isMatch ? '#766348' : '#456644', 1.4);
      text(ctx, r.title, r.rx + rw / 2, y - 41, 27, r.isMatch ? '#664721' : '#244c31', 'center');
      r.keys.forEach((key, i) => {
        const id = r.isMatch ? ((s.matchSkills && s.matchSkills[key]) || CONFIG.MATCH_SKILL.default[key]) : key;
        const def = r.isMatch
          ? (CONFIG.MATCH_SKILL[key].find((d) => d.id === id) || CONFIG.MATCH_SKILL[key][0])
          : GlobalSkills.get(id);
        skillCard(ctx, push, r.rx + i * (cw + spread), y, cw, ch, id, def, r.tint,
          r.isMatch ? 'matchCfg' : 'globalCfg', r.isMatch ? { slot: key } : { index: i });
      });
    });
  }

  /** 技能是否已解锁（未购买过时按默认解锁集判定）——纯函数，不读写存档 */
  function skillOwned(s, slot, id) {
    const un = (s.skillUnlocks && s.skillUnlocks[slot]) || [];
    const defs = CONFIG.SKILL_UNLOCK.defaults[slot] || [];
    return defs.includes(id) || un.includes(id);
  }

  /** 视觉验收：面板高度随候选行数自适应——候选少（高连4/连消2/全局末页4）不再拖出大片空洞。
   *  卡片区：oy+120 起，行高 268（252 卡 + 16 缝）；底部留白：带翻页 152（保持原满页几何逐像素不变）/ 不带 48 */
  function panelH(itemCount, withPager) {
    const rows = Math.max(1, Math.ceil(itemCount / 2));
    return 96 + rows * 300 - 16 + (withPager ? 152 : 48);
  }

  /** 统一的高质感候选卡片：图标优先、可读说明、立体状态按钮。 */
  function choiceCard(ctx, push, x, y, cw, ch, it, tint, selected, owned, slot, price) {
    const accent = it.color || tint;
    const bg = ctx.createLinearGradient(x, y, x + cw, y + ch);
    bg.addColorStop(0, selected ? '#3a4658' : '#29384c');
    bg.addColorStop(0.52, selected ? '#202d40' : '#1b293d');
    bg.addColorStop(1, '#121b2a');
    ctx.save();
    ctx.shadowColor = selected ? '#ffdf82' : accent;
    ctx.shadowBlur = selected ? 12 : 6;
    fillRoundRect(ctx, x, y + 2, cw, ch - 2, 20, bg);
    ctx.shadowBlur = 0;
    drawImg(ctx, slot === 'global' ? 'garden:globalCard' : 'garden:matchCard', x, y+2, cw, ch-2);
    fillRoundRect(ctx, x + 5, y + 5, cw - 10, 7, 4, 'rgba(255,255,255,0.15)');
    strokeRoundRect(ctx, x, y + 2, cw, ch - 2, 20, selected ? '#ffe08a' : (owned ? accent : '#7b6952'), selected ? 3 : 1.8);
    strokeRoundRect(ctx, x + 5, y + 7, cw - 10, ch - 14, 15, 'rgba(255,255,255,0.10)', 1);
    ctx.restore();

    // 大图标作为主视觉，技能名与说明分区，卡片底部按钮独立形成明确操作层级。
    skillIcon(ctx, it.id, x + cw / 2, y + 54, 86, accent);
    text(ctx, it.name, x + cw / 2, y + 119, 26, '#f5f8ff', 'center');
    const lines = wrapText(ctx, it.desc || '', cw - 36, 18);
    const maxLines = 5;
    lines.slice(0, maxLines).forEach((ln, j) => text(ctx, ln, x + 18, y + 151 + j * 19, 18, '#d2deef', 'left'));

    const by = y + ch - 47, bh = 37;
    const status = selected
      ? (owned ? '✓ 已配置' : '当前槽位 · 待解锁')
      : (owned ? '点击配置' : '解锁 · ' + price + ' 金币');
    const buttonGrad = ctx.createLinearGradient(x, by, x, by + bh);
    if (selected) { buttonGrad.addColorStop(0, '#f5d37b'); buttonGrad.addColorStop(1, '#9b6a27'); }
    else if (owned) { buttonGrad.addColorStop(0, '#4a6687'); buttonGrad.addColorStop(1, '#263b58'); }
    else { buttonGrad.addColorStop(0, '#8a6237'); buttonGrad.addColorStop(1, '#4a3524'); }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.48)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
    fillRoundRect(ctx, x + 13, by, cw - 26, bh, 12, buttonGrad);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    strokeRoundRect(ctx, x + 13, by, cw - 26, bh, 12, selected ? '#fff0b2' : (owned ? '#9ab9db' : '#d1a566'), 1.5);
    fillRoundRect(ctx, x + 20, by + 3, cw - 40, 4, 2, 'rgba(255,255,255,0.23)');
    ctx.restore();
    text(ctx, status, x + cw / 2, by + bh / 2 + 1, 18, selected ? '#fff9df' : '#ffffff', 'center');
    push('mSkill', { slot, id: it.id }, x, y, cw, ch);
  }

  /** 技能配置面板：2 列卡片列表（已解锁点选配置，未解锁点卡购买）
   *  原 render._skillChoiceCards：外壳由注入的 panelShell 绘制，命中键 mSkill{slot,id}
   *  opts.pager=true 时底部预留翻页区（全局面板用）；返回面板底边 y（供翻页区定位） */
  function skillChoiceCards(ctx, s, push, title, slot, items, current, tint, opts) {
    if (typeof panelShell !== 'function') {
      throw new Error('skill-loadout: 必须注入 panelShell（render._menuPanelShell）后才能渲染配置面板');
    }
    const withPager = !!(opts && opts.pager);
    const hgt = panelH(items.length, withPager);
    const oy = panelShell(ctx, s, push, title, hgt, false, 560);
    const gap = 14, cw = 233, ch = 284;
    const cardLeft = (750 - (cw * 2 + gap)) / 2;
    items.forEach((it, i) => {
      const x = cardLeft + (i % 2) * (cw + gap), y = oy + 96 + Math.floor(i / 2) * (ch + 16);
      const owned = skillOwned(s, slot, it.id), selected = it.id === current;
      choiceCard(ctx, push, x, y, cw, ch, it, tint, selected, owned, slot, CONFIG.SKILL_UNLOCK.price[slot]);
    });
    return oy + hgt;   // 面板底边（翻页区定位用）
  }

  /** 三消技能槽选择面板（四连 5 / 高连 4），命中键 mSkill{slot,id}
   *  ：随机抽取（match4 虚拟选项）下架；连消技不再提供配置入口 */
  function menuMatchCfg(ctx, s, push) {
    const slot = (s.panel && s.panel.slot) || 'match4';
    const names = { match4: '四连技', match5: '高连技' };
    if (!CONFIG.MATCH_SKILL[slot] || !names[slot]) return;
    const items = CONFIG.MATCH_SKILL[slot].slice();
    skillChoiceCards(ctx, s, push, names[slot], slot, items,
      (s.matchSkills && s.matchSkills[slot]) || CONFIG.MATCH_SKILL.default[slot], '#b896ff');
  }

  /** 全局技能选择面板（16 技能单列滚动 · 匀减速惯性，命中键 mSkill{slot:'global',id}）
   *  ：翻页下架 → 视口内下滑浏览全部技能（拖动跟手 + 松手惯性，运动参数复用 config/relic-scroll.js）
   *  滚动态存 s.panel.scrollY（即 game.menuPanel，同一引用）；视口/最大滚动量经返回值交 render 存到
   *  renderer._globalCfgViewport / _globalCfgMaxScroll，供 input/panel-scroll.js 命中与物理更新使用 */
  function menuGlobalCfg(ctx, s, push) {
    const index = Number(s.panel.index || 0), slots = GlobalSkills.slots(s.globalSkills);
    const panelW = 560, gap = 14, cw = 233, ch = 284, rowH = ch + 16;
    const cardLeft = (750 - (cw * 2 + gap)) / 2;
    const items = GlobalSkills.POOL;
    const rows = Math.ceil(items.length / 2);
    const contentH = rows * rowH - 16;
    const viewportH = 3 * rowH - 16;                       // 视口可见 3 行
    const hgt = 96 + viewportH + 24;
    const oy = panelShell(ctx, s, push, '全局技能槽位 ' + (index + 1), hgt, false, panelW);
    const vy0 = oy + 96;
    const maxScroll = Math.max(0, contentH - viewportH);
    const scroll = Math.max(0, Math.min(s.panel.scrollY || 0, maxScroll));
    s.panel.scrollY = scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(115, vy0, 520, viewportH);
    ctx.clip();
    items.forEach((it, i) => {
      const x = cardLeft + (i % 2) * (cw + gap), y = vy0 + Math.floor(i / 2) * rowH - scroll;
      if (y + ch < vy0 - 4 || y > vy0 + viewportH + 4) return;   // 视口外跳过绘制
      const owned = skillOwned(s, 'global', it.id), selected = it.id === slots[index];
      choiceCard(ctx, push, x, y, cw, ch, it, '#f4cb79', selected, owned, 'global', CONFIG.SKILL_UNLOCK.price.global);
    });
    ctx.restore();
    return { viewport: { x: 115, y: vy0, w: 520, h: viewportH }, maxScroll };
  }

  return { skillCards, skillRow, skillOwned, skillChoiceCards, menuMatchCfg, menuGlobalCfg };
}

module.exports = { createSkillLoadout, fallbackSkillIcon, fallbackWrapText };
