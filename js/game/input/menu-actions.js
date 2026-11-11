const FieldAccess = require('../../field-access.js');
'use strict';
const CONFIG = require('../../config.js');
const GlobalSkills = require('../../global-skills.js');
const AccountMenu = require('../account.js');

const RAR_NAME = { r: '蓝', sr: '紫', ssr: '金', ur: '红' };

// Menu hit priority, purchase/equip actions and modal routing. No renderer dependency.
function onMenuTap(game, p) {
    if(require('../unlock-guide.js').tap(game,p))return;
    if (require('./talent-actions.js').handle(game,p)) return;
    if (game.menuPanel) {
      const bounds = game.menuHits.find(it => it.key === 'panelBounds');
      if (bounds && !bounds.hit(p.x, p.y)) { game.menuPanel = null; return; }
      const ptype = game.menuPanel.type;
      if (['accountMenu', 'accountInfo', 'accountMail', 'testProfile'].includes(ptype)) {
        const target = game.menuHits.find(it => (it.key.startsWith('account') || it.key.startsWith('profile')) && it.hit(p.x, p.y));
        if (target) { AccountMenu.handle(game, target.key, target.data); return; }
      }
      // 圣物图鉴翻页（relicDex 面板内）
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
        // 调试面板（仅 DEBUG 构建）
        if (ptype === 'debug' && it.key.indexOf('dbg_') === 0 && it.hit(p.x, p.y)) {
          game.handleDebugTap(it.key);
          return;
        }
        // 圣遗物升星（图鉴/升星/详情面板内点击行）
        if ((ptype === 'relicDex' || ptype === 'starUp' || ptype === 'relicInfo') && it.key === 'relicStar' && it.hit(p.x, p.y)) {
          const err = game.meta.upStar(it.data);
          if (err) game.toast(err, '#ff6b6b');
          else {
            game.save.save();
            game.toast(`${it.data} 升星成功！→ ${game.meta.starOf(it.data)}★`, '#f7c948');
          }
          return;
        }
        // 碎片手动解锁（圣遗物详情面板内）：消耗阈值碎片点亮图鉴
        if (ptype === 'relicInfo' && it.key === 'craftShard' && it.hit(p.x, p.y)) {
          const err = game.meta.craftShard(it.data);
          if (!err) game.save.save();
          game.toast(err || '已合成碎片 ×1', err ? '#ff6b6b' : '#dfbdff');
          return;
        }
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
        // 技能配置面板：已解锁 → 点选配置；未解锁 → 金币购买后自动配置（全局技能固定 2 款不写槽）
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
        // 局外商店商品详情弹窗：确认购买
        if (ptype === 'shopDetail' && it.key === 'shopBuy' && it.hit(p.x, p.y)) {
          confirmShopBuy(game);
          return;
        }
      }
      // ：globalPage 翻页键已下架（全局面板改为视口内惯性滚动，触摸由 panel-scroll.js 处理）
      return; // 面板打开时忽略底层按钮
    }
    for (const it of game.menuHits) {
      if (!it.hit(p.x, p.y)) continue;
      switch (it.key) {
        case 'accountOpen': game.menuPanel = { type: 'accountMenu' }; return;
        case 'tab':
          if(['shop','relic'].includes(it.data)){const E=require('../../prologue/encounters.js');if(!E.unlocked(game.meta,it.data,game.testProfile)){game.menuPanel={type:'featureLocked',message:E.messages[it.data]};return;}}
          if(it.data==='talent'){
            const access=require('../../talents/access.js');
            if(!access.unlocked(game.meta)){game.menuPanel={type:'talentLocked'};return;}
          }
          game.menuTab = it.data;
          game.menuPanel = null;
          return;
        case 'relicInfo':
          // 圣物图鉴：点圣遗物卡 → 详情面板（1/2/3★ 效果 + 升星）
          game.menuPanel = { type: 'relicInfo', id: it.data };
          return;
        case 'matchCfg': {const E=require('../../prologue/encounters.js'),id='match';if(!E.unlocked(game.meta,id,game.testProfile)){game.menuPanel={type:'featureLocked',message:E.messages[id]};return;}}

          // 主页三消技能配置行 → 三消技能配置面板
          game.menuPanel = { type: 'matchCfg', slot: it.data && it.data.slot || 'match4' };
          return;
        case 'globalCfg': {const E=require('../../prologue/encounters.js'),id='global';if(!E.unlocked(game.meta,id,game.testProfile)){game.menuPanel={type:'featureLocked',message:E.messages[id]};return;}}

          // 主页全局技能配置行 → 全局技能配置面板（滚动版：scrollY 归零）
          game.menuPanel = { type: 'globalCfg', index: it.data && it.data.index || 0, scrollY: 0 };
          return;
        case 'relicPage': {
          // 圣物图鉴：翻页
          const total = game._relicRunTotal();
          game.relicDexPage = Math.max(0, Math.min(total - 1, game.relicDexPage + it.data));
          return;
        }
        case 'codexSel':
          // 塔图鉴：切换选中塔
          if(!game.testProfile&&!game.meta.towerCodex[it.data]){game.menuPanel={type:'featureLocked',message:'战斗中首次建造该塔后解锁图鉴'};return;}
          game.codexSel = it.data;
          return;
        case 'codexSkill':
          // 塔图鉴：点技能卡 → 打开 A/B/C 分支效果面板
          game.menuPanel = { type: 'codexSkill', tower: it.data.tower, idx: it.data.idx };
          return;
        case 'codexLearn': {
          // 塔图鉴：金币学习解锁塔（回旋镖 3000 / 炮塔 5000）
          const key = it.data;
          game.menuPanel={type:'featureLocked',message:'战斗中首次建造该塔后解锁图鉴'};return;
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
          // 战场卡改为信息层：战场说明 + 专属掉落（不再提示未解锁/解锁条件，进场校验仍在 enter）
          game.menuPanel = { type: 'stageDrops', stage: game.menuStage };
          return;
        }
        case 'stagePrev':
        case 'stageNext': {
          // ◀ ▶ 按合约切换战场：未解锁战场不再静默跳过（可见、进场时校验）
          const order = FieldAccess.selectable(game.meta,game.testProfile);
          const dir = it.key === 'stageNext' ? 1 : -1;
          let idx = order.indexOf(game.menuStage);
          idx = Math.max(0,Math.min(order.length-1,idx+dir));
          game.menuStage = order[idx];
          const F2 = CONFIG.FIELDS[game.menuStage];
          const why=FieldAccess.reason(game.menuStage,game.meta,game.testProfile);

          return;
        }
        case 'enter': {
          // 按所选战场进入：测试战场 → 免三消直测；正式战斗需校验解锁（）
          game.menuPanel = null;
          const why=FieldAccess.reason(game.menuStage,game.meta,game.testProfile);
          if(why){FieldAccess.prompt(game,why);return;}
          if(game.menuStage==='test'){game.enterTestField();return;}
          game.newRun(true);
          return;
        }
        case 'relicDex':
          // 圣物图鉴：查看全部圣物图标（未获取锁定，获取后显示性能）
          game.menuPanel = { type: 'relicDex' };
          return;
        case 'starUp':
          // 圣遗物升星面板（碎片/金币/钻石 → 2★ 效果升级 / 3★ 质变）
          game.menuPanel = { type: 'starUp' };
          return;
        case 'shopShard': {
          // 每日碎片精选：点击图标 → 详情弹窗 + 确认购买（0 点刷新）
          const d = it.data;
          const def = CONFIG.relicRunDef(d.relic) || { name: d.relic, icon: '📿' };
          const rar = CONFIG.relicRarity(d.relic) || 'r';
          game.menuPanel = {
            type: 'shopDetail', kind: 'shard',
            item: {
              name: def.name || d.name, icon: def.icon || d.icon, rar,
              color: CONFIG.GO.RARITY[rar] || '#4aa3ff',
              desc: def.desc || '',
              price: d.price, shards: d.shards, relic: d.relic,
            },
          };
          return;
        }
        case 'adOffer': {
          const chest=it.data==='chest';
          game.menuPanel={type:'shopDetail',kind:'adReward',item:{adKey:it.data,name:chest?'每日免费青铜宝箱':'每日免费钻石',price:0,
            desc:chest?'完整观看广告，领取R碎片6～10、SR碎片1～2。每日一次，不含金币或钻石。':'完整观看广告，领取1钻石。每日一次。',color:'#86ccaa'}};
          return;
        }
        case 'shopSection':
          game._shopScrollVelocity = 0;
          game.shopScroll = Math.max(0, Math.min(game.renderer._shopMaxScroll || 0, [0, 648, 1296][it.data] || 0));
          return;
        case 'diamondOffer': {
          const offer=require('../../economy/diamond-shop.js').OFFERS[it.data];if(!offer)return;
          game.menuPanel={type:'shopDetail',kind:{gold:'diamondGold',star:'diamondStar',scarlet:'diamondScarlet'}[it.data],item:{name:offer.name,price:offer.price,desc:offer.desc,color:it.data==='scarlet'?'#dc706d':'#57b9b4'}};
          return;
        }
        case 'shopChest': {
          // 圣遗物宝箱：点击图标 → 详情弹窗 + 确认购买（每日限购）
          const cd = CONFIG.SHOP_CHEST[it.data.key];
          if (!cd) return;
          const rar = cd.rarities[0];
          game.menuPanel = {
            type: 'shopDetail', kind: 'chest',
            item: {
              name: cd.name, icon: cd.icon, color: cd.color, key: cd.key,
              price: cd.price, left: game.meta.shopChestLeft(cd.key),
              rarName: RAR_NAME[rar] || rar.toUpperCase(),
              desc: `随机开启 ${cd.shards.join('~')} 个${RAR_NAME[rar] || rar.toUpperCase()}色稀有度圣遗物碎片`,
            },
          };
          return;
        }
        case 'shopSkill': {
          // 技能解锁：点击图标 → 详情弹窗 + 确认购买（解锁后可在主页配置面板选用）
          const d = it.data;
          const def = (d.slot === 'global')
            ? (d.id === 'shuffle' ? CONFIG.GLOBAL_SKILL.shuffleSkill : CONFIG.GLOBAL_SKILL.refillSkill)
            : (CONFIG.MATCH_SKILL[d.slot].find((x) => x.id === d.id) || {});
          game.menuPanel = {
            type: 'shopDetail', kind: 'skill',
            item: {
              name: def.name || d.id, icon: def.mark || def.icon || '✦',
              color: def.color || '#ffb84d', desc: def.desc || '',
              price: CONFIG.SKILL_UNLOCK.price[d.slot], slot: d.slot, id: d.id,
              owned: game.meta.skillUnlocked(d.slot, d.id),
            },
          };
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
          // 深度宝箱：就绪点击开启；未就绪提示剩余时间（钻石足够则提示可速开）
          const m = game.meta;
          const ch = m.deepChests[it.data];
          if (!ch) { game.toast('空槽位 · 局末按最深波次获得', '#5a6c80'); return; }
          if (m.chestReady(ch)) {
            const gain = m.openDeepChest(it.data);
            game.save.save();
            if (gain) game.menuPanel = { type: 'chestOpen', mode: 'deep', gain, tier: ch.tier, openedAt: Date.now() };   // .9d 开箱弹窗：收益一次弹出
            return;
          }
          const tier = CONFIG.DEPTH_CHEST.tiers.find((t) => t.key === ch.tier);
          const remainMin = Math.max(0, Math.ceil((ch.openAt - Date.now()) / 60000));
          const cost = Math.max(1, Math.ceil(remainMin / 60 * 4));
          if (m.diamond >= cost && m.speedOpen(it.data)) {
            const gain = m.openDeepChest(it.data);
            game.save.save();
            if (gain) game.menuPanel = { type: 'chestOpen', mode: 'deep', gain, tier: ch.tier, openedAt: Date.now() };   // .9d 速开同样弹窗
            return;
          }
          game.toast(`${tier.name} 开启中 · 还需 ${remainMin} 分钟（${cost}💎 立即开启）`, '#9fb2c3');
          return;
        }
        case 'debug':
          // 调试工具入口（仅 DEBUG 构建）
          game.menuPanel = { type: 'debug' };
          return;
        default:
          return;
      }
    }
}

// 局外商店详情弹窗的确认购买：按 kind 分发到对应业务，成功后关窗 / 进入开箱演出
function confirmShopBuy(game) {
  const pnl = game.menuPanel;
  const item = pnl && pnl.item;
  if (!item) return;
  if (pnl.kind === 'adReward') { require('../flows/ad-actions.js').watch(game,item.adKey); return; }
  if (['diamondGold','diamondStar','diamondScarlet'].includes(pnl.kind)) {
    const m=game.meta,old={gold:m.gold,diamond:m.diamond,shards:m.shards,relicDust:m.relicDust,totalDiamondSpent:m.totalDiamondSpent},key={diamondGold:'gold',diamondStar:'star',diamondScarlet:'scarlet'}[pnl.kind];
    let result;try{result=require('../../economy/diamond-shop.js').buy(m,key);if(!result.ok){game.toast(result.reason==='diamond'?'钻石不足':'奖励生成失败','#ff6b6b');return;}if(game.save.save()===false)throw Error('save');}catch(error){Object.assign(m,old);game.toast('保存失败，未扣除钻石，请重试','#ff6b6b');return;}
    if(key!=='gold')game.menuPanel={type:'chestOpen',mode:'shop',tier:key,gain:result.gain,openedAt:Date.now()};
    else{game.menuPanel=null;game.toast('金币 +1000','#f7c948');}
    game.menuHits=[];return;
  }
  if (pnl.kind === 'shard') {
    const res = game.meta.buyShardOffer({ relic: item.relic, shards: item.shards, price: item.price });
    if (!res.ok) { game.toast('金币不足', '#ff6b6b'); return; }
    game.save.save();
    game.toast(`获得 ${item.icon} ${item.name} 碎片 ×${item.shards}`, '#7ef0a3');
    game.menuPanel = null;
    return;
  }
  if (pnl.kind === 'chest') {
    const res = game.meta.buyShopChest(item.key);
    if (!res.ok) {
      if (res.reason === 'limit') game.toast('今日次数已用完，明天再来', '#ff6b6b');
      else if (res.reason === 'gold') game.toast('金币不足', '#ff6b6b');
      return;
    }
    game.save.save();
    game.menuPanel = { type: 'chestOpen', mode: 'shop',
      tier: ({ wood: 'wood', star: 'star', blue: 'bronze', purple: 'silver', gold: 'gold' })[item.key],
      gain: { dust: res.dust, shardDetail: Object.fromEntries(res.gains.map(g => [g.id, g.n])) }, openedAt: Date.now() };
    game.menuHits = [];
    return;
  }
  if (pnl.kind === 'skill') {
    if (game.meta.skillUnlocked(item.slot, item.id)) { game.toast('该技能已解锁', '#9fb2c3'); return; }
    const res = game.meta.unlockSkill(item.slot, item.id);
    if (!res.ok) { if (res.reason === 'gold') game.toast('金币不足', '#ff6b6b'); return; }
    game.save.save();
    game.toast(`解锁技能 · ${item.name}`, '#7ef0a3');
    game.menuPanel = null;
    return;
  }
}

module.exports = { onMenuTap };
