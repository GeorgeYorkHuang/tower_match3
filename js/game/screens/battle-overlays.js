'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 仅绘制设置/帮助和撤离决策；开关、保存、返回主菜单、撤离结算仍由原路由处理。
function createBattleOverlays({ fmtNum }) {
  function funcLayer(ctx, layer, s, hits) {
    const w = 640, x = (750 - w) / 2;
    const heights = { setting: 500, help: 900 };   // v1.16.89 帮助面板加高容纳大字号换行；v1.16.107 设置面板加声音开关行
    const hgt = heights[layer.type] || 560;
    const y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    fillRoundRect(ctx, x, y, w, hgt, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, hgt, 18, '#3a6ea5', 3);
    const title = { setting: '设置', help: '帮助' }[layer.type] || '';
    text(ctx, title, 375, y + 52, 36, '#ffffff', 'center');
    if (layer.type === 'setting') {
      text(ctx, `版本 ${layer.version || 'v1.0.0'}`, 375, y + 118, 22, '#9fb2c3', 'center');
      // v1.16.107 声音开关行
      const sndOn = layer.soundOn !== false;
      text(ctx, '🔊 音效与背景音乐', x + 96, y + 176, 24, '#dfe6ee', 'left');
      hits.sound = button(ctx, x + 400, y + 148, 144, 56, sndOn ? '开' : '关', { bg: sndOn ? '#2b6d4f' : '#45505f', fontSize: 26 });
      // v1.16.107 重新开始（不清档）
      text(ctx, '重新开始将返回主界面重开一局：', 375, y + 240, 20, 'rgba(255,255,255,0.7)', 'center');
      text(ctx, '塔等级 · 金币 · 解锁进度全部保留', 375, y + 272, 20, 'rgba(255,255,255,0.55)', 'center');
      hits.confirm = button(ctx, x + 120, y + 306, 400, 70, '重新开始', { bg: '#2b6d4f', fontSize: 28 });
    } else if (layer.type === 'help') {
      // v1.16.89 帮助文档：字号加大（23px）、行距压缩、长句自动换行不出框
      const lines = [
        '1. 滑动相邻方块消除 3 连，获得对应颜色的塔并补充能量',
        '2. 塔每次普攻消耗 0.5 能量；能量耗尽时伤害降为 50%，技能周期延长',
        '3. 消除方块为塔升级，三选一强化技能（周期技能施放需消耗能量）',
        '4. 怪物到达城墙后开始攻城，城墙持续掉血',
        '5. 消灭一波全部怪物自动进入下一波；每 5 波有 Boss 镇守',
        '6. Boss 与精英怪掉落宝箱，点击开启获得圣遗物三选一',
        '7. 战斗中点底部功能条「商店」用局内银币购买本局临时强化',
        '8. 局内银币在战斗结束统一结算为金币（招财符可加成）',
        '9. 城墙血量归零即失败，注意防守',
      ];
      let hy = y + 90;
      lines.forEach((ln) => {
        const ls = this.wrapText(ctx, ln, w - 90, 24).slice(0, 3);
        const bh = ls.length * 30 + 12;
        fillRoundRect(ctx, x + 30, hy, w - 60, bh, 10, '#1d242e');
        ls.forEach((t2, li) => text(ctx, t2, x + 46, hy + 20 + li * 30, 24, '#d7dee6', 'left'));
        hy += bh + 6;
      });
    }
    hits.close = button(ctx, x + 150, y + hgt - 84, w - 300, 56, layer.type === 'setting' ? '返回主菜单' : '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  function evacuationLayer(ctx, g, hits) {
    const w = 620, h = 470, x = (750 - w) / 2, y = (LOGIC_H - h) / 2 - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 暗金主窗口（呼应圣遗物三选一的显现仪式感）
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2a2112'); bg.addColorStop(1, '#1d1a10');
    fillRoundRect(ctx, x, y, w, h, 20, bg);
    strokeRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 23, '#c8860a', 3);
    strokeRoundRect(ctx, x, y, w, h, 20, '#ffd34d', 1.5);
    text(ctx, `撤离决策 · 第 ${g.run.wave} 波`, 375, y + 64, 38, '#ffd34d', 'center');
    text(ctx, '深度收益池（撤离可全取，阵亡只保底 30%）', 375, y + 116, 21, '#c9b98a', 'center');
    // 收益池
    fillRoundRect(ctx, x + 50, y + 142, w - 100, 88, 14, 'rgba(247,201,72,0.10)');
    strokeRoundRect(ctx, x + 50, y + 142, w - 100, 88, 14, 'rgba(247,201,72,0.4)', 1);
    text(ctx, `💰 ${fmtNum(Math.round(g.depthPool))}`, 375, y + 182, 34, '#f7c948', 'center');
    text(ctx, `当前深度倍率 ×${g.depthMult.toFixed(2)}${g.run.wave < CONFIG.EVAC.lateWave ? `（继续 ×${CONFIG.EVAC.depthMult}）` : `（继续 ×${CONFIG.EVAC.depthMultLate}，收益递减期）`}`, 375, y + 212, 17, '#9fb2c3', 'center');
    // 里程碑预览
    const nextM = CONFIG.MILESTONES.find((m) => m > g.run.wave);
    if (nextM) text(ctx, `🏆 下一里程碑：${nextM} 波（首达一次大奖）`, 375, y + 256, 18, '#a86bff', 'center');
    // 按钮
    // v1.16.86 修复：button() 返回 {hit} 对象，dispatchTouch 按 .hit 调用；此前误存裸函数导致按钮永不命中
    hits.evacGo = button(ctx, x + 50, y + 292, w - 100, 76, '🚪 正常撤离 · 拿走 100%', { bg: '#2b6d4f', fontSize: 27 });
    hits.evacStay = button(ctx, x + 50, y + 382, w - 100, 76, '⚔ 继续前进 · 正常进入下一波', { bg: '#3a6ea5', fontSize: 25 });
  }

  return { funcLayer, evacuationLayer };
}
module.exports = { createBattleOverlays };
