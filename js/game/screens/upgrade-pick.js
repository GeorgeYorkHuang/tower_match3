'use strict';
const CONFIG = require('../../config.js');
const PickLayout = require('./pick-layout.js');
const { fitDescription } = require('./skill-description-layout.js');
const { roundRect, fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H, L = CONFIG.LAYOUT;
// 仅绘制升级候选卡；激活、分支锁定、pending扣除仍由原Run/effects及点击路由处理。
function createUpgradePick({ drawImg, skillIconSrc, TOWER_TINT, lighten, txtW }) {
  function pickLayer(ctx, group, pending, onPick, reroll) {
    const box = PickLayout.geometry('skill', reroll);
    const { x, y, w, h } = box;
    // 由实际slotY限制窗口底边，保留完整塔区用于查看详情。
    // 入场动效：面板淡入 + 三卡错峰上浮（首次渲染锁定时间基准）
    if (!group._pickT0) group._pickT0 = Date.now();
    const now = Date.now();
    const inT = (now - group._pickT0) / 1000;
    const inK = Math.min(1, inT / 0.28);          // 面板整体淡入
    // 遮罩（透明度 0.42→0.28：面板上移后需让下方防御塔区清晰可见可点）
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    PickLayout.backdrop(ctx, box);
    ctx.globalAlpha = inK;
    // 外层面板使用不透明深色底板，候选卡保持独立卡片背景。
    // const panelBg = ctx.createLinearGradient(0, y, 0, y + h);
    // panelBg.addColorStop(0, '#263341');
    // panelBg.addColorStop(0.52, '#1b2734');
    // panelBg.addColorStop(1, '#111a24');
    // fillRoundRect(ctx, x, y, w, h, 20, panelBg);
    // const panelEdge = ctx.createLinearGradient(x, y, x + w, y + h);
    // panelEdge.addColorStop(0, 'rgba(245,205,112,0.9)');
    // panelEdge.addColorStop(0.5, 'rgba(255,255,255,0.42)');
    // panelEdge.addColorStop(1, 'rgba(245,205,112,0.72)');
    // ctx.strokeStyle = panelEdge; ctx.lineWidth = 2;
    // roundRect(ctx, x, y, w, h, 20); ctx.stroke();
    // strokeRoundRect(ctx, x + 2, y + 2, w - 4, h - 4, 18, 'rgba(255,255,255,0.18)', 1);
    // group.tower 可能是 key 字符串（settlePending 传入），统一解析为 {key, name}
    const tk = typeof group.tower === 'string' ? group.tower : group.tower.key;
    const tName = typeof group.tower === 'string'
      ? (CONFIG.COLORS[CONFIG.TOWERS[tk] && CONFIG.TOWERS[tk].color] || {}).name || tk
      : group.tower.name;
    const tint = TOWER_TINT[tk] || '#3a6ea5';
    const pool = CONFIG.EFFECT_POOLS[tk] || [];
    // 跨塔候选（升级三选一）：按候选 fromTower 查其来源塔的技能池（icon 兜底）
    const defOf = (name, fromTower) => {
      const p = CONFIG.EFFECT_POOLS[fromTower || tk] || [];
      return p.find((q) => q.name === name) || {};
    };
    // ：候选自带两级描述（技能卡=基础 desc；分支卡=分支 a/b/c 文案）
    const descOf = (ef) => ef.desc || defOf(ef.name, ef.fromTower).desc || '';
    //   图标 → 技能名 → 分支标签 → 描述面板 → 确认按钮，互不重叠且描述不压按钮
    // 候选卡片：横向三卡并排；卡框/顶部条/按钮/图标底色 = 所属塔色（用户要求）
    // ：卡片上移 28px 且加高 48px（472→520）；：整体下移 30px（topY = y+94）兼顾下方塔区露出
    const gap = 16;
    const cardW = (w - 56 - gap * 2) / 3;     // (640-56-32)/3 = 184
    const cardH = 520;                        // 原 h-118-70=472 → 520（上下各扩 24/28）
    const topY = y + 94;                      // 原 y+64，整体下移 30px
    group.candidates.forEach((ef, i) => {
      // 两级候选：技能卡（未激活，选中=激活）与分支卡（已激活技能分支，选中=分支 Lv+1）
      const isBranch = ef.type === 'branch';
      const isTarget = i === 0 && !isBranch && ef.name === group.target;
      const upgrading = isBranch;
      // 三态细分：新技能 / 新分支（branchLv 0→1）/ 分支升级（branchLv ≥1）
      const isSkill = !isBranch;
      const isNewBranch = isBranch && (ef.branchLv || 0) === 0;
      const isUpgrade = isBranch && !isNewBranch;
      const targetLv = isBranch ? (ef.branchLv + 1) : 1;   // 选择后达到的等级
      const cd = 0.05 + i * 0.09;
      const ck = Math.min(1, Math.max(0, (inT - cd) / 0.22));
      const cOff = (1 - ck) * 34;
      const cScale = 0.92 + 0.08 * ck;
      const cAlpha = Math.max(0, Math.min(1, ck * 1.6 - 0.3));
      // 卡片呼吸：轻微光晕明暗脉动
      const breathe = 0.5 + 0.5 * Math.sin(now / 420 + i * 2.1);
      const cx = x + 28 + i * (cardW + gap);
      // 来源塔（升级三选一候选可能来自不同塔）：每张卡按各自来源塔独立取色（）
      const fromKey = ef.fromTower || tk;
      const fromName = ef.fromTower
        ? (CONFIG.COLORS[CONFIG.TOWERS[fromKey] && CONFIG.TOWERS[fromKey].color] || {}).name || fromKey
        : tName;
      const fromTint = TOWER_TINT[fromKey] || tint;
      // 来源塔标签：卡片正上方、宽度=卡片宽、仅塔名（去掉「（P1）」类括号后缀）、无圆点、字号 21→31
      //（fromKey/fromName/fromTint 沿用上方已有定义；tName 等可能含「炮塔（P1）」后缀）
      const tagSize = 30;
      const srcTxt = String(fromName || '').replace(/（[^）]*）|\([^)]*\)/g, '');
      const srcX = cx, srcY = topY - 60, srcW = cardW, srcH = 45;   // 标签下移（topY-46），与顶部候选名行错开
      const srcGrad = ctx.createLinearGradient(0, srcY, 0, srcY + srcH);
      srcGrad.addColorStop(0, lighten(fromTint, 1.25));
      srcGrad.addColorStop(1, '#1c2634');
      fillRoundRect(ctx, srcX + 2, srcY + 3, srcW, srcH, 24, 'rgba(0,0,0,0.35)');
      fillRoundRect(ctx, srcX, srcY, srcW, srcH, 24, srcGrad);
      strokeRoundRect(ctx, srcX, srcY, srcW, srcH, 24, 'rgba(255,255,255,0.5)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      fillRoundRect(ctx, srcX + 6, srcY + 4, srcW - 12, 12, 6, ctx.fillStyle);
      // 文字垂直居中（text 的 y 为中线：y = 胶囊中心 srcY+srcH/2）
      text(ctx, srcTxt, cx + cardW / 2, srcY + srcH / 2, tagSize, '#ffffff', 'center');
      // 卡片外发光（呼吸脉动；目标卡金色强呼吸）
      const glowCol = (isTarget && !upgrading) ? '#f7c948' : fromTint;
      const glowA = (isTarget && !upgrading) ? 0.16 + 0.14 * breathe : 0.08 + 0.05 * breathe;
      ctx.globalAlpha = cAlpha * glowA;
      ctx.fillStyle = glowCol;
      ctx.beginPath(); ctx.arc(cx + cardW / 2, topY + cardH / 2, cardW * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = cAlpha;
      // 三张候选卡继续保留卡片底图和玻璃底；仅外层大面板底板透明。
      // fillRoundRect(ctx, cx + 3, topY + 5, cardW, cardH, 16, 'rgba(0,0,0,0.32)');
      // const cardGrad = ctx.createLinearGradient(0, topY, 0, topY + cardH);
      // cardGrad.addColorStop(0, 'rgba(38,50,66,0.75)');
      // cardGrad.addColorStop(1, 'rgba(24,33,44,0.72)');
      // fillRoundRect(ctx, cx, topY, cardW, cardH, 16, cardGrad);
      drawImg(ctx, 'assets/images/interface/cards/skill-choice-v1.png', cx, topY, cardW, cardH);
      // 卡片渐变描边：上亮（塔色）→ 下隐（透明）
      const edgeGrad = ctx.createLinearGradient(0, topY, 0, topY + cardH);
      edgeGrad.addColorStop(0, fromTint);
      edgeGrad.addColorStop(0.55, fromTint + '99');
      edgeGrad.addColorStop(1, fromTint + '22');
      ctx.strokeStyle = edgeGrad; ctx.lineWidth = 2.5;
      roundRect(ctx, cx, topY, cardW, cardH, 16); ctx.stroke();
      strokeRoundRect(ctx, cx + 1.5, topY + 1.5, cardW - 3, cardH - 3, 14, 'rgba(255,255,255,0.10)', 1);  // 卡内高光
      // 卡片暗纹：斜向交叉细线（低透明度，打破大面积纯色）
      ctx.save();
      ctx.globalAlpha = cAlpha * 0.045;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let d = -cardH; d < cardW + cardH; d += 22) {
        ctx.moveTo(cx + d, topY + cardH); ctx.lineTo(cx + d + cardH, topY);
      }
      for (let d = -cardH; d < cardW + cardH; d += 22) {
        ctx.moveTo(cx + cardW + cardH - d, topY + cardH); ctx.lineTo(cx + cardW - d, topY);
      }
      ctx.stroke();
      ctx.restore();
      // 顶部玻璃高光条
      const hiGrad = ctx.createLinearGradient(0, topY, 0, topY + 34);
      hiGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
      fillRoundRect(ctx, cx + 4, topY + 4, cardW - 8, 34, 6, hiGrad);
      // 顶部状态细条：升级=金 / 目标=绿 / 普通=来源塔色
      // fillRoundRect(ctx, cx + 4, topY + 4, cardW - 8, 6, 3, upgrading ? '#f7c948' : (isTarget ? '#27ae60' : fromTint));
      if (isTarget && !upgrading) {
        fillRoundRect(ctx, cx + cardW - 64, topY + 10, 52, 24, 12, 'rgba(39,174,96,0.92)');
        text(ctx, '目标', cx + cardW - 38, topY + 23, 16, '#ffffff', 'center');
      }
      // 来源塔标签已移至卡片正上方，卡内不再绘制塔名条
      // 技能图标区（iconCy=topY+86，六边形徽章 50px，图标 88px 素材区 topY+42~130；
      // 来源塔标签已移至卡外，卡内顶部仅保留「目标」胶囊，与图标区互不重叠）
      const iconCx = cx + cardW / 2, iconCy = topY + 86, ir = 50;
      // 旋转虚线光环（缓慢公转，提示"可选/可强化"）
      ctx.save();
      ctx.translate(iconCx, iconCy);
      ctx.rotate(now / 900 + i * 1.7);
      ctx.setLineDash([7, 9]);
      ctx.globalAlpha = cAlpha * (0.4 + 0.25 * breathe);
      ctx.strokeStyle = fromTint; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, ir + 15, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // 徽章外光晕（呼吸）
      ctx.globalAlpha = cAlpha * (0.16 + 0.12 * breathe);
      ctx.fillStyle = fromTint;
      ctx.beginPath(); ctx.arc(iconCx, iconCy, ir + 13, 0, Math.PI * 2); ctx.fill();
      // 技能素材自带六边形轮廓；仅保留外围光效。
      ctx.globalAlpha = cAlpha;
      // ：技能图标 = 美术图片（100px；垂直居中，水平垂直居中），缺失回退 emoji
      const skImg = drawImg(ctx, skillIconSrc(ef.fromTower, ef.name), iconCx - ir, iconCy - ir, ir * 2, ir * 2);
      if (!skImg) text(ctx, defOf(ef.name, ef.fromTower).icon || (ef.name[0] || '?'), iconCx, iconCy, 52, '#ffffff', 'center');
      // 徽章内流光（斜向亮带缓缓扫过）
      const streak = ((now / 1600 + i * 0.33) % 1);
      ctx.save();
      ctx.beginPath(); ctx.arc(iconCx, iconCy, (ir - 3) * cScale, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = cAlpha * 0.28;
      ctx.fillStyle = '#ffffff';
      const sx0 = iconCx - ir * 2 + streak * ir * 4;
      ctx.beginPath();
      ctx.moveTo(sx0 - 14, iconCy - ir * 1.4); ctx.lineTo(sx0 + 14, iconCy - ir * 1.4);
      ctx.lineTo(sx0 - 4, iconCy + ir * 1.4); ctx.lineTo(sx0 - 32, iconCy + ir * 1.4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = cAlpha;
      // 图标下方三菱形 = 「三选一」标识（金色小菱形横排，随卡呼吸微动）
      const d0 = iconCx - 12, dY = iconCy + ir + 9;
      ctx.save();
      ctx.globalAlpha = cAlpha * (0.8 + 0.2 * breathe);
      for (let k = 0; k < 3; k++) {
        const dx = d0 + k * 12;
        ctx.save();
        ctx.translate(dx, dY);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f7c948';
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = cAlpha;
      // 等级角标（三态：新技能=NEW 黄底 / 新分支=黄底 Lv0 / 升级=暗底当前等级）
      const badgeBg = isUpgrade ? '#2c3542' : '#f7c948';
      fillRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, badgeBg);
      strokeRoundRect(ctx, iconCx + ir - 16, iconCy - ir + 2, 40, 40, 20, 'rgba(255,255,255,0.6)', 1.5);
      text(ctx, isSkill ? 'NEW' : (isNewBranch ? 'Lv0' : `Lv${ef.branchLv}`), iconCx + ir + 4, iconCy - ir + 24, isSkill ? 16 : 19, isUpgrade ? '#ffffff' : '#1a1a1a', 'center');
      // 技能名（金色 40px 大字，nameY=topY+182，与图标底 130 留 12px、与下方标签留 20px）
      const nameY = topY + 188;
      // 分支标签胶囊：新技能/分支标签整体下移 10px（tY = nameY+30）；
      //   分支文字较长（分支名 · LvX → Y）时字号 21→最小 16 自适应，保证胶囊不超出卡片外框
      const tSize = 21;
      // 标签区三态：
      //   学习技能（isSkill） = 「新技能」单胶囊（保持原样）
      //   确认分支（isNewBranch，分支 Lv0→1） = 三个分支名胶囊并排，本次确认的分支金色高亮，其余两个暗色
      //   分支升级（isUpgrade） = 「LvX → LvY」金色单胶囊
      const tagGlow = 0.20 + 0.12 * breathe;
      const tY = nameY + 65;
      if (isNewBranch) {
        const skillCfg = defOf(ef.name, ef.fromTower);
        const brKeys = ['a', 'b', 'c'];
        const brNames = brKeys.map((k) => this.branchName(skillCfg, k));
        const brW = cardW - 16;
        const g1 = 8;
        const bCellW = (brW - g1 * 2) / 3;
        const bH = 34;
        const selIdx = { A: 0, B: 1, C: 2 }[ef.branch] ?? 0;
        brNames.forEach((bn, bi) => {
          const bx = cx + 8 + bi * (bCellW + g1);
          const bSize = bi === selIdx ? 18 : 16;
          if (bi === selIdx) {
            // 金色高亮胶囊 = 本次确认的分支方向
            const tGrad = ctx.createLinearGradient(0, tY, 0, tY + bH);
            tGrad.addColorStop(0, lighten('#f7c948', 1.2));
            tGrad.addColorStop(1, '#d99e16');
            ctx.globalAlpha = cAlpha * tagGlow;
            fillRoundRect(ctx, bx - 2, tY - 2, bCellW + 4, bH + 4, 19, '#f7c948');
            ctx.globalAlpha = cAlpha;
            fillRoundRect(ctx, bx, tY, bCellW, bH, 17, tGrad);
            strokeRoundRect(ctx, bx, tY, bCellW, bH, 17, '#ffedb0', 2);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, '#5c4a00', 'center');
          } else {
            // 另两个分支：暗色普通胶囊
            fillRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(0,0,0,0.35)');
            strokeRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(255,255,255,0.25)', 1);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, 'rgba(255,255,255,0.55)', 'center');
          }
        });
      } else if (isSkill) {
        // 学习技能：单胶囊「新技能」（保持原样）
        const tagTxt = '新技能';
        let tSizeA = tSize;
        let tW = txtW(tagTxt, tSizeA) + 34;
        while (tW > cardW - 20 && tSizeA > 16) { tSizeA -= 1; tW = txtW(tagTxt, tSizeA) + 34; }
        ctx.font = `bold ${tSizeA}px sans-serif`;
        const tX = cx + cardW / 2 - tW / 2;
        fillRoundRect(ctx, tX + 2, tY + 3, tW, 38, 19, 'rgba(0,0,0,0.32)');
        const sGrad = ctx.createLinearGradient(0, tY, 0, tY + 38);
        sGrad.addColorStop(0, lighten(fromTint, 1.25));
        sGrad.addColorStop(1, '#243e57');
        ctx.globalAlpha = cAlpha * tagGlow;
        fillRoundRect(ctx, tX - 3, tY - 3, tW + 6, 44, 22, fromTint);
        ctx.globalAlpha = cAlpha;
        fillRoundRect(ctx, tX, tY, tW, 38, 19, sGrad);
        strokeRoundRect(ctx, tX, tY, tW, 38, 19, 'rgba(255,255,255,0.55)', 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        fillRoundRect(ctx, tX + 5, tY + 3, tW - 10, 10, 5, ctx.fillStyle);
        text(ctx, tagTxt, cx + cardW / 2, tY + 21, tSizeA, '#ffffff', 'center');
      } else {
        // 分支升级（）：三胶囊并排，金色高亮本次升级的分支方向（与确认分支一致），
        //   让玩家明确看到升级的是哪个分支（原单胶囊「LvX → LvY」不显示分支方向）
        const skillCfg = defOf(ef.name, ef.fromTower);
        const brKeys = ['a', 'b', 'c'];
        const brNames = brKeys.map((k) => this.branchName(skillCfg, k));
        const brW = cardW - 16;
        const g1 = 8;
        const bCellW = (brW - g1 * 2) / 3;
        const bH = 34;
        const selIdx = { A: 0, B: 1, C: 2 }[ef.branch] ?? 0;
        brNames.forEach((bn, bi) => {
          const bx = cx + 8 + bi * (bCellW + g1);
          const bSize = bi === selIdx ? 18 : 16;
          if (bi === selIdx) {
            const tGrad = ctx.createLinearGradient(0, tY, 0, tY + bH);
            tGrad.addColorStop(0, lighten('#f7c948', 1.2));
            tGrad.addColorStop(1, '#d99e16');
            ctx.globalAlpha = cAlpha * tagGlow;
            fillRoundRect(ctx, bx - 2, tY - 2, bCellW + 4, bH + 4, 19, '#f7c948');
            ctx.globalAlpha = cAlpha;
            fillRoundRect(ctx, bx, tY, bCellW, bH, 17, tGrad);
            strokeRoundRect(ctx, bx, tY, bCellW, bH, 17, '#ffedb0', 2);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, '#5c4a00', 'center');
          } else {
            fillRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(0,0,0,0.35)');
            strokeRoundRect(ctx, bx + 2, tY + 2, bCellW - 4, bH - 4, 15, 'rgba(255,255,255,0.25)', 1);
            text(ctx, bn, bx + bCellW / 2, tY + bH / 2 + 1, bSize, 'rgba(255,255,255,0.55)', 'center');
          }
        });
      }
      // 技能名稍下移，与图标和塔色描边错开。
      text(ctx, ef.name, cx + cardW / 2 + 1, nameY + 2, 40, 'rgba(0,0,0,0.55)', 'center');
      text(ctx, ef.name, cx + cardW / 2, nameY, 40, '#f7c948', 'center');
      // 描述区玻璃面板（panelY=topY+290，胶囊下方留 22px；字号 21、行距 30，最多 4 行），
      // 按实际字宽换行，完整保留条件与数值；描述与按钮之间留出安全间距。
      const panelY = topY + 290;
      const layout = fitDescription(ctx, descOf(ef), cardW - 24, 144);
      layout.lines.forEach((ln, li) => {
        text(ctx, ln, cx + cardW / 2, panelY + 12 + layout.size / 2 + li * layout.lineHeight, layout.size, '#e6edf5', 'center');
      });
      // 按钮文案（两态）：新技能=学习技能 / 分支（新分支+升级）=确认分支
      const btnW = cardW - 28, btnH = 56, btnX = cx + 14, btnY = topY + cardH - btnH -25;
      const btnCol = upgrading ? '#f7c948' : fromTint;
      const btnDark = upgrading ? '#d99e16' : '#243e57';
      // .9c 三态按钮文案：学习技能（新技能）/ 选择分支（新分支 Lv0→1）/ 确认升级（分支升级）
      const btnTxt = isSkill ? '学习技能' : (isNewBranch ? '确认分支' : '升级分支');
      fillRoundRect(ctx, btnX + 2, btnY + 4, btnW, btnH, 14, 'rgba(0,0,0,0.30)');
      const btnGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnGrad.addColorStop(0, lighten(btnCol, 1.25));
      btnGrad.addColorStop(1, btnDark);
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 14, btnGrad);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 14, 'rgba(255,255,255,0.35)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      fillRoundRect(ctx, btnX + 6, btnY + 5, btnW - 12, 14, 7, ctx.fillStyle);
      text(ctx, btnTxt, btnX + btnW / 2, btnY + btnH / 2, 26, upgrading ? '#5c4a00' : '#ffffff', 'center');
      onPick[i] = { cardRect: {x:cx,y:topY,w:cardW,h:cardH}, hit: (px, py) => px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
    });
    if (reroll) {
      const rx = 230, ry = y + h - 86, rw = 300, rh = 50;
      const affordable = reroll.gold >= reroll.cost;
      fillRoundRect(ctx, rx, ry, rw, rh, 22, affordable ? '#514222' : '#2d343c');
      strokeRoundRect(ctx, rx, ry, rw, rh, 22, affordable ? '#f1cf7d' : '#66717b', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      fillRoundRect(ctx, rx + 20, ry + 5, rw - 40, rh - 35, 7, ctx.fillStyle);
      text(ctx, '重掷 · ' + reroll.cost + ' 银币', 375, ry + rh / 2, 23, affordable ? '#ffe3a0' : '#9da7b1', 'center');
      onPick.reroll = { hit: (px, py) => px >= rx && px <= rx + rw && py >= ry && py <= ry + rh };
    }
    ctx.globalAlpha = 1;
  }

  return { pickLayer };
}
module.exports = { createUpgradePick };
