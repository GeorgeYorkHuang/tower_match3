'use strict';
const CONFIG = require('../../config.js');
const { roundRect, fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 只负责战斗塔/技能详情绘制；输入优先级、返回与关闭仍由battle-actions管理。
// 图标/配色/文字工具沿用宿主；命中区写入调用方传入的hits。
function createTowerDetails({ drawImg, skillIconSrc, TOWER_TINT, lighten, txtW }) {
  function towerInfoLayer(ctx, info, hits) {
    // v1.16.62 三技能卡横向一排（面板回到适中高度）：卡片 205×320 ×3，元素整体小于竖排版
    const w = 688, hgt = 880, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
    // 遮罩（点遮罩关闭）
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    // 面板：深蓝紫渐变底 + 塔色描边 + 顶部塔色光带（v1.16.11 美化）
    const bgGrad = ctx.createLinearGradient(0, y, 0, y + hgt);
    bgGrad.addColorStop(0, '#2b3340'); bgGrad.addColorStop(1, '#171d26');
    fillRoundRect(ctx, x, y, w, hgt, 18, bgGrad);
    strokeRoundRect(ctx, x, y, w, hgt, 18, TOWER_TINT[info.key] || '#3d4553', 3);
    const band = ctx.createLinearGradient(0, y, w, y);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.15, TOWER_TINT[info.key] || '#3a6ea5');
    band.addColorStop(0.5, '#ffffff');
    band.addColorStop(0.85, TOWER_TINT[info.key] || '#3a6ea5');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 20, y + 8, w - 40, 3);
    ctx.globalAlpha = 1;
    // 标题：塔名 + 塔自身等级（v1.16.70 下移至 y+64，上方留白更多）
    text(ctx, `${String(info.name || '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/塔+$/, '塔')} · 等级 Lv.${info.level}`, x + w / 2, y + 64, 34, '#ffffff', 'center');
    // 攻击 / 攻击间隔 / DPS / 弹药（v1.16.70：外框 648×200 边框 5px；标题标签 17 号下沿贴胶囊上沿；数值 29 号；图标 29 号同强调色）
    const statW = 300, statH = 56, colGap = 20, rowGap = 26;
    const sx0 = x + (w - (statW * 2 + colGap)) / 2;
    // 整体外框：包裹 4 胶囊 + 外部标签（框中心对齐标题下沿与分隔线区间中心）
    const boxX = sx0 - 14, boxY = y + 96, boxW = 648, boxH = 200;
    const bgrad = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
    bgrad.addColorStop(0, 'rgba(255,255,255,0.06)'); bgrad.addColorStop(1, 'rgba(255,255,255,0.015)');
    fillRoundRect(ctx, boxX, boxY, boxW, boxH, 14, bgrad);
    strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 14, `${TOWER_TINT[info.key] || '#3d4553'}44`, 5);
    ctx.globalAlpha = 0.4;
    fillRoundRect(ctx, boxX + 6, boxY + 5, boxW - 12, 14, 7, 'rgba(255,255,255,0.08)');
    ctx.globalAlpha = 1;
    const stats = [
      { label: '攻击', icon: '⚔', val: `${info.atk || 0}`, color: '#f7c948' },
      { label: '间隔', icon: '⏱', val: `${(info.interval || 0).toFixed(1)}s`, color: '#9fb2c3' },
      { label: 'DPS', icon: '🏹', val: `${Math.round(info.dps)}`, color: '#7ea8d8' },
      { label: '能量', icon: '⚡', val: `${Math.floor(info.ammo || 0)}`, color: '#7ef0a3' },
    ];
    stats.forEach((s, si) => {
      const row = Math.floor(si / 2);
      const sx = sx0 + (si % 2) * (statW + colGap);
      const sy = row === 0 ? y + 130 : y + 212;       // 胶囊顶（行距 26：行 1 底 186 与行 2 标签 204 不重叠）
      // 标签：胶囊外部左上方，纯文字无底色（18 号，文字下沿贴齐胶囊上沿：中心 = capTop - 9）
      text(ctx, s.label, sx, row === 0 ? y + 121 : y + 203, 18, s.color, 'left');
      // 胶囊底：浅色玻璃渐变（v1.16.71 内部提亮）+ 塔色描边
      const sg = ctx.createLinearGradient(0, sy, 0, sy + statH);
      sg.addColorStop(0, 'rgba(255,255,255,0.22)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(255,255,255,0.06)');
      fillRoundRect(ctx, sx, sy, statW, statH, statH / 2, sg);
      strokeRoundRect(ctx, sx, sy, statW, statH, statH / 2, `${TOWER_TINT[info.key] || '#3d4553'}99`, 2);
      // 顶部内高光（加亮）
      ctx.globalAlpha = 0.7;
      fillRoundRect(ctx, sx + 8, sy + 4, statW - 16, statH / 2 - 4, (statH / 2 - 4) / 2, 'rgba(255,255,255,0.14)');
      ctx.globalAlpha = 1;
      // 底部暗影（立体感）
      ctx.globalAlpha = 0.25;
      fillRoundRect(ctx, sx + 10, sy + statH - 10, statW - 20, 6, 3, 'rgba(0,0,0,0.25)');
      ctx.globalAlpha = 1;
      // 小图标：胶囊左内侧（垂直居中，与数值同字号、同标签色；弹药为自定义子弹图形）
      if (s.icon === 'bullet') {
        const ix = sx + 26, iy = sy + statH / 2;
        ctx.save(); ctx.translate(ix, iy);
        ctx.fillStyle = 'rgba(222,230,240,0.92)';                       // 弹壳
        fillRoundRect(ctx, -16, -7, 20, 14, 3);
        ctx.fillStyle = s.color;                                        // 弹头（塔色）
        ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(16, 0); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd34d';                                      // 金色底火带
        ctx.fillRect(-16, -3, 20, 6);
        ctx.restore();
      } else {
        text(ctx, s.icon, sx + 26, sy + statH / 2, 29, s.color, 'center');
      }
      // 数值：居中大号 + 同色光晕
      ctx.shadowColor = s.color; ctx.shadowBlur = 10;
      text(ctx, s.val, sx + statW / 2 + 10, sy + statH / 2 - 1, 29, s.color, 'center');
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    });
    // 分隔线
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 310, w - 80, 2);
    // 技能标题 + 提示
    text(ctx, '技能', x + 40, y + 340, 22, '#b8c2cc', 'left');
    text(ctx, '点击技能卡查看详情与升级分支', x + w - 40, y + 340, 14, 'rgba(255,255,255,0.4)', 'right');
    const skills = info.skills || [];
    if (!skills.length) {
      text(ctx, '暂无技能，通过升级三选一获取', x + w / 2, y + 290, 20, 'rgba(255,255,255,0.45)', 'center');
    } else {
      // v1.16.62：3 张技能卡横向一排（宽 205 × 高 320，间隔 16），卡内元素对应缩小：
      //   图标圆 ir 40→30 / 素材 70→52px，技能名 32→26 号，Lv 徽章 38→30 高 22→18 号，
      //   分支徽章 80×68→60×50、字号 18/15→13/12
      const cardW = 205, cardH = 320, gap = 16, cardTop = y + 368;
      const pool = CONFIG.EFFECT_POOLS[info.key] || [];
      const maxLv = 1 + ((CONFIG.EFFECT && CONFIG.EFFECT.maxLevel) || 3); // 分支满 3 级 → 技能 Lv4 = LvMAX
      skills.forEach((sk, i) => {
        const cx = x + 22 + i * (cardW + gap), cy = cardTop;
        hits.skill = hits.skill || [];
        hits.skill[i] = { hit: (px, py) => px >= cx && px <= cx + cardW && py >= cy && py <= cy + cardH };
        // v1.16.11 美化：玻璃渐变卡（左上亮右下暗）+ 底部塔色光晕 + 斜向高光条 + 呼吸描边
        const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
        cardGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
        cardGrad.addColorStop(0.5, 'rgba(30,36,46,0.95)');
        cardGrad.addColorStop(1, 'rgba(18,22,29,0.98)');
        fillRoundRect(ctx, cx, cy, cardW, cardH, 14, cardGrad);
        strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, 'rgba(255,255,255,0.18)', 1.5);
        ctx.save();
        ctx.beginPath(); roundRect(ctx, cx, cy, cardW, cardH, 14); ctx.clip();
        // 底部塔色光晕
        const glow = ctx.createRadialGradient(cx + cardW / 2, cy + cardH - 40, 10, cx + cardW / 2, cy + cardH - 40, 130);
        glow.addColorStop(0, TOWER_TINT[info.key] || '#3a6ea5'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.globalAlpha = 0.28;
        ctx.fillRect(cx, cy, cardW, cardH);
        // 斜向高光条（左上→右下淡白）
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#ffffff';
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.35); ctx.fillRect(-20, -10, cardW * 0.9, 3); ctx.restore();
        ctx.globalAlpha = 1;
        ctx.restore();
        // 呼吸描边高亮
        const brAlpha = 0.14 + 0.08 * Math.sin(Date.now() / 700 + i * 1.3);
        strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, TOWER_TINT[info.key] || '#3a6ea5', brAlpha * 4);
        // 图标（v1.16.63 美化：外圈光晕 + 径向渐变圆底 + 白描边 + 顶部高光；美术素材优先，缺失回退 emoji）
        const skDef = pool.find((q) => q.name === sk.name) || {};
        const icx = cx + cardW / 2, icy = cy + 64, ir = 32;
        const tint = TOWER_TINT[info.key] || '#3a6ea5';
        const halo = ctx.createRadialGradient(icx, icy, 2, icx, icy, ir * 1.9);
        halo.addColorStop(0, lighten(tint, 1.5)); halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(icx, icy, ir * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const grad = ctx.createRadialGradient(icx - ir * 0.3, icy - ir * 0.4, ir * 0.15, icx, icy, ir);
        grad.addColorStop(0, lighten(tint, 1.55)); grad.addColorStop(0.75, lighten(tint, 1.15)); grad.addColorStop(1, tint);
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(icx, icy, ir, 0, Math.PI * 2); ctx.stroke();
        // 顶部高光（小半月）
        ctx.save();
        ctx.beginPath();
        ctx.arc(icx, icy, ir * 0.9, Math.PI * 1.06, Math.PI * 1.52);
        ctx.arc(icx, icy, ir * 0.62, Math.PI * 1.52, Math.PI * 1.06, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fill();
        ctx.restore();
        const skIconOk = drawImg(ctx, skillIconSrc(info.key, sk.name), icx - 28, icy - 28, 56, 56);
        if (!skIconOk) {
          ctx.globalAlpha = 0.35; text(ctx, skDef.icon || (sk.name[0] || '?'), icx + 1, icy + 4, 27, '#000', 'center');
          ctx.globalAlpha = 1;
          text(ctx, skDef.icon || (sk.name[0] || '?'), icx, icy + 3, 27, '#ffffff', 'center');
        }
        // 技能名 + 总等级标（v1.16.64：角标移到图标右上方）
        text(ctx, sk.name, cx + cardW / 2, cy + 126, 26, '#ffffff', 'center');
        const maxBr = Math.max(sk.branches.A || 0, sk.branches.B || 0, sk.branches.C || 0);
        const lvTxt = (1 + maxBr) >= maxLv ? 'LvMAX' : `Lv${1 + maxBr}`;
        const lvS = lvTxt === 'LvMAX' ? 11 : 12;
        const lvW3 = txtW(lvTxt, lvS) + 14, lvX3 = icx + ir - 14, lvY3 = icy - ir - 10;
        const lvG3 = ctx.createLinearGradient(lvX3, lvY3, lvX3, lvY3 + 22);
        lvG3.addColorStop(0, '#ffe08a'); lvG3.addColorStop(1, '#e6b93f');
        fillRoundRect(ctx, lvX3, lvY3, lvW3, 22, 11, lvG3);
        strokeRoundRect(ctx, lvX3, lvY3, lvW3, 22, 11, 'rgba(255,255,255,0.7)', 1);
        text(ctx, lvTxt, lvX3 + lvW3 / 2, lvY3 + 11, lvS, '#5c4a00', 'center');
        // 技能分支 + 等级（v1.16.64：单分支——只显示等级最高的当前分支；金色渐变行 + 左侧色条 + 进度点 + Lv 胶囊）
        const bW = 176, bX = cx + (cardW - bW) / 2, bY = cy + 160, bH = 76;
        const activeBrs = ['A', 'B', 'C'].filter((br) => (sk.branches[br] || 0) > 0);
        if (activeBrs.length) {
          const br = activeBrs.reduce((p, c) => ((sk.branches[c] || 0) > (sk.branches[p] || 0) ? c : p));
          const l = sk.branches[br] || 0;
          const bg = ctx.createLinearGradient(bX, bY, bX, bY + bH);
          bg.addColorStop(0, 'rgba(247,201,72,0.24)'); bg.addColorStop(1, 'rgba(247,201,72,0.07)');
          fillRoundRect(ctx, bX, bY, bW, bH, 12, bg);
          strokeRoundRect(ctx, bX, bY, bW, bH, 12, 'rgba(247,201,72,0.8)', 1.5);
          fillRoundRect(ctx, bX + 8, bY + 12, 5, bH - 24, 2.5, '#f7c948');
          text(ctx, this.branchName(skDef, br), bX + 24, bY + 28, 16, '#f7c948', 'left');
          for (let pi = 0; pi < 3; pi++) {
            const px = bX + 26 + pi * 16, py = bY + 54;
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = pi < l ? '#f7c948' : 'rgba(247,201,72,0.22)'; ctx.fill();
          }
          const lvW2 = txtW(`Lv${l}`, 13) + 16, lvX = bX + bW - 10 - lvW2;
          fillRoundRect(ctx, lvX, bY + 14, lvW2, 30, 15, '#f7c948');
          text(ctx, `Lv${l}`, lvX + lvW2 / 2, bY + 29, 13, '#5c4a00', 'center');
        } else {
          text(ctx, '未选分支', cx + cardW / 2, bY + bH / 2 + 2, 14, 'rgba(255,255,255,0.35)', 'center');
        }
        // 右下角"详情 ›"提示（可点击）
        text(ctx, '详情 ›', cx + cardW - 14, cy + cardH - 16, 15, 'rgba(255,255,255,0.45)', 'right');
      });
    }
    // 关闭按钮
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  /** v1.16.11 技能二级详情面板：点击技能卡打开——技能效果 + 三个分支的详细效果与当前等级（v1.16.30 美化+描述放大两号） */
  function towerSkillLayer(ctx, info, hits) {
    const w = 688, hgt = 720, x = (750 - w) / 2, y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    const bgGrad = ctx.createLinearGradient(0, y, 0, y + hgt);
    bgGrad.addColorStop(0, '#2e2a3e'); bgGrad.addColorStop(1, '#191722');
    fillRoundRect(ctx, x, y, w, hgt, 18, bgGrad);
    strokeRoundRect(ctx, x, y, w, hgt, 18, info.color || '#a55eea', 3);
    const band = ctx.createLinearGradient(0, y, w, y);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, info.color || '#a55eea');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.globalAlpha = 0.5;
    ctx.fillRect(x + 20, y + 8, w - 40, 3);
    ctx.globalAlpha = 1;
    // 标题：技能图标（v1.16.30 美术图）+ 技能名 + Lv
    const tIcon = drawImg(ctx, skillIconSrc(info.towerKey, info.skillName), x + w / 2 - 92, y + 24, 44, 44);
    if (!tIcon) text(ctx, info.icon || '⚔', x + w / 2 - 70, y + 52, 34, '#ffffff', 'center');
    text(ctx, `${info.skillName}`, x + w / 2 + 6, y + 52, 34, '#ffffff', 'center');
    const lvTxt = info.lvMax ? 'LvMAX' : `Lv${info.lv}`;
    const lvW = txtW(lvTxt, 15) + 18;
    fillRoundRect(ctx, x + w / 2 + 92, y + 28, lvW, 24, 12, '#f7c948');
    text(ctx, lvTxt, x + w / 2 + 92 + lvW / 2, y + 41, 15, '#5c4a00', 'center');
    // 技能效果说明（v1.16.30：字号 20→24 并加塔色描边；v1.16.31 改为自动换行最多 2 行，避免超框）
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    fillRoundRect(ctx, x + 40, y + 84, w - 80, 92, 12, 'rgba(255,255,255,0.07)');
    strokeRoundRect(ctx, x + 40, y + 84, w - 80, 92, 12, info.color || '#a55eea', 1);
    const descLines = this.wrapText(ctx, info.desc || '暂无描述', w - 80 - 40, 24).slice(0, 2);
    descLines.forEach((ln, li) => {
      text(ctx, ln, x + w / 2, y + 118 + li * 32, 24, '#e8ecf2', 'center');
    });
    // 分隔 + 分支标题
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 40, y + 196, w - 80, 2);
    text(ctx, '升级分支', x + 40, y + 226, 22, '#b8c2cc', 'left');
    // 三个分支横排卡片：分支名 / 效果文案 / 当前等级（v1.16.47：面板加高、字号放大、卡片美化；v1.16.54：卡内图标/分支名/等级徽章再放大 50%）
    const cardW = 196, cardH = 360, gap = 16, cardTop = y + 268;
    const brs = ['A', 'B', 'C'];
    const names = { A: info.bA || '分支A', B: info.bB || '分支B', C: info.bC || '分支C' };
    brs.forEach((br, i) => {
      const cx = x + 28 + i * (cardW + gap), cy = cardTop;
      const lv = (info.branches && info.branches[br]) || 0;
      const isAct = lv > 0;
      // 卡片底色（激活：暗金渐变；未激活：深色冷灰）
      const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
      cardGrad.addColorStop(0, isAct ? 'rgba(247,201,72,0.16)' : 'rgba(255,255,255,0.06)');
      cardGrad.addColorStop(1, isAct ? 'rgba(247,201,72,0.04)' : 'rgba(24,28,38,0.96)');
      fillRoundRect(ctx, cx, cy, cardW, cardH, 14, cardGrad);
      strokeRoundRect(ctx, cx, cy, cardW, cardH, 14, isAct ? '#f7c948' : 'rgba(255,255,255,0.18)', isAct ? 2.5 : 1.5);
      // 顶部高光条（塔色细线，激活分支金色更亮）
      ctx.fillStyle = isAct ? '#f7c948' : (info.color || '#a55eea');
      ctx.globalAlpha = isAct ? 0.85 : 0.5;
      ctx.fillRect(cx + 16, cy + 6, cardW - 32, 3);
      ctx.globalAlpha = 1;
      // 分支字母圆徽（v1.16.54 放大 50%：r 17→26、字母 18→27）
      ctx.fillStyle = isAct ? '#f7c948' : 'rgba(255,255,255,0.24)';
      ctx.beginPath(); ctx.arc(cx + 40, cy + 48, 26, 0, Math.PI * 2); ctx.fill();
      text(ctx, br, cx + 40, cy + 49, 27, isAct ? '#5c4a00' : '#cfd6df', 'center');
      // 分支名（v1.16.54 放大 50%：20→30 号）
      text(ctx, names[br], cx + cardW / 2, cy + 100, 30, isAct ? '#ffd98a' : '#e8ecf2', 'center');
      // 等级徽章（未选显示"未解锁"）（v1.16.54 放大：46×22→66×32、文字 15→21）
      if (isAct) {
        const bw2 = 66, bh2 = 32;
        fillRoundRect(ctx, cx + cardW - 88, cy + 16, bw2, bh2, 16, '#f7c948');
        text(ctx, `Lv${lv}`, cx + cardW - 55, cy + 31, 21, '#5c4a00', 'center');
      } else {
        text(ctx, '未解锁', cx + cardW - 60, cy + 31, 21, 'rgba(255,255,255,0.40)', 'right');
      }
      // 分隔线
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx + 14, cy + 118, cardW - 28, 2);
      // 分支效果文案（v1.16.47：20→24 号、行距 28→34、最多 6 行，激活分支金色高亮）
      const txt = info.branchDesc[br] || names[br];
      const lines = this.wrapText(ctx, txt, cardW - 18, 24);
      lines.slice(0, 6).forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, cy + 146 + li * 34, 24, isAct ? '#f1e6b8' : '#c6d0da', 'center');
      });
    });
    // 返回按钮（回到塔详情）
    hits.back = button(ctx, x + 150, y + hgt - 74, w - 300, 54, '返回', { bg: info.color || '#a55eea', fontSize: 24 });
  }

  return { towerInfoLayer, towerSkillLayer };
}
module.exports = { createTowerDetails };
