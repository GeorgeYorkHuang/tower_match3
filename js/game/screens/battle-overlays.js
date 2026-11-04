'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 仅绘制设置/帮助和撤离决策；开关、保存、返回主菜单、撤离结算仍由原路由处理。
function createBattleOverlays({ fmtNum }) {
  function funcLayer(ctx, layer, s, hits) {
    const w = 640, x = (750 - w) / 2;
    const heights = { setting: 500, help: 1080 };   // 能量规则与宝箱交互说明扩充
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
        '1. 滑动相邻方块消除 3 连，获得对应颜色的塔并为塔充能',
        '2. 塔每次普攻消耗 0.5 能量；能量越高，攻击与攻速越强',
        '3. 能量为 0：攻击力 30%，普攻间隔和周期技能冷却变为 2 倍',
        '4. 能量低于 20 点：攻击力 60%，间隔和周期技能冷却变为 1.5 倍',
        '5. 能量 20–40 点：攻击力逐步恢复至 100%，间隔与技能冷却恢复正常',
        '6. 能量 40–90 点：攻击保持正常；90–100 点：攻击最高提升至 130%，间隔缩短至 70%',
        '7. 塔槽右侧的纵向胶囊显示能量：低于 20 点红色，20–40 点红转绿，40–90 点绿色，90 点以上绿转蓝',
        '8. 消灭精英或 Boss 掉落的宝箱会落地后飞入棋盘；消除宝箱上下左右相邻方块即可领取',
        '9. 消除方块为塔升级，三选一强化技能；怪物抵达城墙后会持续攻城',
        '10. 点底部「商店」购买本局临时强化；银币在战斗结束统一结算，城墙归零则失败',
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

  /** v1.17.50 伤害统计弹层：每塔总伤害 + 普攻/DOT + 各技能等级与伤害（数据 g.run.dmgStat） */
  function dmgStatLayer(ctx, g, hits) {
    const w = 640, x = (750 - w) / 2;
    const stat = (g.run && g.run.dmgStat) || {};
    const towers = (g.sceneState ? g.sceneState().towers : []) || [];
    const skillLvOf = (key, name) => {
      // 技能等级优先取槽内实装 level（v1.11 三选一状态）；无则回退分支最高+1 / combat.lv
      const slot = towers.find((t) => t.key === key);
      const sk = slot && slot.skills && slot.skills.find((q) => q && q.name === name);
      if (sk) return sk.level != null ? sk.level : 1 + Math.max(sk.branches.A || 0, sk.branches.B || 0, sk.branches.C || 0);
      if (g.combat && typeof g.combat.lv === 'function') return g.combat.lv(key, name);
      return 0;
    };
    // 行模型：{ txt, val?, col, big? }——逐塔：头行 / 普攻·DOT / 技能行
    const rows = [];
    towers.forEach((slot) => {
      if (!slot || !slot.key) return;
      const s = stat[slot.key];
      const name = slot.name || slot.key;
      if (!s) { rows.push({ head: name, val: '0' }); return; }
      rows.push({ head: name, lv: slot.level, val: fmtNum(Math.round(s.total)) });
      rows.push({ sub: `普攻 ${fmtNum(Math.round(s.normal))} · DOT ${fmtNum(Math.round(s.dot))}（技能明细含DOT）` });
      const skills = [];
      Object.keys(s.skill).forEach((nm) => { if ((s.skill[nm] || 0) > 0) skills.push(nm); });
      // 已激活但伤害为 0 的技能也展示（等级可见）；用槽内技能表补齐
      if (slot.skills) slot.skills.forEach((sk) => { if (sk && sk.name && sk.level > 0 && !skills.includes(sk.name)) skills.push(sk.name); });
      skills.sort();
      skills.forEach((nm) => rows.push({ skill: nm, lv: skillLvOf(slot.key, nm), val: fmtNum(Math.round(s.skill[nm] || 0)) }));
    });
    // 面板高度预算：标题 74 + 关闭 64 + 行数 × 行高（头 34 / 子 20 / 技能 20），上限 780
    const headH = 74, footH = 64;
    const calc = (row) => (row.head ? 34 : row.sub ? 20 : 20);
    const total = rows.reduce((a, r) => a + calc(r), 0);
    const hgt = Math.min(headH + footH + total, 780);
    const y = (LOGIC_H - hgt) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    hits.bg = { hit: (px, py) => px < x || px > x + w || py < y || py > y + hgt };
    fillRoundRect(ctx, x, y, w, hgt, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, hgt, 18, '#3a6ea5', 3);
    text(ctx, '本局伤害统计', 375, y + 52, 36, '#ffffff', 'center');
    let yy = y + 92;
    const bottom = y + hgt - footH - 12;
    for (const r of rows) {
      if (r.head) {
        text(ctx, `${r.head}${r.lv != null ? ` Lv${r.lv}` : ''}`, x + 36, yy + 20, 24, '#ffd34d', 'left');
        text(ctx, `总伤害 ${r.val}`, x + w - 36, yy + 20, 22, '#7ef0a3', 'right');
        yy += 34;
      } else if (r.sub) {
        if (yy > bottom) break;
        text(ctx, r.sub, x + 52, yy + 12, 17, '#8ea3b8', 'left');
        yy += 20;
      } else {
        if (yy > bottom) break;
        text(ctx, `⚡${r.skill} Lv${r.lv}`, x + 52, yy + 12, 17, '#d7dee6', 'left');
        text(ctx, r.val, x + w - 36, yy + 12, 17, '#ffffff', 'right');
        yy += 20;
      }
    }
    hits.close = button(ctx, x + 150, y + hgt - 60, w - 300, 48, '关闭', { bg: '#3a6ea5', fontSize: 26 });
  }

  return { funcLayer, evacuationLayer, dmgStatLayer };
}
module.exports = { createBattleOverlays };

