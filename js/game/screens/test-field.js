'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H, L = CONFIG.LAYOUT;
const EnergyCapsule = require('../energy-capsule.js');
// 只绘制测试战场/技能面板；权限、单塔切换、状态注入、刷怪和返回仍由原逻辑处理。
function createTestFieldScreen({ drawImg, IMG_SRC, relicIconSrc, drawTowerGlyph, STATUS_H, AREA_X, AREA_Y, AREA_W, ENTRY_H, WALL_Y }) {
  function testFieldLayer(ctx, s, hits, enemies, fx, combat, damageNumbers) {
    const items = [];
    const push = (id, data, x, y, w, h) => items.push({ id, data, rect: { x, y, w, h }, hit: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h });
    // 背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    // 状态条（v1.16.30 整体下移避开灵动岛）
    const tgrad = ctx.createLinearGradient(0, 0, 0, STATUS_H);
    tgrad.addColorStop(0, '#16233a'); tgrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = tgrad; ctx.fillRect(0, 0, 750, STATUS_H);
    push('tf_back', null, 8, 52, 80, 60);
    fillRoundRect(ctx, 16, 60, 64, 44, 10, 'rgba(255,255,255,0.1)');
    text(ctx, '◀', 48, 91, 28, '#ffffff', 'center');
    text(ctx, '测试战场', 320, 80, 26, '#ffffff', 'center');
    text(ctx, '城墙无敌 · 弹药恒满 · 免三消', 375, 104, 15, '#8ea3b8', 'center');
    push('tf_speed', null, 630, 54, 112, 56);
    const spdCol = s.speed >= 4 ? '#ff8c42' : s.speed >= 2 ? '#f7c948' : '#5b6b7c';
    this._speedBadge(ctx,636,58,100,48,s.speed);
    // v1.16.113 测试战场：本局圣遗物行（注入即显示；★3 角标 = 3★ 质变生效；点击查看详情）
    const rels = s.battleRelics || [];
    if (rels.length) {
      const rx = 130, ry = 116, rIcon = 24, rGap = 30, rMax = 10;
      const shown = rels.slice(0, rMax);
      shown.forEach((rc, i) => {
        const icx = rx + i * rGap + rIcon / 2;
        ctx.beginPath(); ctx.arc(icx, ry + rIcon / 2, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        const rSrc = relicIconSrc(rc.id);
        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 14, '#ffffff', 'center');
        }
        if (rc.star3) {
          fillRoundRect(ctx, icx + 8, ry - 3, 18, 13, 6, '#ffb347');
          text(ctx, '★3', icx + 17, ry + 10, 10, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length} 点图标看详情`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 15, 'rgba(255,255,255,0.6)', 'left');
      this.relicBarHit = { x: rx, y: ry - 8, w: shown.length * rGap + 96, h: Math.min(rIcon + 16, AREA_Y + ENTRY_H - (ry - 8)) };
    } else {
      this.relicBarHit = null;
    }
    // 行动区底
    if (!drawImg(ctx, IMG_SRC.actionArea, 0, AREA_Y + ENTRY_H, 750, WALL_Y - (AREA_Y + ENTRY_H))) {
      fillRoundRect(ctx, AREA_X, AREA_Y + ENTRY_H, AREA_W, WALL_Y - AREA_Y - ENTRY_H, 8, '#151a21');
    }
    // 入口带
    fillRoundRect(ctx, AREA_X, AREA_Y, AREA_W, ENTRY_H, 8, '#1f2732');
    text(ctx, `敌人 ${s.enemyCount} 只`, AREA_X + 16, AREA_Y + ENTRY_H / 2, 20, '#9fb2c3');
    // v1.16.73 测试战场：添加圣遗物（三选一，可反复添加测试效果）
    push('tf_addRelic', null, 250, AREA_Y + 14, 140, 40);
    fillRoundRect(ctx, 250, AREA_Y + 14, 140, 40, 10, 'rgba(0,0,0,0.35)');
    strokeRoundRect(ctx, 250, AREA_Y + 14, 140, 40, 10, '#7ca8ff', 1.5);
    text(ctx, '＋ 添加圣遗物', 320, AREA_Y + 40, 15, '#7ca8ff', 'center');
    // v1.16.104 测试战场：添加 3★ 圣遗物（已拥有圣遗物按 3★ 质变生效测试）
    push('tf_addRelic3', null, 405, AREA_Y + 14, 140, 40);
    fillRoundRect(ctx, 405, AREA_Y + 14, 140, 40, 10, 'rgba(0,0,0,0.35)');
    strokeRoundRect(ctx, 405, AREA_Y + 14, 140, 40, 10, '#ffb347', 1.5);
    text(ctx, '✦ 3★ 圣遗物', 475, AREA_Y + 40, 15, '#ffb347', 'center');
    text(ctx, '点塔位配置技能', AREA_X + AREA_W - 150, AREA_Y + ENTRY_H / 2, 17, '#7cd6a6', 'right');
    // 防线血条（测试战场恒满；v1.17.11 血条改画在塔位行上方 1039，塔槽 1053 起不受遮挡）
    this.wall(ctx, s.lineHp, s.lineMaxHp, 1039);
    // 敌人与特效（位于战场区，不被控制条覆盖）；地面持续效果（毒池/毒棒）画在敌人下层
    if (combat) this.groundFx(ctx, combat);
    if (enemies) this.enemies(ctx, enemies);
    if (fx) this.fx(ctx, fx);
    this.damageNumbers(ctx, damageNumbers);
    // 塔位行：单塔出战（当前塔大槽）+ 6 塔切换钮（v1.14.1）
    const cur = (s.towers || [])[0] || null;
    if (!drawImg(ctx, IMG_SRC.towerRow, 0, 1042, 750, L.towerRow.h)) {   // v1.17.11 测试战场塔位行保持原 y1042（正式战场已上移至 967 即城墙）
      fillRoundRect(ctx, AREA_X, 1042, AREA_W, L.towerRow.h, 8, 'rgba(255,255,255,0.05)');
    }
    text(ctx, '出战塔', 65, 1042 + 16, 14, 'rgba(255,255,255,0.4)', 'center');
    if (cur) {
      push('tf_slot', cur.key, 15, 1053, 100, 100);
      const ix = 15 + (100 - L.towerIcon.size) / 2;
      const iy = 1053 + (100 - L.towerIcon.size) / 2;
      if (!drawImg(ctx, IMG_SRC[cur.key], ix, iy, L.towerIcon.size, L.towerIcon.size)) {
        drawTowerGlyph(ctx, cur.key, ix, iy, L.towerIcon.size);
      }
      // v1.17.10 等级小字（不再显示右上角数字徽章，避免遮挡塔图标）
      text(ctx, `Lv${cur.level}`, 15 + 50, 1053 + 100 - 10, 13, 'rgba(255,255,255,0.75)', 'center');
      // 能量竖条（槽内右侧；v1.16.77 弹药→能量）
      const aRatio = cur.ammoMax > 0 ? Math.min(1, (cur.ammo || 0) / cur.ammoMax) : 0;
      const bx = 15 + 100 - 17, by0 = 1053 + 8, bh = 100 - 16;
      EnergyCapsule.draw(ctx, bx, by0, 13, bh, aRatio);
      text(ctx, `${Math.floor(cur.ammo || 0)}`, bx + 6.5, 1053 + 5, 10, aRatio < 0.2 ? '#ff6b6b' : 'rgba(255,255,255,0.7)', 'center');
    }
    // 6 塔切换钮
    text(ctx, '更换', 158, 1042 + 16, 14, 'rgba(255,255,255,0.4)', 'left');
    (s.allTowers || []).forEach((tw, i) => {
      const bx = 185 + i * 66;
      const active = cur && tw.key === cur.key;
      push('tf_switch', tw.key, bx, 1053, 56, 56);
      fillRoundRect(ctx, bx, 1053, 56, 56, 10, active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)');
      strokeRoundRect(ctx, bx, 1053, 56, 56, 10, active ? '#f7c948' : 'rgba(255,255,255,0.2)', active ? 2 : 1);
      text(ctx, tw.icon, bx + 28, 1053 + 26, 24, '#ffffff', 'center');
      text(ctx, tw.name, bx + 28, 1053 + 50, 12, active ? '#f7c948' : 'rgba(255,255,255,0.6)', 'center');
    });
    // 底部控制区
    const cY = 1042 + L.towerRow.h;   // v1.17.11 测试战场塔位行基准 1042
    fillRoundRect(ctx, AREA_X, cY, AREA_W, LOGIC_H - cY - 16, 12, 'rgba(255,255,255,0.04)');
    text(ctx, `— 刷怪测试 · ${cur ? '出战塔：' + cur.name : ''} —`, 375, cY + 30, 20, '#9fb2c3', 'center');
    const btnW = 208, btnH = 64, btnGap = 16, bX = 44;
    const rows = [
      [['tf_spawn_n', '👾 普通×5', '#7cd6a6'], ['tf_spawn_r', '🏃 快速×5', '#f7c948'], ['tf_spawn_t', '🛡 重甲×5', '#a78bfa']],
      [['tf_spawn_e', '💀 精英×2', '#ff6b6b'], ['tf_spawn_b', '👹 Boss×1', '#ff8c42'], ['tf_clear', '🧹 清怪', '#9fb2c3']],
    ];
    rows.forEach((row, ri) => {
      row.forEach((b, bi) => {
        const bx = bX + bi * (btnW + btnGap);
        const by = cY + 46 + ri * 82;
        push(b[0], null, bx, by, btnW, btnH);
        fillRoundRect(ctx, bx, by, btnW, btnH, 12, 'rgba(255,255,255,0.06)');
        strokeRoundRect(ctx, bx, by, btnW, btnH, 12, b[2], 1.2);
        text(ctx, b[1], bx + btnW / 2, by + 38, 24, '#ffffff', 'center');
      });
    });
    text(ctx, '点上方“出战塔”配技能 · 点“更换”切塔 · 分支按钮循环 0→3', 375, cY + 216, 16, '#5b6b7c', 'center');
    // 返回主界面
    push('tf_back', null, 100, 1490, 550, 76);
    fillRoundRect(ctx, 100, 1490, 550, 76, 18, 'rgba(255,255,255,0.06)');
    strokeRoundRect(ctx, 100, 1490, 550, 76, 18, '#8ea3b8', 1.2);
    text(ctx, '← 返回主界面', 375, 1540, 28, '#8ea3b8', 'center');
    // 技能配置面板（覆盖层）
    if (s.panel && s.panel.key) this.testSkillPanel(ctx, s.panel.key, s, push);
    hits = items;
    return hits;
  }

  /** v1.14 测试战场技能配置面板：8 技能行 × (A/B/C 分支循环按钮 + 清除)，底部全激活/清空 */
  function testSkillPanel(ctx, key, s, push) {
    const tower = s.towers.find((t) => t && t.key === key);
    if (!tower) return;
    const pw = 670, ph = 1160, px = (750 - pw) / 2, py = 150;
    push('panel_bounds', null, px, py, pw, ph);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, px, py, pw, ph, 16, '#1b2230');
    strokeRoundRect(ctx, px, py, pw, ph, 16, '#3b4b5e', 1.5);
    text(ctx, `${tower.icon} ${tower.name} · 技能配置`, px + 40, py + 48, 28, '#ffffff', 'left');
    push('panel_done', null, px + pw - 152, py + 18, 72, 48);
    fillRoundRect(ctx, px + pw - 146, py + 22, 66, 40, 10, 'rgba(46,204,113,0.2)');
    strokeRoundRect(ctx, px + pw - 146, py + 22, 66, 40, 10, '#2ecc71', 1.2);
    text(ctx, '✓ 确定', px + pw - 113, py + 50, 20, '#7ef0a3', 'center');
    push('panel_close', null, px + pw - 76, py + 18, 58, 48);
    fillRoundRect(ctx, px + pw - 70, py + 22, 46, 40, 10, 'rgba(255,255,255,0.1)');
    text(ctx, '✕', px + pw - 47, py + 50, 26, '#ffffff', 'center');
    // 8 技能行
    const rowH = 108, rY0 = py + 84;
    const pool = CONFIG.EFFECT_POOLS[key] || [];
    tower.skills.forEach((sk, i) => {
      const ry = rY0 + i * rowH;
      if (i > 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 24, ry - 6, pw - 48, 1); }
      fillRoundRect(ctx, px + 24, ry + 14, 52, 52, 10, sk.level > 0 ? sk.color : 'rgba(255,255,255,0.06)');
      text(ctx, sk.icon, px + 50, ry + 48, 26, sk.level > 0 ? '#ffffff' : '#8ea3b8', 'center');
      text(ctx, sk.name, px + 92, ry + 34, 22, sk.level > 0 ? '#ffffff' : '#8ea3b8', 'left');
      // v1.16.3：分支等级行用真实分支名（branchName 提取 config 文案冒号前名称），不再用 A/B/C 代号
      const cfg = pool.find((q) => q.name === sk.name) || null;
      const bn = (br) => this.branchName(cfg, br);
      const parts = [];
      ['A', 'B', 'C'].forEach((br) => {
        const lv = sk.branches[br];
        parts.push(`${bn(br)}${lv > 0 ? '·Lv' + lv : ''}`);
      });
      text(ctx, `${parts.join('  ')}${sk.level > 0 ? ' · 技能Lv' + sk.level : ' · 未激活'}`, px + 92, ry + 62, 15, sk.level > 0 ? '#7ef0a3' : '#5b6b7c', 'left');
      const bW = 96, bH = 52, bGap = 8;
      const b0 = px + pw - 24 - (bW * 4 + bGap * 3);
      [['A', '#ff6b6b'], ['B', '#f7c948'], ['C', '#7ca8ff']].forEach(([br, col], bi) => {
        const bx = b0 + bi * (bW + bGap);
        const lv = sk.branches[br];
        push('panel_branch', { name: sk.name, br }, bx, ry + 24, bW, bH);
        fillRoundRect(ctx, bx, ry + 24, bW, bH, 10, lv > 0 ? col : 'rgba(255,255,255,0.06)');
        strokeRoundRect(ctx, bx, ry + 24, bW, bH, 10, col, lv > 0 ? 1.5 : 0.8);
        // 按钮显示真实分支名（短名），激活时附 Lv
        const bTxt = `${bn(br)}${lv > 0 ? '·Lv' + lv : ''}`;
        text(ctx, bTxt, bx + bW / 2, ry + 58, bTxt.length > 4 ? 16 : 20, lv > 0 ? '#ffffff' : col, 'center');
      });
      // 清除按钮（第 4 位）
      const bx0 = b0 + 3 * (bW + bGap);
      push('panel_branch', { name: sk.name, br: 'clear' }, bx0, ry + 24, bW, bH);
      fillRoundRect(ctx, bx0, ry + 24, bW, bH, 10, 'rgba(255,255,255,0.05)');
      strokeRoundRect(ctx, bx0, ry + 24, bW, bH, 10, '#5b6b7c', 1);
      text(ctx, '清除', bx0 + bW / 2, ry + 58, 20, '#8ea3b8', 'center');
    });
    // 底部：全部激活 / 清空全部
    const by = py + ph - 66;
    push('panel_all', null, px + 40, by, 250, 48);
    fillRoundRect(ctx, px + 40, by, 250, 48, 12, 'rgba(46,204,113,0.2)');
    strokeRoundRect(ctx, px + 40, by, 250, 48, 12, '#2ecc71', 1.2);
    text(ctx, '⚡ 全部激活（各分支 Lv3）', px + 165, by + 32, 20, '#7ef0a3', 'center');
    push('panel_clear', null, px + pw - 290, by, 250, 48);
    fillRoundRect(ctx, px + pw - 290, by, 250, 48, 12, 'rgba(255,255,255,0.06)');
    strokeRoundRect(ctx, px + pw - 290, by, 250, 48, 12, '#5b6b7c', 1.2);
    text(ctx, '🧹 清空全部技能', px + pw - 165, by + 32, 20, '#8ea3b8', 'center');
  }

  return { testFieldLayer, testSkillPanel };
}
module.exports = { createTestFieldScreen };
