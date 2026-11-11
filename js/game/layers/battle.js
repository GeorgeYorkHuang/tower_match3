'use strict';
const CONFIG = require('../../config.js');
const GlobalSkills = require('../../global-skills.js');
const GS_BALANCE = require('../../config/global-balance.js');
const { roundRect, fillRoundRect, strokeRoundRect, text, progressBar } = require('../ui.js');
const L = CONFIG.LAYOUT;
const EnergyCapsule = require('../energy-capsule.js');
const CONFIG_BOSS = require('../../config/bosses.js').altar_galvin;
// 场景组件只绘制与登记命中；Main仍决定层级，点击和技能释放仍归原路由。
function createBattleScene({ drawImg, IMG_SRC, drawTowerGlyph, AREA_X, AREA_Y, AREA_W, ENTRY_H, WALL_Y, TOWER_ROW_Y, BOARD_Y }) {
  function actionArea(ctx, s) {
    // 行动区背景图（y128 起 720 高 = 怪物行走区）；按战场切换主题背景；加载失败回退深色底
    const aaSrc = s && require('../../prologue.js').chapter(s.stage) ? 'assets/images/interface/battle/field_bg_prologue.jpg' : (s && (s.stage === 'lava' || s.stage === 'frost' || s.stage === 'abyss'))
      ? `assets/images/interface/battle/field_bg_${s.stage}.jpg` : IMG_SRC.actionArea;
    if (!drawImg(ctx, aaSrc, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y + ENTRY_H, AREA_W, WALL_Y - AREA_Y - ENTRY_H, 8, '#151a21');
    }
    this.entryStatus(ctx,s);
    if (s.bossEncounter && s.bossEncounter.id === 'altar_vera') {
      const q = s.bossEncounter, e = q.members[0];
      const B = require('../../config/bosses.js').altar_vera;
      text(ctx, B.name + ' · ' + B.phaseNames[q.phase - 1], 375, AREA_Y + ENTRY_H + 16, 17, '#ffd17b', 'center');
      if (e) {
        progressBar(ctx, 190, AREA_Y + ENTRY_H + 28, 380, 11, Math.max(0, e.hp / e.maxHp), '#dcac5c', '#30253d');
        ctx.strokeStyle = '#fff0be'; ctx.lineWidth = 2;
        for (const mark of B.thresholds) { ctx.beginPath(); ctx.moveTo(190 + 380 * mark, AREA_Y + ENTRY_H + 27); ctx.lineTo(190 + 380 * mark, AREA_Y + ENTRY_H + 40); ctx.stroke(); }
        const summon = Math.max(0, q.nextSummonAt - q.elapsed).toFixed(1);
        const status = q.phase === 3 ? '裂痕 ' + Math.max(0, q.nextRiftAt - q.elapsed).toFixed(1) + 's' : q.phase === 2 ? '庇护 ' + Math.round(e.armor * 100) + '%' : '播种';
        text(ctx, status + ' · 召唤 ' + summon + 's', 375, AREA_Y + ENTRY_H + 57, 15, '#f3d9b1', 'center');
      }
    } else if (s.bossEncounter && s.bossEncounter.id === 'altar_galvin') {
      const group = s.bossEncounter;
      text(ctx, '双生圣像·迦尔文 · ' + (group.phase === 1 ? '圣像本体' : '双体裂生'), 375, AREA_Y + ENTRY_H + 16, 16, '#ead3ff', 'center');
      const members = group.members;
      members.forEach((e, i) => {
        const x = members.length === 1 ? 220 : 140 + i * 250;
        const w = members.length === 1 ? 338 : 220;
        progressBar(ctx, x, AREA_Y + ENTRY_H + 28, w, 9, Math.max(0, e.hp / e.maxHp), '#ba82e7', '#30253d');
        if (members.length > 1) text(ctx, '圣像' + (i + 1) + (e.hp <= 0 ? ' · 已击败' : ''), x + w / 2, AREA_Y + ENTRY_H + 48, 13, '#d1c393', 'center');
      });
      const echo = Math.max(0, group.nextEchoAt - group.elapsed).toFixed(1);
      let info = '圣坛回响 ' + echo + 's';
      if (group.phase === 2) info = '共鸣 ' + group.resonanceStacks + '/' + CONFIG_BOSS.resonanceMax + ' · ' + info;
      if (group.firstDeathAt !== null) info = group.syncExpired ? '同步超时 · 独存圣像已回复' : '同步击破 ' + Math.max(0, CONFIG_BOSS.syncWindow - (group.elapsed - group.firstDeathAt)).toFixed(1) + 's';
      text(ctx, info, 375, AREA_Y + ENTRY_H + (group.phase === 1 ? 48 : 68), 15, group.firstDeathAt !== null ? '#ffda82' : '#d1c393', 'center');
    }
    // 塔位区（即城墙，先画背景）
    this.towerRow(ctx, s);
    // 防线血条（移至塔位区底部，覆盖在塔位区背景之上）
    this.wall(ctx, s.lineHp, s.lineMaxHp, undefined, s.globalShield);
    // 棋盘（传入 _shake 支持消除抖动）
    this.board(ctx, s.grid, s.selected, s.anim, s._shake, s.stage, s.boardHint, s.boardChestHoles);
    // 底部功能键区（棋盘下方）
    this.funcBar(ctx, s);
    // 局内商店面板已移至 main.js render 流程的敌人/特效层之后绘制（否则怪物贴图浮在面板上方），不再在此处调用
  }

  function wall(ctx, hp, maxHp, barY, shield) {
    // 塔位区即城墙：防线血条画在塔位区底部（塔位区整体上移，独立城墙区移除）
    // barY 可选：默认塔位区底部；测试战场传入其塔位行上方 y（保持旧防线位置）
    const barH = 14;
    const by = barY !== undefined ? barY : (TOWER_ROW_Y + L.towerRow.h - barH);
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    // 槽（深棕阴影底 + 淡描边）
    fillRoundRect(ctx, AREA_X, by, AREA_W, barH, 7, '#241a12');
    strokeRoundRect(ctx, AREA_X, by, AREA_W, barH, 7, 'rgba(255,255,255,0.18)', 1);
    // 血量填充（分级变色）
    if (ratio > 0) {
      const barCol = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff5252';
      fillRoundRect(ctx, AREA_X + 2, by + 2, Math.max(2, (AREA_W - 4) * ratio), barH - 4, 5, barCol);
    }
    if (shield > 0) {
      fillRoundRect(ctx,AREA_X,by-8,AREA_W*Math.min(1,shield/GS_BALANCE.barrier.shield),5,2,'#86caff');
      text(ctx,'护盾 '+Math.ceil(shield),AREA_X+AREA_W-5,by-18,16,'#a6e8ff','right');
    }
    // 血量数字（血条内居中）
    text(ctx, `${Math.max(0, Math.ceil(hp))}`, AREA_X + AREA_W / 2, by + barH / 2 + 1, 15, '#ffffff', 'center');
  }

  function funcBar(ctx, s) {
    const fy = BOARD_Y + L.boardArea.h;           // 1524
    const h = L.funcBar.h;                        // 102
    fillRoundRect(ctx, 0, fy, 750, h, 0, '#131820');
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, fy, 750, 2);
    // 底部功能条三键：设置 / 帮助 / 商店（商店改入分页栏，点击弹出面板）
    const labels = s.showBattleShop === false ? ['⚙ 设置', 'ℹ 帮助'] : ['⚙ 设置', 'ℹ 帮助', '🛒 商店'];
    const keys = s.showBattleShop === false ? ['setting', 'help'] : ['setting', 'help', 'shop'];
    const kw = 150, kh = 80;
    const gap = (750 - labels.length * kw) / (labels.length + 1);
    this.funcHits = [];
    for (let i = 0; i < labels.length; i++) {
      const x = gap + i * (kw + gap);
      const y = fy + (h - kh) / 2;
      // 美化：渐变玻璃底 + 顶部高光 + 白描边 + 图标/文字两行
      const bgrad = ctx.createLinearGradient(0, y, 0, y + kh);
      bgrad.addColorStop(0, '#2a3342'); bgrad.addColorStop(1, '#1b222e');
      fillRoundRect(ctx, x + 2, y + 3, kw, kh, 14, 'rgba(0,0,0,0.28)');
      fillRoundRect(ctx, x, y, kw, kh, 14, bgrad);
      strokeRoundRect(ctx, x, y, kw, kh, 14, 'rgba(255,255,255,0.16)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      fillRoundRect(ctx, x + 6, y + 4, kw - 12, 16, 8, ctx.fillStyle);
      text(ctx, labels[i].split(' ')[0], x + kw / 2, y + 42, 26, '#d7dee6', 'center');
      text(ctx, labels[i].split(' ')[1], x + kw / 2, y + 66, 17, '#8ea3b8', 'center');
      this.funcHits.push({ key: keys[i], x, y, w:kw, h:kh, hit: (px, py) => px >= x && px <= x + kw && py >= y && py <= y + kh });
    }
    // 加速按钮：城墙上方 · 怪物移动区右下角
    // 去底色/描边/阴影/辅助文字：仅保留 ⏩ 图标 + ×N 倍数（颜色随档位：×1 暗灰 / ×2 金 / ×3+ 橙）
    const spX = 750 - 16 - 124, spY = WALL_Y - 8 - 66, spW = 124, spH = 66;
    const spdCol = s.runSpeed >= 4 ? '#ff8c42' : s.runSpeed >= 2 ? '#f7c948' : '#3a4552';
    this._speedBadge(ctx,spX,spY,spW,spH,s.runSpeed||1);
    this.speedHit = { hit: (px, py) => px >= spX && px <= spX + spW && py >= spY && py <= spY + spH };
    // 伤害统计按钮：怪物行动区左下角（与加速按钮对称）
    const dsX = AREA_X + 16, dsY = WALL_Y - 8 - 66, dsW = 124, dsH = 66;
    this._dmgStatBadge(ctx, dsX, dsY, dsW, dsH);
    this.dmgStatHit = { hit: (px, py) => px >= dsX && px <= dsX + dsW && py >= dsY && py <= dsY + dsH };
  }

  function towerRow(ctx, s, count, showGlobal) {
    const towers = s.towers;
    const slotCount = count || this.ly.slotCount; // 测试战场传 6；正式战斗默认 4
    const { slotSize, slotGap, slotY } = this.ly;
    // 塔位区背景图（石板放置地面）；加载失败回退浅色条
    if (!drawImg(ctx, IMG_SRC.towerRow, 0, TOWER_ROW_Y, 750, L.towerRow.h)) {
      fillRoundRect(ctx, AREA_X, TOWER_ROW_Y, AREA_W, L.towerRow.h, 8, 'rgba(255,255,255,0.05)');
    }
    text(ctx, '塔位', AREA_X + 14, TOWER_ROW_Y + 24, 18, 'rgba(255,255,255,0.4)');
    // .10e：2 个全局技能 + N 个塔槽按当前顺序（左洗牌 → 塔槽×N → 右补给）x 轴等间距（slotGap）居中排列
    const showG = showGlobal !== false && s.showGlobal !== false;
    const itemN = showG ? slotCount + 2 : slotCount;
    const totalX = itemN * slotSize + (itemN - 1) * slotGap;
    const x0 = (750 - totalX) / 2;
    let x = x0 + (showG ? slotSize + slotGap : 0);
    for (let i = 0; i < slotCount; i++) {
      const tw = towers[i] || null;
      const spawning = tw && tw.activationHidden;
      if (spawning) { x += slotSize + slotGap; continue; }

      // 槽体完全透明（无底色）；空槽 = 半透明灰色蒙版（无文字提示）
      if (!tw) {
        // Empty tower slots are transparent.
      } else {
        // 塔图标（32×32 居中，图片优先，回退自绘几何图形——emoji 在部分 canvas 环境不渲染）
        const ix = x + (slotSize - L.towerIcon.size) / 2;
        const iy = slotY + (slotSize - L.towerIcon.size) / 2 - 2;
        if (!drawImg(ctx, IMG_SRC[tw.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
          drawTowerGlyph(ctx, tw.key, ix, iy, L.towerIcon.size);
        }
        // ：去掉槽底 Lv 文字；等级由弹药柱条 + 塔本体表现
        // 弹药条：图标右侧纵向柱状（自下而上填充，ammo/ammoMax），无弹药红色警示
        const aRatio = tw.ammoMax > 0 ? Math.min(1, (tw.ammo || 0) / tw.ammoMax) : 0;
        const bx = x + slotSize - 17;
        const by0 = slotY + 8;
        const bh = slotSize - 16;
        EnergyCapsule.draw(ctx, bx, by0, 13, bh, aRatio);
        // ：移除单塔经验条（经验整体化，经验条在出怪区上方）
      }
      x += slotSize + slotGap;
    }
    // .10e 全局技能充能条：与塔槽同尺寸（100×100）、与塔同 y，与 4 塔槽按 x 轴等间距（slotGap）居中
    //   左=全局洗牌，右=弹药补给；累计充能每 chargePerUse 点 = 1 格（横向 3 段，上限 3 格）
    // 测试战场（showGlobal=false）不渲染全局技能按钮
    if (showG) {
      const sz = this.ly.slotSize;
      const perUse = Math.max(1, s.chargePerUse || 30);
      const shuCells = Math.min(3, ((s.shuffleAmmo || 0) / perUse));
      const refCells = Math.min(3, ((s.refillAmmo || 0) / perUse));
      this._equippedGlobalSlots = s.globalSlots || ['shuffle','refill'];
      this.globalBtns = [
        this._globalBtn(ctx, 'shuffle', '', (GlobalSkills.get((s.globalSlots||['shuffle','refill'])[0])||{}).name||'洗牌', x0, this.ly.slotY, sz, sz, shuCells, '#ff8c42'),
        this._globalBtn(ctx, 'refill', '', (GlobalSkills.get((s.globalSlots||['shuffle','refill'])[1])||{}).name||'补给', x0 + (slotCount + 1) * (slotSize + slotGap), this.ly.slotY, sz, sz, refCells, '#7ef0a3'),
      ];
    } else {
      this.globalBtns = [];
    }
  }

  function _globalBtn(ctx, key, icon, name, bx, by, bw, bh, filled, tint) {
    const maxCells = 3;
    const ready = filled >= 1;
    // ：不再用整体半透明压暗；未充能改为图标上覆盖半透明灰蒙版（图标本体不透明）
    // 背景：未充能 = 无背景色；已充能 = 主题色渐变背景（替换底色）
    if (ready) {
      const bg = ctx.createLinearGradient(0, by, 0, by + bh);
      bg.addColorStop(0, tint + '66');
      bg.addColorStop(1, tint + '30');
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = bg; ctx.fill();
    }
    const skillId=(this._equippedGlobalSlots||['shuffle','refill'])[key==='shuffle'?0:1];
    // 图标按槽位68%绘制（在80%基础上再缩小15%），顶部留白；胶囊居中于图标下沿与槽位下沿之间
    const iconSz = Math.min(bw, bh) * 0.68;
    const iconTop = by + bh * 0.08;
    this._skillIcon(ctx,skillId,bx+bw/2,iconTop+iconSz/2,iconSz,(GlobalSkills.get(skillId)||{}).color||tint);
    // 横向 3 段充能条（从左到右；每段满 = 1 次释放）
    const segW = 24, segH = 12, segGap = 8;
    const sx0 = bx + (bw - (maxCells * segW + (maxCells - 1) * segGap)) / 2;
    const iconBottom = iconTop + iconSz;
    const sy0 = (iconBottom + by + bh) / 2 - segH / 2;
    for (let i = 0; i < maxCells; i++) {
      const sx = sx0 + i * (segW + segGap);
      const progress=Math.max(0,Math.min(1,filled-i));
      fillRoundRect(ctx,sx,sy0,segW,segH,6,'#253039');
      if(progress>0)fillRoundRect(ctx,sx,sy0,segW*progress,segH,Math.min(6,segW*progress/2),progress>=1?'#62df97':'#f4cd52');
      strokeRoundRect(ctx,sx,sy0,segW,segH,6,progress>=1?'#b0f3cc':'#8f814a',1);
    }

    ctx.globalAlpha = 1;
    return { key, x: bx, y: by, w: bw, h: bh };
  }

  function _speedBadge(ctx,x,y,w,h,speed) {
    const accent=speed>1?'#f5ce73':'#99c8d5';
    ctx.save();ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=0;i<2;i++){const cx=x+w/2-24+i*10,cy=y+h/2;ctx.beginPath();ctx.moveTo(cx-4,cy-7);ctx.lineTo(cx+3,cy);ctx.lineTo(cx-4,cy+7);ctx.stroke();}
    ctx.restore();text(ctx,'×'+speed,x+w/2+18,y+h/2,22,accent,'center');
  }

  /** 伤害统计按钮（行动区左下角） */
  function _dmgStatBadge(ctx,x,y,w,h) {
    fillRoundRect(ctx,x,y,w,h,12,'rgba(38,46,58,0.55)');
    strokeRoundRect(ctx,x,y,w,h,12,'rgba(255,255,255,0.14)',1.5);
    text(ctx,'📊',x+30,y+h/2,30,'#99c8d5','center');
    text(ctx,'统计',x+68,y+h/2+1,24,'#d7dee6','center');
  }
  return { actionArea, wall, funcBar, towerRow, _globalBtn, _speedBadge, _dmgStatBadge };
}
module.exports = { createBattleScene };
