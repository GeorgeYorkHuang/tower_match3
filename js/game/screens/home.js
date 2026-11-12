/** 主页战场选择：章节标题、图标、切换箭头与战斗入口共用逻辑坐标。 */
'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// Presentation only: dependencies are shared helpers, never a player save.
function createHomeScreen({ drawImg, skillRow }) {
  function menuBattle(ctx, s, push) {
    const stage = s.stage || 'ancient';
    const F = CONFIG.FIELDS[stage] || CONFIG.FIELDS.ancient;
    const isTest = stage === 'test';
    const stageOrder=require('../../field-access.js').selectable(s,s.testProfile),stageIndex=stageOrder.indexOf(stage);
    const canPrev=stageIndex>0,canNext=stageIndex<stageOrder.length-1;
    const tint = F.tint;
    // 图标、箭头、名称和入口整体下移 70，给上方章节标题留出空间。
    const iw = 338, ix = 375 - iw / 2, iy = 550;
    const nameY = iy + iw + 42;

    const chapterTitle = F.chapterTitle || (stage === 'abyss' ? '深渊挑战' : '测试战场');
    // 无底板章节标题：字号 29→44，以深绿描边与投影保证草地上的对比度。
    ctx.save();
    ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,28,17,0.70)'; ctx.fillText(chapterTitle, 377, 501);
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#284a30'; ctx.lineWidth = 4;
    ctx.strokeText(chapterTitle, 375, 498);
    const chapterGold = ctx.createLinearGradient(0, 476, 0, 520);
    chapterGold.addColorStop(0, '#fff5ca'); chapterGold.addColorStop(0.5, '#ffe29a'); chapterGold.addColorStop(1, '#d9ae52');
    ctx.fillStyle = chapterGold; ctx.fillText(chapterTitle, 375, 498);
    // 装饰随标题实际宽度向外排布，兼容四字的「圣庭战场」。
    const titleEdge = ctx.measureText(chapterTitle).width / 2 + 28;
    for (const dir of [-1, 1]) {
      const innerX = 375 + dir * titleEdge, outerX = innerX + dir * 66;
      const lineGold = ctx.createLinearGradient(innerX, 498, outerX, 498);
      lineGold.addColorStop(0, 'rgba(255,226,154,0.95)'); lineGold.addColorStop(1, 'rgba(225,195,117,0.12)');
      ctx.strokeStyle = lineGold; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(innerX, 498); ctx.lineTo(outerX, 498); ctx.stroke();
      ctx.save(); ctx.translate(innerX + dir * 13, 498); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f2d28b'; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
    }
    ctx.restore();

    // 命中区先注册箭头再注册战场本体：命中测试按 push 顺序取首个命中，
    // 箭头光晕圈与图标命中区重叠时保证箭头优先。
    const arR = 30, ay = iy + iw / 2, gap = 36;
    const aLx = ix - gap - arR, aRx = ix + iw + gap + arR;
    if(canPrev)push('stagePrev', null, aLx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    if(canNext)push('stageNext', null, aRx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    push('stage', { id: stage }, ix, iy, iw, iw + 62);

    const requirement = s.stageRequirement || '';
    const locked = !!requirement;

    // 战场图标：无背景直出（放大 30% → 338px；锁定态整体压暗）
    ctx.globalAlpha = locked ? 0.4 : 1;
    const badge = drawImg(ctx, F.icon || (isTest ? 'assets/images/interface/home/icon_stage_test.png' : `assets/images/interface/home/icon_stage_${stage}.png`), ix, iy, iw, iw);
    ctx.globalAlpha = 1;
    if (!badge) {
      ctx.beginPath(); ctx.arc(375, iy + iw / 2, iw / 2, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
      text(ctx, isTest ? '🧪' : '🏰', 375, iy + iw / 2 + 12, 130, '#ffffff', 'center');
    }
    // 战场名（：54px 金色渐变 + 立体投影，与页面主标题「圣坛裂痕」同款工艺）
    ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(F.name, 375 + 3, nameY + 4);
    const ng = ctx.createLinearGradient(0, nameY - 27, 0, nameY + 27);
    ng.addColorStop(0, '#fff3c4'); ng.addColorStop(0.45, '#f7c948'); ng.addColorStop(1, '#d99e16');
    ctx.fillStyle = ng;
    ctx.fillText(F.name, 375, nameY);
    // 锁定态：未解锁战场显示 🔒 徽标 + 解锁条件（无面板版：徽标悬浮图标上方）
    if (locked) {
      fillRoundRect(ctx, 375 - 250, iy + 8, 500, 44, 22, 'rgba(0,0,0,0.65)');
      strokeRoundRect(ctx, 375 - 250, iy + 8, 500, 44, 22, '#f0b45c', 1.5);
      text(ctx, requirement, 375, iy + 36, 22, '#f0b45c', 'center');
      const lx=ix+iw/2,ly=iy+iw/2;
      ctx.save();ctx.strokeStyle='#f6d78b';ctx.lineWidth=5;ctx.beginPath();ctx.arc(lx,ly-12,18,Math.PI,0);ctx.stroke();
      fillRoundRect(ctx,lx-29,ly-12,58,46,9,'#f6d78b');
      fillRoundRect(ctx,lx-3,ly+1,6,18,3,'#4b3e29');ctx.restore();
    }

    // ◀ ▶ 战场切换箭头（移到战场图标两侧、保持 36px 间距；垂直对齐图标中心）
    const arrow = (ax, dir) => {
      const isPrev = dir === '‹';   // 修正：左侧朝左=上一个，右侧朝右=下一个
      const glow = 0.10 + 0.06 * Math.sin(Date.now() / 420 + (isPrev ? 0 : 2.1));
      // 呼吸光晕
      ctx.globalAlpha = glow;
      ctx.fillStyle = tint;
      ctx.beginPath(); ctx.arc(ax, ay, arR + 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 底部投影
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(ax + 2, ay + 4, arR, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 渐变圆底
      const abg = ctx.createRadialGradient(ax - arR * 0.35, ay - arR * 0.42, arR * 0.12, ax, ay, arR);
      abg.addColorStop(0, isTest ? '#8f83f5' : '#45d48a');
      abg.addColorStop(0.55, isTest ? '#5a4bc8' : '#23a06a');
      abg.addColorStop(1, isTest ? '#3c2f8f' : '#14694a');
      ctx.fillStyle = abg;
      ctx.beginPath(); ctx.arc(ax, ay, arR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ax, ay, arR, 0, Math.PI * 2); ctx.stroke();
      // 150° 钝角三角楔形箭头（顶角 150°，两底角各 15°：宽扁利落的指向楔形）
      const h = 19;                       // 底边半高
      const d = Math.round(h / Math.tan(Math.PI * 150 / 360));   // 顶点深度 = h / tan75° ≈ 5
      ctx.save();
      ctx.translate(ax, ay);
      // 顶点在 -x 侧，默认朝左；右箭头（›）才镜像
      if (!isPrev) ctx.scale(-1, 1);
      const tg = ctx.createLinearGradient(-d, 0, 6, 0);
      tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#dfe9e2');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-d, 0); ctx.lineTo(6, -h); ctx.lineTo(6, h); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };
    arrow(aLx, '‹');
    arrow(aRx, '›');
    // Capsule entry button and skill rows share their left/right edges.
    // 按钮 440→374（再缩短 15%）；配色固定金色，不随战场切换变色
    const ey = 1020, eh = 80, entryW = 374, entryX = (750 - entryW) / 2;
    push('enter', null, entryX, ey, entryW, eh);
    const bgrad = ctx.createLinearGradient(0, ey, 0, ey + eh);
    bgrad.addColorStop(0, '#f7c948'); bgrad.addColorStop(1, '#d99e16');
    fillRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, bgrad);
    strokeRoundRect(ctx, entryX, ey, entryW, eh, eh / 2, 'rgba(255,255,255,0.4)', 2);
    fillRoundRect(ctx, entryX + 16, ey + 7, entryW - 32, 16, 8, 'rgba(255,255,255,0.22)');
    text(ctx, '⚔ 进入战斗', 375, ey + 46, 36, '#ffffff', 'center');
    if (!isTest && s.firstGoldBonus) {
      const bonus=s.firstGoldBonus;
      fillRoundRect(ctx,130,ey+98,490,44,22,'rgba(18,48,30,0.85)');
      text(ctx,bonus.remaining>0?`本战场每日前2局：深度金币×1.5 · 剩${bonus.remaining}次`:'今日加成已用完 · 深度金币正常×1',375,ey+120,21,'#ffe4a1','center');
    }
    // 技能配置行：单行双分区，随版面整体下移 150（1130→1280）
    skillRow(ctx, s, push, 55, 1280, 640, 170);
    // 移除主界面「测试战场 · 免三消直测技能」入口按钮（战场卡 ◀▶ 切换仍可进入测试战场）
  }
  return { menuBattle };
}
module.exports = { createHomeScreen };
