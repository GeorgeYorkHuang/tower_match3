'use strict';
const CONFIG = require('../../config.js');

// Preserve modal priority and consume each event once. Player state belongs to game.
function dispatchTouch(game, p, version) {
  // v1.16.73 本局圣遗物详情弹层（最高优先级）：✕ 关闭 / ▲▼ 翻页
  if (game.relicDetail) {
    const h = game.relicDetailHits;
    if ((h.close && h.close.hit(p.x, p.y)) || (h.bg && h.bg.hit(p.x, p.y))) {
      const from = game.relicDetail.from || 'fighting';   // v1.16.113 关闭后回到来源状态（testfield/fighting）
      game.relicDetail = null; game.state = from; return true;
    }
    if (h.next && h.next.hit(p.x, p.y)) {
      const pages = Math.ceil(game.battleRelics.length / 8);
      game.relicDetail.page = Math.min((game.relicDetail.page || 0) + 1, Math.max(pages - 1, 0));
      return true;
    }
    if (h.prev && h.prev.hit(p.x, p.y)) {
      game.relicDetail.page = Math.max((game.relicDetail.page || 0) - 1, 0);
      return true;
    }
    return true; // 面板内点击不处理其它
  }
  // 主界面：分页 / 进入战斗 / 技能搭配 / 圣物配置 / 商店 / 圣物升级 / 宝箱
  if (game.state === 'menu') { game.onMenuTap(p); return true; }
  // 技能二级详情弹层打开中：点返回/遮罩 → 回到塔详情；再次点关闭逻辑在塔详情分支
  if (game.towerSkill) {
    const h = game.towerSkillHits;
    if (h.back && h.back.hit(p.x, p.y)) { game.towerSkill = null; return true; }
    if (h.bg && h.bg.hit(p.x, p.y)) { game.towerSkill = null; return true; }
    return true; // 面板内点击不处理其它
  }
  // 塔详情弹层打开中：点技能卡开二级详情 / 点关闭或遮罩关闭
  if (game.towerInfo) {
    const h = game.towerInfoHits;
    if (h.skill) {
      for (let i = 0; i < h.skill.length; i++) {
        if (h.skill[i] && h.skill[i].hit(p.x, p.y)) {
          const sk = game.towerInfo.skills[i];
          if (sk) game.towerSkill = game.buildTowerSkillInfo(game.towerInfo.key, sk);
          return true;
        }
      }
    }
    if (h.close && h.close.hit(p.x, p.y)) { game.towerInfo = null; return true; }
    if (h.bg && h.bg.hit(p.x, p.y)) { game.towerInfo = null; return true; }
    return true; // 面板内点击不处理其它
  }
  // 底部功能弹层打开中：声音开关 / 重新开始 / 返回主界面 / 关闭 / 遮罩关闭
  if (game.funcLayer) {
    const h = game.funcLayerHits;
    if (game.funcLayer.type === 'setting' && h.sound && h.sound.hit(p.x, p.y)) {
      // v1.16.107 声音开关：持久化 + 即时应用；v1.16.135 同步 funcLayer.soundOn，否则弹层按钮文案不刷新
      game.meta.soundOn = !game.meta.soundOn;
      game.funcLayer.soundOn = game.meta.soundOn;
      game.save.save();
      game.sfx.setEnabled(game.meta.soundOn);
      game.toast(game.meta.soundOn ? '🔊 音效已开启' : '🔇 音效已关闭', '#9fb2c3');
      return true;
    }
    if (game.funcLayer.type === 'setting' && h.confirm && h.confirm.hit(p.x, p.y)) {
      // v1.16.107 重新开始（不清档）：返回主界面重开本局，塔/金币/解锁进度全部保留
      game.funcLayer = null;
      game.goMenu();
      game.toast('已重新开始 · 存档保留', '#7ef0a3');
      return true;
    }
    // 设置弹层底部按钮 =「返回主菜单」；其它弹层 =「关闭」
    if (h.close && h.close.hit(p.x, p.y)) {
      if (game.funcLayer.type === 'setting') game.goMenu();
      else game.funcLayer = null;
      return true;
    }
    if (h.bg && h.bg.hit(p.x, p.y)) { game.funcLayer = null; return true; }
    return true; // 面板内点击不处理其它
  }
  if (game.shopOpen) {
    const panel = game.renderer.shopPanelRect;
    if (panel && (p.x < panel.x || p.x > panel.x + panel.w || p.y < panel.y || p.y > panel.y + panel.h)) {
      game.shopOpen = false;
      return true;
    }
    const scl = game.renderer.shopCloseRect;
    if (scl && p.x >= scl.x && p.x <= scl.x + scl.w && p.y >= scl.y && p.y <= scl.y + scl.h) { game.shopOpen = false; return true; }
    const rects = game.renderer.shopItemRects || [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        game.buyStoreItem(i);
        return true;
      }
    }
    return true; // Modal blank space must not reach battle controls.
  }
  // 加速按钮（v1.16.30 移到城墙上方 · 移动区右下角，独立命中区）
  if (game.renderer.speedHit && game.renderer.speedHit.hit(p.x, p.y)) {
    game.cycleRunSpeed();
    return true;
  }
  // 底部功能键区：打开对应弹层（v1.16.89 商店并入功能条：点击弹出商店面板）
  if (game.funcHits.length) {
    for (const f of game.funcHits) {
      if (f.hit(p.x, p.y)) {
        if (f.key === 'shop') { game.shopOpen = true; return true; }
        game.funcLayer = { type: f.key, version: version, soundOn: game.meta.soundOn !== false };
        return true;
      }
    }
  }
  if (game.state === 'fighting') {
    // v1.16.74 宝箱开箱/飞行动画期间锁定战斗输入（防误触）
    if (game._chestBusy) return true;
    // v1.16.89 局内商店：入口移至底部功能条，此处仅处理面板内点击（关闭钮 / 商品格）
    if (game.shopOpen === undefined) game.shopOpen = false;
    // v1.16.73 顶部状态栏圣遗物行：点击查看本局圣遗物详情（战斗暂停）
    const rb = game.renderer.relicBarHit;
    if (rb && p.x >= rb.x && p.x <= rb.x + rb.w && p.y >= rb.y && p.y <= rb.y + rb.h) {
      game.relicDetail = { page: 0 };
      game.state = 'relicDetail'; // 详情查看中战斗暂停
      return true;
    }
    // v1.16.74 战场宝箱：点击 → 开箱→飞向屏幕中心放大→弹圣物三选一；动画期间锁定其他战斗输入
    for (let i = game.fieldChests.length - 1; i >= 0; i--) {
      const c = game.fieldChests[i];
      if (c.animT != null) continue; // 开箱/飞行动画播放中
      if (Math.abs(p.x - c.x) < 44 && Math.abs(p.y - c.y) < 44) {
        c.animT = 0; c.stage = 'open'; // 启动动画序列
        game._chestBusy = true;
        return true;
      }
    }
    // 战斗中点全局技能按钮 → 释放技能（v1.12：左=全局洗牌，右=全局冰冻）
    const btns = game.renderer.globalBtns || [];
    for (const b of btns) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        game.combat.castGlobal(b.key);
        return true;
      }
    }
    // 战斗中点塔位图标 → 查看技能/等级
    const si = game.towerSlotAt(p);
    const slot = game.sceneState().towers[si] || null;
    if (si >= 0 && slot) {
      game.towerInfo = { ...slot, slotIdx: si };
      return true;
    }
  }
  // v1.14 测试战场触摸分发：技能面板弹层优先，其次控制条/塔槽/返回/倍速
  if (game.state === 'testfield') {
    if (game.onTestFieldTap(p)) return true;
  }
  // 弹层按钮判定
  if (game.state === 'picking') {
    const group = game.pickQueue[game.pickIndex];
    if (!group || !group.candidates || !group.candidates.length) return true;
    // v1.16.56：三选一暂停中，点击下方露出的防御塔位 → 打开塔详情（可查看技能详情，关闭后回到三选一）
    const si = game.towerSlotAt(p);
    const slot = game.sceneState().towers[si] || null;
    if (si >= 0 && slot) {
      game.towerInfo = { ...slot, slotIdx: si };
      return true;
    }
    for (let i = 0; i < group.candidates.length; i++) {
      if (game.pickHits[i] && game.pickHits[i].hit(p.x, p.y)) {
        const res = game.run.applyChoice(group.tower, group.candidates[i]);
        if (res.ok) {
          const cd = group.candidates[i];
          const nm = cd.name;
          // v1.14 提示优化：分支卡 toast 显示分支名 + 等级变化（如「爆燃·灼烧爆裂 Lv0→1」）
          const cdCfg = (CONFIG.EFFECT_POOLS[cd.fromTower || group.tower] || []).find((q) => q.name === nm) || {};
          const actTxt = cd.type === 'branch'
            ? `${nm}·${game.renderer.branchName(cdCfg, cd.branch)} Lv${cd.branchLv}→${cd.branchLv + 1}`
            : (res.activated ? `激活技能：${nm}` : `替换特效：${nm}`);
          game.toast(actTxt, '#7ef0a3');
          game.nextPick();
        }
        return true;
      }
    }
    return true;
  }
  // 圣物宝箱三选一弹层：点候选 → 获取该圣物；点重掷 → 局内银币付费重抽
  if (game.state === 'relicpick') {
    if (game.relicPickHits.reroll && game.relicPickHits.reroll.hit(p.x, p.y)) { game.rerollRelicPick(); return true; }
    if (game.relicPick && game.relicPick.candidates) {
      for (let i = 0; i < game.relicPick.candidates.length; i++) {
        if (game.relicPickHits[i] && game.relicPickHits[i].hit(p.x, p.y)) {
          game.relicPickChoice(i);
          return true;
        }
      }
    }
    return true;
  }
  if (game.state === 'gameover') {
    // v1.17.21 点击任意处跳过演出：首点置 skip（goT 直达 99999），本次点击吞掉，按钮从第二次点击开始生效
    if (!game.gameoverSkip) { game.gameoverSkip = true; return true; }
    // v1.16.135 兼容两种注册形态：hit 可以是函数（v1.17 汇总分支）或 {hit:fn} 对象（兜底分支）。
    //   此前汇总分支 toMenu=hit 函数，这里却调用 .toMenu.hit() → TypeError → 「返回主界面」点击无响应
    const rb = game.restartBtn || {};
    const h1 = typeof rb.hit === 'function' ? rb.hit : rb.hit && rb.hit.hit;
    if (h1 && h1(p.x, p.y)) { game.restart(); return true; }
    const tm = rb.toMenu;
    const h2 = typeof tm === 'function' ? tm : tm && tm.hit;
    if (h2 && h2(p.x, p.y)) { game.goMenu(); return true; }
    return true;
  }
  // v1.16.76 撤离决策层（战斗暂停）
  if (game.state === 'evacuation') {
    const H = game.evacHits || {};
    if (H.evacGo && H.evacGo.hit(p.x, p.y)) { game.finishRun(true); return true; }
    if (H.evacStay && H.evacStay.hit(p.x, p.y)) {
      game.state = 'fighting';
      game.waveClearNext();
      return true;
    }
    return true;
  }
  return false;
}
module.exports = { dispatchTouch };
