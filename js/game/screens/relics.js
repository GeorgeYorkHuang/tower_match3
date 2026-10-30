/** R09: relic pages and presentation helpers. No Meta/Run references or asset cache. */
'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
// v1.16.76 圣遗物定义速查表（升星面板用）
const RELIC_DEF_MAP = {};
Object.values(CONFIG.RELIC_RUN.tower).forEach((l) => l.forEach((d) => { RELIC_DEF_MAP[d.id] = d; }));
CONFIG.RELIC_RUN.common.forEach((d) => { RELIC_DEF_MAP[d.id] = d; });

function createRelicScreen(deps = {}) {
  const { drawImg, relicIconSrc, IMG_SRC, TIER_COLOR, fmtNum, panelShell, wrapText } = deps;
  for (const name of ['drawImg', 'relicIconSrc', 'fmtNum', 'panelShell', 'wrapText']) {
    if (typeof deps[name] !== 'function') throw new Error('relics screen missing dependency: ' + name);
  }
  function _relicRunList() {
    const RR = CONFIG.RELIC_RUN;
    const list = [];
    Object.values(RR.tower).forEach((l) => list.push(...l));
    list.push(...RR.common);
    const o = { ssr: 0, sr: 1, r: 2 };   // 图鉴按稀有度降序（金→紫→蓝）
    return list.slice().sort((a, b) => o[CONFIG.relicRarity(a.id)] - o[CONFIG.relicRarity(b.id)]);
  }

  function _relicUnlocked(s, id) { return !!(s.relicStars[id] || s.runCodex[id]);
  }

  function _relicUnlockable(s, id) {
    if (_relicUnlocked(s, id)) return false;
    const need = CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(id)] || 0;
    return need > 0 && (s.shards[id] || 0) >= need;
  }

  function _relicRarColor(rar) { return rar === 'ssr' ? '#f7c948' : rar === 'sr' ? '#a86bff' : '#5dade2';
  }

  function _capsuleBar(ctx, x, y, w, h, ratio, label, colTop, colBot) {
    const r = h / 2;
    fillRoundRect(ctx, x, y, w, h, r, '#0b0f16');
    strokeRoundRect(ctx, x, y, w, h, r, 'rgba(255,255,255,0.16)', 1);
    if (ratio > 0) {
      const fw = Math.max(h, w * Math.min(1, ratio));
      const fg = ctx.createLinearGradient(0, y, 0, y + h);
      fg.addColorStop(0, colTop); fg.addColorStop(1, colBot);
      fillRoundRect(ctx, x, y, fw, h, r, fg);
      fillRoundRect(ctx, x + 4, y + 3, Math.max(r, fw - 8), 5, 2.5, 'rgba(255,255,255,0.45)');   // 立体感：顶部内高光
    }
    text(ctx, label, x + w / 2, y + h / 2 + 1, 17, '#ffffff', 'center');
  }

  function _menuRelicGrid(ctx, s, push, pageKey, showChest) {
    const PER_ROW = 4, PAGE = 16;
    const list = _relicRunList();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const page = Math.min(s.relicDexPage || 0, pages - 1);
    const unlocked = list.filter((d) => _relicUnlocked(s, d.id)).length;
    // v1.16.78 主页保留宝箱入口（原圣物页宝箱区块）
    if (showChest) {
      push('chest', null, 55, 262, 250, 42);
      fillRoundRect(ctx, 55, 262, 250, 42, 10, '#3a2b1a');
      strokeRoundRect(ctx, 55, 262, 250, 42, 10, '#d89e63', 1.2);
      text(ctx, `📦 宝箱 ×${s.chests} 点击开启`, 180, 290, 18, '#ffffff', 'center');
    }
    text(ctx, `圣遗物图鉴 ${unlocked}/${list.length}`, 55, 290, 26, '#ffffff', 'left');
    text(ctx, '未解锁=问号占位 · 点卡查看 1/2/3★效果', 480, 290, 17, '#8ea3b8', 'left');
    const cw = 149, ch = 150, gx = 14, gy = 14;
    const x0 = 55;
    const y0 = showChest ? 336 : 318;
    list.slice(page * PAGE, page * PAGE + PAGE).forEach((d, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      const rx = x0 + col * (cw + gx), ry2 = y0 + row * (ch + gy);
      const rar = CONFIG.relicRarity(d.id);
      const rc = _relicRarColor(rar);
      const owned = _relicUnlocked(s, d.id);
      const star = owned ? (s.relicStars[d.id] || 1) : 0;
      // 卡底：已解锁浅底 / 未解锁黑底 + 稀有度色边
      fillRoundRect(ctx, rx, ry2, cw, ch, 12, owned ? '#141d2a' : '#0b0e14');
      strokeRoundRect(ctx, rx, ry2, cw, ch, 12, rc, owned ? 1.5 : 1);
      // 图标（左上 44px；未解锁用问号）
      const icx = rx + cw / 2, icy = ry2 + 40;
      if (owned) {
        const src = relicIconSrc(d.id);
        if (!(src && drawImg(ctx, src, rx + 14, ry2 + 12, 44, 44))) {
          ctx.beginPath(); ctx.arc(rx + 36, ry2 + 34, 22, 0, Math.PI * 2);
          ctx.fillStyle = rc; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
          text(ctx, d.icon, rx + 36, ry2 + 36, 22, '#ffffff', 'center');
        }
        text(ctx, `${d.name}`, rx + 66, ry2 + 32, 19, '#ffffff', 'left');
        // 星级（右上 ★）
        text(ctx, '★'.repeat(Math.min(star, 3)), rx + cw - 14, ry2 + 30, 17, rc, 'right');
        text(ctx, `${CONFIG.relicRarity(d.id).toUpperCase()}${star > 1 ? ' ' + star + '★' : ''}`, rx + 14, ry2 + 128, 15, rc, 'left');
        text(ctx, d.desc ? d.desc.slice(0, 12) + (d.desc.length > 12 ? '…' : '') : '', rx + 14, ry2 + 72, 14, '#9fb2c3', 'left');
      } else {
        // v1.17.20 未解锁两态：碎片够 → 金框「可解锁」（点击进详情解锁）；不够 → 问号占位
        const needG = CONFIG.DUPLICATE_SHARDS[rar] || 0;
        const shG = s.shards[d.id] || 0;
        if (needG > 0 && shG >= needG) {
          strokeRoundRect(ctx, rx, ry2, cw, ch, 12, '#f7c948', 2.5);
          ctx.beginPath(); ctx.arc(icx, icy, 34, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
          ctx.strokeStyle = '#f7c948'; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, '?', icx, icy + 5, 34, '#ffd34d', 'center');
          text(ctx, '可解锁', rx + cw / 2, ry2 + ch - 26, 16, '#ffd34d', 'center');
        } else {
          ctx.beginPath(); ctx.arc(icx, icy, 34, 0, Math.PI * 2);
          ctx.fillStyle = '#151a22'; ctx.fill();
          ctx.strokeStyle = rc; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, '?', icx, icy + 5, 34, rc, 'center');
          text(ctx, '未解锁', rx + cw / 2, ry2 + ch - 26, 15, '#4a5a6e', 'center');
        }
      }
      // 点击区：已解锁 → 详情；可解锁 → 详情（内含解锁按钮）；未解锁 → 无操作
      const clickableG = owned || _relicUnlockable(s, d.id);
      push(clickableG ? 'relicInfo' : 'relicLock', d.id, rx, ry2, cw, ch);
    });
    // 分页
    text(ctx, `${page + 1}/${pages}`, 375, 985, 18, '#8ea3b8', 'center');
    if (page > 0) { push(pageKey, -1, 280, 970, 56, 34); fillRoundRect(ctx, 280, 970, 56, 34, 10, '#1b2230'); strokeRoundRect(ctx, 280, 970, 56, 34, 10, '#7ca8ff', 1); text(ctx, '‹ 上一页', 308, 993, 15, '#7ca8ff', 'center'); }
    if (page < pages - 1) { push(pageKey, 1, 414, 970, 56, 34); fillRoundRect(ctx, 414, 970, 56, 34, 10, '#1b2230'); strokeRoundRect(ctx, 414, 970, 56, 34, 10, '#7ca8ff', 1); text(ctx, '下一页 ›', 442, 993, 15, '#7ca8ff', 'center'); }
  }

  function menuRelic(ctx, s, push) {
    const list = _relicRunList();
    const unlocked = list.filter((d) => _relicUnlocked(s, d.id)).length;
    // v5.3 深度宝箱槽位（4 格）：从主页移至圣遗物图鉴顶部（解锁进度与卡片整体下移）
    const TIER_ICON = { wood: '🟤', bronze: '🔵', silver: '🟣', gold: '🟡', star: '💎' };
    const slots = s.deepChests || [];
    for (let i = 0; i < 4; i++) {
      const bx = 40 + i * 170, by = 262, bw = 160, bh = 128;
      push('deepChest', i, bx, by, bw, bh);
      const ch = slots[i];
      fillRoundRect(ctx, bx, by, bw, bh, 14, ch ? '#1d2330' : '#141a22');
      strokeRoundRect(ctx, bx, by, bw, bh, 14, ch ? (TIER_COLOR[ch.tier] || '#d89e63') : '#232b36', ch ? 1.6 : 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      fillRoundRect(ctx, bx + 10, by + 6, bw - 20, 12, 6, ctx.fillStyle);
      if (!ch) {
        text(ctx, '📦', bx + bw / 2, by + 48, 30, '#3a4654', 'center');
        text(ctx, '空槽位', bx + bw / 2, by + 84, 18, '#3a4654', 'center');
        text(ctx, '局末按深度获得', bx + bw / 2, by + 110, 14, '#2c3644', 'center');
      } else {
        text(ctx, TIER_ICON[ch.tier] || '📦', bx + bw / 2, by + 44, 28, '#ffffff', 'center');
        text(ctx, ch.name, bx + bw / 2, by + 74, 17, TIER_COLOR[ch.tier] || '#d89e63', 'center');
        if (ch.ready) text(ctx, '✅ 点击开启', bx + bw / 2, by + 102, 17, '#7ef0a3', 'center');
        else {
          const rm = ch.remainMin;
          const rt = rm >= 60 ? `${Math.floor(rm / 60)}时${rm % 60}分` : `${rm}分`;
          text(ctx, `⏳ ${rt}`, bx + bw / 2, by + 102, 16, '#9fb2c3', 'center');
        }
      }
    }
    // 顶部固定区：标题 + 解锁进度条（v5.3 随宝箱上移整体下移 154px）
    text(ctx, '圣遗物图鉴', 55, 448, 32, '#ffffff', 'left');
    const px0 = 250, pw = 460, py = 434;
    fillRoundRect(ctx, px0, py, pw, 24, 12, 'rgba(255,255,255,0.08)');
    const ratio = list.length ? unlocked / list.length : 0;
    if (ratio > 0) {
      const pg = ctx.createLinearGradient(px0, 0, px0 + pw, 0);
      pg.addColorStop(0, '#a86bff'); pg.addColorStop(1, '#f7c948');
      fillRoundRect(ctx, px0, py, Math.max(24, pw * ratio), 24, 12, pg);
    }
    strokeRoundRect(ctx, px0, py, pw, 24, 12, '#a86bff', 1.2);
    text(ctx, `${unlocked} / ${list.length}`, px0 + pw / 2, py + 13, 20, '#ffffff', 'center');
    // 滚动视口
    const vy0 = 484, vy1 = 1492;
    const PER_ROW = 4, cw = 149, ch = 210, gx = 14, gy = 14;
    const rows = Math.ceil(list.length / PER_ROW);
    const contentH = rows * (ch + gy);
    const maxScroll = Math.max(0, contentH - (vy1 - vy0));
    const scroll = Math.max(0, Math.min(s.relicScroll || 0, maxScroll));
    ctx.save();
    ctx.beginPath(); ctx.rect(40, vy0, 670, vy1 - vy0); ctx.clip();
    list.forEach((d, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      const rx = 55 + col * (cw + gx), ry2 = vy0 + row * (ch + gy) - scroll;
      if (ry2 > vy1 || ry2 + ch < vy0) return;   // 视口外跳过
      const rar = CONFIG.relicRarity(d.id);
      const rc = _relicRarColor(rar);
      const owned = _relicUnlocked(s, d.id);
      const icx = rx + cw / 2, icy = ry2 + 70;   // v1.16.88 图标区占上 2/3（高 140），圆心居中
      fillRoundRect(ctx, rx, ry2, cw, ch, 12, owned ? '#141d2a' : '#0b0e14');
      strokeRoundRect(ctx, rx, ry2, cw, ch, 12, rc, owned ? 1.5 : 1);
      if (owned) {
        // 上 2/3：圣遗物图片居中（104px，四周留白）
        const src = relicIconSrc(d.id);
        if (!(src && drawImg(ctx, src, icx - 52, icy - 52, 104, 104))) {
          ctx.beginPath(); ctx.arc(icx, icy, 46, 0, Math.PI * 2);
          ctx.fillStyle = rc; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
          text(ctx, d.icon, icx, icy + 2, 44, '#ffffff', 'center');
        }
        // 星级角标（右上角小字）
        const star = s.relicStars[d.id] || 1;
        text(ctx, '★'.repeat(Math.min(star, 3)), rx + cw - 10, ry2 + 16, 18, rc, 'right');
        // 下 1/3：名字居中 + 胶囊进度条（v1.16.110：h32=文字+原14条高，文字居中胶囊内）
        text(ctx, d.name, icx, ry2 + 150, 24, '#ffffff', 'center');
        const c3 = CONFIG.STAR_UP.cost[star + 1];
        const need3 = c3 ? c3.shards : 0;
        const sh3 = s.shards[d.id] || 0;
        let ratio3, lbl3, ct3, cb3;
        if (star >= 3) { ratio3 = 1; lbl3 = '已满级'; ct3 = '#f6d67c'; cb3 = '#c48a1a'; }
        else if (need3 > 0 && sh3 >= need3) { ratio3 = 1; lbl3 = '可升星'; ct3 = '#f6d67c'; cb3 = '#c48a1a'; }
        else { ratio3 = need3 > 0 ? Math.min(1, sh3 / need3) : 0; lbl3 = `${sh3}/${need3}`; ct3 = '#8fb6ff'; cb3 = '#5b86d6'; }
        _capsuleBar(ctx, rx + 12, ry2 + 170, cw - 24, 32, ratio3, lbl3, ct3, cb3);
      } else {
        // v1.17.20 未解锁两态：碎片已够=可解锁（真图半透明 + 金框 + 「可解锁」角标，点击进详情解锁）
        const thr = CONFIG.DUPLICATE_SHARDS[rar] || 0;
        const sh4 = s.shards[d.id] || 0;
        const canUnlock = thr > 0 && sh4 >= thr;
        if (canUnlock) {
          const src0 = relicIconSrc(d.id);
          ctx.globalAlpha = 0.6;
          if (!(src0 && drawImg(ctx, src0, icx - 52, icy - 52, 104, 104))) {
            ctx.beginPath(); ctx.arc(icx, icy, 46, 0, Math.PI * 2);
            ctx.fillStyle = rc; ctx.globalAlpha = 0.2; ctx.fill();
            ctx.globalAlpha = 0.6;
            text(ctx, d.icon, icx, icy + 2, 44, '#ffffff', 'center');
          }
          ctx.globalAlpha = 1;
          // 金框覆盖原稀有度框
          strokeRoundRect(ctx, rx, ry2, cw, ch, 12, '#f7c948', 2.5);
          text(ctx, d.name, icx, ry2 + 150, 24, '#ffe08a', 'center');
          _capsuleBar(ctx, rx + 12, ry2 + 170, cw - 24, 32, 1, '可解锁', '#f6d67c', '#c48a1a');
          fillRoundRect(ctx, rx + cw - 68, ry2 + 8, 60, 26, 13, '#f7c948');
          text(ctx, '可解锁', rx + cw - 38, ry2 + 21, 15, '#3a2600', 'center');
        } else {
          // 未解锁：? 图标圈（居中于上 2/3 区）
          ctx.beginPath(); ctx.arc(icx, icy, 46, 0, Math.PI * 2);
          ctx.fillStyle = '#151a22'; ctx.fill();
          ctx.strokeStyle = rc; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, '?', icx, icy + 5, 46, rc, 'center');
          text(ctx, '未解锁', icx, ry2 + 150, 24, '#4a5a6e', 'center');
          // 底部：胶囊进度条（v1.16.110，阈值 = DUPLICATE_SHARDS，灰阶填充）
          const r4 = thr > 0 ? Math.min(1, sh4 / thr) : 0;
          _capsuleBar(ctx, rx + 12, ry2 + 170, cw - 24, 32, r4, `${sh4}/${thr}`, '#5a6b80', '#3d4c5e');
        }
      }
      // 命中区裁剪到滚动视口内（防止末行卡片压住底部分页标签，v1.16.85）
      const hy = Math.max(ry2, vy0), hy2 = Math.min(ry2 + ch, vy1);
      // v1.17.20 可解锁卡也进详情面板（在那里点「解锁」按钮，避免误触直接扣碎片）
      const clickable = owned || _relicUnlockable(s, d.id);
      if (hy2 > hy) push(clickable ? 'relicInfo' : 'relicLock', d.id, rx, hy, cw, hy2 - hy);
    });
    ctx.restore();
    // 右侧滚动条（maxScroll>0 时显示）
    if (maxScroll > 0) {
      const vh = vy1 - vy0;
      const th = Math.max(40, vh * vh / contentH);
      const ty = vy0 + (vh - th) * (scroll / maxScroll);
      fillRoundRect(ctx, 734, vy0, 4, vh, 2, 'rgba(255,255,255,0.06)');
      fillRoundRect(ctx, 734, ty, 4, th, 2, 'rgba(124,168,255,0.55)');
    }
    return maxScroll;
  }

  function menuRelicDex(ctx, s, push) {
    panelShell(ctx, s, push, '圣物图鉴', 1020);
    text(ctx, '战斗中获得 · 碎片凑够后可解锁（消耗碎片） · 点卡查看星级效果', 375, 268, 20, '#8ea3b8', 'center');
    _menuRelicGrid(ctx, s, push, 'relicPage', false);
  }

  function menuRelicInfo(ctx, s, push) {
    const id = s.panel.id;
    const d = CONFIG.relicRunDef(id);
    if (!d) return;
    const oy = panelShell(ctx, s, push, '', 840, true, 560);   // v1.17.8 窄面板 560 与卡片同宽
    const rar = CONFIG.relicRarity(id);
    const rc = _relicRarColor(rar);
    const owned = _relicUnlocked(s, id);
    const star = owned ? (s.relicStars[id] || 1) : 0;
    const cardX = (750 - 560) / 2;   // 卡片区 560 宽居中
    // ---- 左上角稀有度徽章（◆ SSR）----
    ctx.save();
    const rg = ctx.createLinearGradient(0, oy + 20, 0, oy + 64);
    rg.addColorStop(0, '#fff2b3'); rg.addColorStop(1, rc);
    fillRoundRect(ctx, cardX, oy + 20, 132, 44, 22, rg);
    ctx.restore();
    strokeRoundRect(ctx, cardX, oy + 20, 132, 44, 22, 'rgba(255,255,255,0.6)', 1.5);
    text(ctx, `◆ ${rar.toUpperCase()}`, cardX + 26, oy + 42, 22, '#2a1a02', 'left');
    // ---- 图标区：无圆底，直接放大图案至 200px 区域 ----
    const gx = 375, gy = oy + 168, dia = 200;
    const src = relicIconSrc(id);
    if (!(src && drawImg(ctx, src, gx - dia / 2, gy - dia / 2, dia, dia))) text(ctx, d.icon, gx, gy, 150, '#ffffff', 'center');
    // ---- 胶囊立体进度条（与图标同宽 200px，内显 shards/need）----
    const shards = s.shards[id] || 0;
    // v1.17.20 未解锁时进度条口径 = 解锁所需碎片（原实现取 STAR_UP.cost[1] 不存在 → 恒显 0/0）
    const unlockNeed = CONFIG.DUPLICATE_SHARDS[rar] || 0;
    const cost = CONFIG.STAR_UP.cost[star + 1];
    const need = owned ? (cost ? cost.shards : 0) : unlockNeed;
    const px0 = gx - 100, py0 = oy + 268, pw = 200, ph = 36;
    fillRoundRect(ctx, px0, py0, pw, ph, 18, 'rgba(20,26,38,0.95)');
    strokeRoundRect(ctx, px0, py0, pw, ph, 18, '#3a4553', 2);
    const pr = need > 0 ? Math.min(1, shards / need) : 0;
    if (pr > 0) {
      const fw = Math.max(16, pw * pr);
      const fg = ctx.createLinearGradient(0, py0, 0, py0 + ph);
      fg.addColorStop(0, '#fff0b8'); fg.addColorStop(0.45, '#ffd34d'); fg.addColorStop(1, '#e0a825');
      fillRoundRect(ctx, px0, py0, fw, ph, 18, fg);
      fillRoundRect(ctx, px0 + 8, py0 + 4, fw - 16, 8, 4, 'rgba(255,255,255,0.55)');
    }
    text(ctx, need > 0 ? `${shards} / ${need}` : (owned && star >= 3 ? 'MAX' : '0 / 0'), gx, py0 + ph / 2 + 1, 20, '#ffffff', 'center');
    // ---- 名称 ----
    text(ctx, d.name, 375, py0 + ph + 14 + 21, 42, '#ffffff', 'center');
    // ---- 3★/2★/1★ 三行（420 宽居中；星标=★★★/★★/★；当前星级高亮）----
    const rw = 420, rx = (750 - rw) / 2, ry0 = py0 + ph + 14 + 48 + 34;
    const cols = [
      { star: '★★★', txt: d.star3 ? d.star3 + (CONFIG.STAR3_ENABLED ? '' : '（后续版本生效）') : '（待接入）', lv: 3 },
      { star: '★★', txt: d.star2 || '（暂无）', lv: 2 },
      { star: '★', txt: d.desc || '（暂无）', lv: 1 },
    ];
    const rh = 84, rgap = 10;
    cols.forEach((c, ci) => {
      const cy0 = ry0 + ci * (rh + rgap);
      const active = owned && star === c.lv;
      fillRoundRect(ctx, rx, cy0, rw, rh, 14, active ? 'rgba(247,201,72,0.12)' : 'rgba(255,255,255,0.045)');
      strokeRoundRect(ctx, rx, cy0, rw, rh, 14, active ? '#f7c948' : 'rgba(255,255,255,0.14)', active ? 2.5 : 1);
      // 星标圆
      const bx = rx + 22, by = cy0 + rh / 2;
      ctx.beginPath(); ctx.arc(bx + 35, by, 35, 0, Math.PI * 2);
      if (active) {
        const sg = ctx.createLinearGradient(0, by - 35, 0, by + 35);
        sg.addColorStop(0, '#ffe9a8'); sg.addColorStop(1, '#f7c948');
        ctx.fillStyle = sg;
      } else { ctx.fillStyle = '#141a26'; }
      ctx.fill();
      ctx.strokeStyle = active ? '#ffe9a8' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2; ctx.stroke();
      text(ctx, c.star, bx + 35, by + 2, c.lv === 3 ? 19 : 24, active ? '#1a1405' : '#9fb2c3', 'center');
      // 效果文字（换行，最多 2 行）
      const lines = wrapText(ctx, c.txt, rw - 108 - 20, 21).slice(0, 2);
      lines.forEach((ln, li) => text(ctx, ln, rx + 108, cy0 + 34 + li * 26, 21, active ? '#ffe9a8' : '#b9c4cf', 'left'));
    });
    // ---- 升级按钮（小号 420×62：升到 N★ + 金币）----
    const btnY = ry0 + 3 * (rh + rgap) + 24;
    if (!owned) {
      // v1.17.20 未解锁：碎片够 → 手动解锁按钮（消耗阈值碎片）；不够 → 进度提示
      if (_relicUnlockable(s, id)) {
        push('relicUnlock', id, rx, btnY, rw, 62);
        const bg = ctx.createLinearGradient(0, btnY, 0, btnY + 62);
        bg.addColorStop(0, '#4b3a15'); bg.addColorStop(1, '#33270e');
        fillRoundRect(ctx, rx, btnY, rw, 62, 16, bg);
        strokeRoundRect(ctx, rx, btnY, rw, 62, 16, '#f7c948', 2.5);
        text(ctx, `解锁 · 消耗 ${unlockNeed} 碎片`, rx + rw / 2, btnY + 31, 24, '#ffd34d', 'center');
      } else {
        text(ctx, `碎片 ${shards}/${unlockNeed} · 战斗中击杀精英/Boss 掉落`, 375, btnY + 31, 22, '#5a6c80', 'center');
      }
    } else if (cost && star < 3) {
      push('relicStar', id, rx, btnY, rw, 62);
      const bg = ctx.createLinearGradient(0, btnY, 0, btnY + 62);
      bg.addColorStop(0, '#4b3a15'); bg.addColorStop(1, '#33270e');
      fillRoundRect(ctx, rx, btnY, rw, 62, 16, bg);
      strokeRoundRect(ctx, rx, btnY, rw, 62, 16, rc, 2.5);
      text(ctx, `升到 ${star + 1}★`, rx + rw / 2 - 66, btnY + 31, 24, '#ffd34d', 'center');
      const coinX = rx + rw / 2 + 46;
      // v1.17 升星消耗金币（局外永久货币）
      if (!drawImg(ctx, IMG_SRC.coin, coinX - 12, btnY + 19, 24, 24)) text(ctx, '🪙', coinX, btnY + 31, 20, '#ffe9a8', 'center');
      text(ctx, fmtNum(cost.gold), coinX + 18, btnY + 31, 22, '#ffe9a8', 'left');
      if (cost.stone) text(ctx, `⭐ ${cost.stone}`, coinX + 120, btnY + 31, 20, '#a86bff', 'center');
    } else {
      text(ctx, '已达满级 3★', 375, btnY + 31, 28, '#f7c948', 'center');
    }
  }

  function menuStarUp(ctx, s, push) {
    panelShell(ctx, s, push, '⭐ 圣遗物升星', 940);
    text(ctx, `星辉石 ×${s.starStones || 0}（金级升 3★ 需要）`, 375, 262, 20, '#a86bff', 'center');
    const ids = Object.keys(s.relicStars || {}).filter((id) => s.relicStars[id] > 0);
    if (!ids.length) {
      text(ctx, '尚未解锁圣遗物', 375, 420, 24, '#8ea3b8', 'center');
      text(ctx, '对局内宝箱三选一获取后即可在此升星', 375, 460, 19, '#5a6c80', 'center');
      return;
    }
    // 排序：可升星的在前（碎片/金币足够），其余按星级升序
    const COST = CONFIG.STAR_UP.cost;
    const canUp = (id) => {
      const cur = s.relicStars[id]; if (cur >= 3) return 0;
      const c = COST[cur + 1];
      return (s.shards[id] || 0) >= c.shards && s.gold >= c.gold ? 1 : 2;
    };
    ids.sort((a, b) => canUp(a) - canUp(b) || s.relicStars[a] - s.relicStars[b]);
    const shown = ids.slice(0, 9);
    let ry = 300;
    shown.forEach((id) => {
      const def = RELIC_DEF_MAP[id] || { name: id, icon: '❔' };
      const star = s.relicStars[id];
      const sh = s.shards[id] || 0;
      const rar = CONFIG.relicRarity(id);
      const rarColor = { r: '#8ea3b8', sr: '#a86bff', ssr: '#f7c948' }[rar];
      const upable = canUp(id) === 1;
      push('relicStar', id, 70, ry, 610, 76);
      fillRoundRect(ctx, 70, ry, 610, 76, 12, upable ? 'rgba(168,107,255,0.10)' : 'rgba(22,29,40,0.9)');
      strokeRoundRect(ctx, 70, ry, 610, 76, 12, upable ? '#a86bff' : '#3a4553', upable ? 1.5 : 1);
      text(ctx, def.icon, 104, ry + 40, 26, '#ffffff', 'center');
      text(ctx, def.name, 140, ry + 30, 22, '#ffffff', 'left');
      text(ctx, '★'.repeat(star) + '☆'.repeat(3 - star), 140, ry + 60, 18, rarColor, 'left');
      if (star >= 3) {
        text(ctx, 'MAX · 质变已激活', 560, ry + 40, 19, '#f7c948', 'center');
      } else {
        const c = CONFIG.STAR_UP.cost[star + 1];
        if (!drawImg(ctx, IMG_SRC.coin, 458, ry + 20, 20, 20)) text(ctx, '🪙', 468, ry + 34, 18, '#f7c948', 'center');
        text(ctx, `碎片 ${sh}/${c.shards} · ${c.gold}`, 486, ry + 30, 18, upable ? '#7ef0a3' : '#8ea3b8', 'left');
        text(ctx, `升 ${star + 1}★ ›`, 620, ry + 58, 18, upable ? '#a86bff' : '#5a6c80', 'center');
      }
      ry += 86;
    });
    if (ids.length > shown.length) text(ctx, `共 ${ids.length} 枚已解锁 · 优先展示可升星项`, 375, ry + 20, 17, '#5a6c80', 'center');
    text(ctx, '2★=效果升级 · 3★=特殊质变（金级需星辉石）', 375, 1080, 17, '#5a6c80', 'center');
  }
  return { _relicRunList, _relicUnlocked, _relicUnlockable, _relicRarColor, _capsuleBar, _menuRelicGrid, menuRelic, menuRelicDex, menuRelicInfo, menuStarUp };
}
module.exports = { createRelicScreen };
