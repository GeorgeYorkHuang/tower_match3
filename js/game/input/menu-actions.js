'use strict';
const CONFIG = require('../../config.js');
const GlobalSkills = require('../../global-skills.js');
const AccountMenu = require('../account.js');

// Menu hit priority, purchase/equip actions and modal routing. No renderer dependency.
function onMenuTap(game, p) {
    if (game.menuPanel) {
      const bounds = game.menuHits.find(it => it.key === 'panelBounds');
      if (bounds && !bounds.hit(p.x, p.y)) { game.menuPanel = null; return; }
      const ptype = game.menuPanel.type;
      if (['accountMenu', 'accountInfo', 'testProfile'].includes(ptype)) {
        const target = game.menuHits.find(it => (it.key.startsWith('account') || it.key.startsWith('profile')) && it.hit(p.x, p.y));
        if (target) { AccountMenu.handle(game, target.key); return; }
      }
      // v1.16.78 圣物图鉴翻页（relicDex 面板内）
      if (ptype === 'relicDex') {
        const total = game._relicRunTotal();
        for (const it of game.menuHits) {
          if (it.key === 'relicPage' && it.hit(p.x, p.y)) {
            game.relicDexPage = Math.max(0, Math.min(total - 1, game.relicDexPage + it.data));
            return;
          }
          // 点圣物卡 → 详情面板（1/2/3★ 效果 + 升星）
          if (it.key === 'relicInfo' && it.hit(p.x, p.y)) {
            game.menuPanel = { type: 'relicInfo', id: it.data };
            return;
          }
        }
      }
      for (const it of game.menuHits) {
        // 面板打开时只响应 关闭 / 面板内专属项
        if (it.key === 'panelClose') {
          if (!it.hit(p.x, p.y)) continue;
          game.menuPanel = null;
          return;
        }
        // v1.16.76 调试面板（仅 DEBUG 构建）
        if (ptype === 'debug' && it.key.indexOf('dbg_') === 0 && it.hit(p.x, p.y)) {
          game.handleDebugTap(it.key);
          return;
        }
        // v1.16.76 圣遗物升星（图鉴/升星/详情面板内点击行）
        if ((ptype === 'relicDex' || ptype === 'starUp' || ptype === 'relicInfo') && it.key === 'relicStar' && it.hit(p.x, p.y)) {
          const err = game.meta.upStar(it.data);
          if (err) game.toast(err, '#ff6b6b');
          else {
            game.save.save();
            game.toast(`${it.data} 升星成功！→ ${game.meta.starOf(it.data)}★`, '#f7c948');
          }
          return;
        }
        // v1.17.20 碎片手动解锁（圣遗物详情面板内）：消耗阈值碎片点亮图鉴
        if (it.key === 'relicUnlock' && it.hit(p.x, p.y)) {
          const need = game.meta.shardNeed(it.data);
          const err = game.meta.unlockByShard(it.data);
          if (err) game.toast(err, '#ff6b6b');
          else {
            game.save.save();
            const def = CONFIG.relicRunDef(it.data);
            game.toast(`已解锁 ${def ? def.name : it.data} · 消耗碎片 ${need}`, '#a86bff');
          }
          return;
        }
        // v5.3c 技能配置面板：已解锁 → 点选配置；未解锁 → 金币购买后自动配置（全局技能固定 2 款不写槽）
        if ((ptype === 'matchCfg' || ptype === 'globalCfg') && it.key === 'mSkill' && it.hit(p.x, p.y)) {
          const slot = it.data.slot;
          const id = it.data.id;
          if (!id) return;
          const def = (slot === 'global')
            ? (GlobalSkills.get(id) || {})
            : (CONFIG.MATCH_SKILL[slot].find((d) => d.id === id) || {});
          const nm = def.name || id;
          let purchased = false;
          if (!game.meta.skillUnlocked(slot, id)) {
            const res = game.meta.unlockSkill(slot, id);
            if (!res.ok) {
              if (res.reason === 'gold') game.toast('金币不足，可去商店或打怪获取', '#ff6b6b');
              return;
            }
            purchased = true;
          }
          if (slot === 'global') {
            const index = Number(game.menuPanel.index || 0);
            const slots = GlobalSkills.slots(game.meta.globalSkills);
            const other = 1 - index;
            if (slots[other] === id) { slots[other] = slots[index]; }
            slots[index] = id; game.meta.globalSkills = { slots };
            game.save.save(); game.toast((purchased ? '已解锁并配置 · ' : '已配置 · ')+nm, '#f4cb79'); return;
          }
          game.meta.matchSkills[slot] = id;
          game.save.save();
          game.toast(`${purchased ? '已解锁并配置' : '已配置'} · ${nm}`, '#a86bff');
          return;
        }
      }
      for (const hit of game.menuHits) { if (hit.key === 'globalPage' && hit.hit(p.x,p.y)) { game.menuPanel.page = hit.data; return; } }
      return; // 面板打开时忽略底层按钮
    }
    for (const it of game.menuHits) {
      if (!it.hit(p.x, p.y)) continue;
      switch (it.key) {
        case 'accountOpen': game.menuPanel = { type: 'accountMenu' }; return;
        case 'tab':
          game.menuTab = it.data;
          game.menuPanel = null;
          return;
        case 'relicInfo':
          // v1.16.78 圣物图鉴：点圣遗物卡 → 详情面板（1/2/3★ 效果 + 升星）
          game.menuPanel = { type: 'relicInfo', id: it.data };
          return;
        case 'matchCfg':
          // v5.3 主页三消技能配置行 → 三消技能配置面板
          game.menuPanel = { type: 'matchCfg', slot: it.data && it.data.slot || 'match4' };
          return;
        case 'globalCfg':
          // v5.3 主页全局技能配置行 → 全局技能配置面板
          game.menuPanel = { type: 'globalCfg', index: it.data && it.data.index || 0, page: 0 };
          return;
        case 'relicPage': {
          // v1.16.78 圣物图鉴：翻页
          const total = game._relicRunTotal();
          game.relicDexPage = Math.max(0, Math.min(total - 1, game.relicDexPage + it.data));
          return;
        }
        case 'codexSel':
          // v1.16.75 塔图鉴：切换选中塔
          game.codexSel = it.data;
          return;
        case 'codexSkill':
          // v1.16.78 塔图鉴：点技能卡 → 打开 A/B/C 分支效果面板
          game.menuPanel = { type: 'codexSkill', tower: it.data.tower, idx: it.data.idx };
          return;
        case 'codexLearn': {
          // v1.16.75 塔图鉴：金币学习解锁塔（回旋镖 3000 / 炮塔 5000）
          const key = it.data;
          if (game.meta.towerCodex[key]) return;
          const cost = key === 'cannon' ? 5000 : 3000;
          if (game.meta.gold < cost) { game.toast('金币不足', '#ff6b6b'); return; }
          game.meta.gold -= cost;
          game.meta.learnTower(key);
          game.save.save();
          const nm = (CONFIG.COLORS[CONFIG.TOWERS[key] && CONFIG.TOWERS[key].color] || {}).name || key;
          game.toast(`已学习 ${nm}，塔图鉴解锁！`, '#f7c948');
          return;
        }
        case 'stage': {
          // v1.16.76 战场卡本体：提示当前所选战场合约
          const F = CONFIG.FIELDS[game.menuStage] || CONFIG.FIELDS.ancient;
          game.toast(`当前：${F.name} · ${F.subtitle}`, '#7cd6a6');
          return;
        }
        case 'stagePrev':
        case 'stageNext': {
          // v1.16.78 ◀ ▶ 按合约切换战场：未解锁战场不再静默跳过（可见、进场时校验）
          const order = CONFIG.FIELD_ORDER;
          const dir = it.key === 'stageNext' ? 1 : -1;
          let idx = order.indexOf(game.menuStage);
          idx = (idx + dir + order.length) % order.length;
          game.menuStage = order[idx];
          const F2 = CONFIG.FIELDS[game.menuStage];
          if (F2.unlockWave && game.meta.bestWave < F2.unlockWave) {
            game.toast(`已切换：${F2.name}（🔒 需最深 ${F2.unlockWave} 波解锁，当前最佳 ${game.meta.bestWave}）`, '#f0b45c');
          } else {
            game.toast(`已切换：${F2.name}（${F2.subtitle}）`, '#7cd6a6');
          }
          return;
        }
        case 'enter': {
          // v1.16.30 按所选战场进入：测试战场 → 免三消直测；正式战斗需校验解锁（v1.16.78）
          game.menuPanel = null;
          if (game.menuStage === 'test') { game.enterTestField(); return; }
          const Fe = CONFIG.FIELDS[game.menuStage] || CONFIG.FIELDS.ancient;
          if (Fe.unlockWave && game.meta.bestWave < Fe.unlockWave) {
            game.toast(`${Fe.name} 尚未解锁：需最深 ${Fe.unlockWave} 波（当前最佳 ${game.meta.bestWave}）`, '#f0b45c');
            return;
          }
          game.newRun(true);
          return;
        }
        case 'relicDex':
          // 圣物图鉴：查看全部圣物图标（未获取锁定，获取后显示性能）
          game.menuPanel = { type: 'relicDex' };
          return;
        case 'starUp':
          // v1.16.76 圣遗物升星面板（碎片/金币/星辉石 → 2★ 效果升级 / 3★ 质变）
          game.menuPanel = { type: 'starUp' };
          return;
        case 'shopShard': {
          // 每日碎片精选：金币购买碎片（0 点刷新）
          const d = it.data;
          const res = game.meta.buyShardOffer(d);
          if (!res.ok) { game.toast('金币不足', '#ff6b6b'); return; }
          game.save.save();
          game.toast(`获得 ${d.icon}${d.name} 碎片 ×${d.shards}`, '#7ef0a3');
          return;
        }
        case 'shopChest': {
          // 圣遗物宝箱：金币购买随机碎片（每日限购）
          const res = game.meta.buyShopChest(it.data.key);
          if (!res.ok) {
            if (res.reason === 'limit') game.toast('今日次数已用完，明天再来', '#ff6b6b');
            else if (res.reason === 'gold') game.toast('金币不足', '#ff6b6b');
            return;
          }
          game.save.save();
          const names = res.gains.map((g) => {
            const dd = CONFIG.relicRunDef(g.id) || { id: g.id, name: g.id, icon: '' };
            return `${dd.icon || ''}${dd.name || g.id}×${g.n}`;
          }).join(' ');
          game.toast(`宝箱开启：${names}`, '#f7c948');
          return;
        }
        case 'shopSkill': {
          // 技能解锁：金币购买技能（解锁后可在主页配置面板选用）
          const d = it.data;
          if (game.meta.skillUnlocked(d.slot, d.id)) { game.toast('该技能已解锁', '#9fb2c3'); return; }
          const res = game.meta.unlockSkill(d.slot, d.id);
          if (!res.ok) { if (res.reason === 'gold') game.toast('金币不足', '#ff6b6b'); return; }
          game.save.save();
          const def = (d.slot === 'global')
            ? (d.id === 'shuffle' ? CONFIG.GLOBAL_SKILL.shuffleSkill : CONFIG.GLOBAL_SKILL.refillSkill)
            : (CONFIG.MATCH_SKILL[d.slot].find((x) => x.id === d.id) || {});
          game.toast(`解锁技能 · ${def.name || d.id}`, '#7ef0a3');
          return;
        }
        case 'relicUp': {
          const res = game.meta.upgradeRelic(it.data);
          if (res.ok) {
            game.save.save();
            game.toast(`圣物升级 Lv${res.level}`, '#7ef0a3');
          } else if (res.reason === 'relic') {
            game.toast('升级需 1 个同名圣物', '#ff6b6b');
          } else {
            game.toast('金币不足', '#ff6b6b');
          }
          return;
        }
        case 'chest': {
          const m = game.meta;
          if (m.chestTimer) { game.toast(`宝箱开启中 ${m.chestRemainSec(Date.now())}s`, '#9fb2c3'); return; }
          const res = m.startChest(Date.now());
          if (res.ok) {
            game.save.save();
            game.toast(`宝箱开启中 ${CONFIG.RELIC.chestOpenSec}s`, '#f7c948');
          } else if (res.reason === 'none') {
            game.toast('暂无宝箱（Boss 掉落）', '#9fb2c3');
          }
          return;
        }
        case 'deepChest': {
          // v1.16.76 深度宝箱：就绪点击开启；未就绪提示剩余时间（钻石足够则提示可速开）
          const m = game.meta;
          const ch = m.deepChests[it.data];
          if (!ch) { game.toast('空槽位 · 局末按最深波次获得', '#5a6c80'); return; }
          if (m.chestReady(ch)) {
            const gain = m.openDeepChest(it.data);
            game.save.save();
            if (gain) game.menuPanel = { type: 'chestOpen', mode: 'deep', gain, tier: ch.tier };   // v1.17.9d 开箱弹窗：收益一次弹出
            return;
          }
          const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
          const remainMin = Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000));
          const cost = Math.max(1, Math.ceil(remainMin / 60 * 4));
          if (m.diamond >= cost && m.speedOpen(it.data)) {
            const gain = m.openDeepChest(it.data);
            game.save.save();
            if (gain) game.menuPanel = { type: 'chestOpen', mode: 'deep', gain, tier: ch.tier };   // v1.17.9d 速开同样弹窗
            return;
          }
          game.toast(`${tier.name} 开启中 · 还需 ${remainMin} 分钟（${cost}💎 立即开启）`, '#9fb2c3');
          return;
        }
        case 'debug':
          // v1.16.76 调试工具入口（仅 DEBUG 构建）
          game.menuPanel = { type: 'debug' };
          return;
        default:
          return;
      }
    }
}
module.exports = { onMenuTap };
