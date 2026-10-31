// Workflow methods run on the current GameMain host; no game state is cached here.
const CONFIG = require('../../config.js');
const RelicKill = require('../../relics/kill-hooks.js');
const GS_BALANCE = require('../../config/global-balance.js');

module.exports = {
  onKillReward(e) {
    // v1.14 测试战场：无击杀奖励（不涨经验/不掉宝箱，专注技能验证）
    if (this.state === 'testfield') return;
    const b = this.meta.relicBonus();
    // 经验：整体经验池（v1.8：塔不再单独获取经验，统一按整体等级成长）；v1.16.78 经验之心：击杀经验 +N%（按星级）
    RelicKill.experience(this.run, e, b);
    // v1.12.1：战斗中击杀只积累升级待选（pending），不弹三选一打断战斗；
    // 升级三选一统一在波末「波次完成 → 继续」时结算（v1.8 设计：波末逐次结算）
    // 精英怪：概率掉落战场宝箱（寻宝罗盘加成；v1.16.78 赏金猎人 +N%）；v1.16.96 赏金猎人3★ 连续3波无宝箱必掉
    if (e.type === 'elite') {
      const chance = RelicKill.eliteChestChance(this.run, b);
      if (Math.random() < chance || this.run.bountyGuarantee()) {
        this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: 'elite' });
        this.run._waveChestDropped = true;
        this.toast('精英掉落宝箱 📦 点击开启', '#f7c948');
      }
    }
    // Boss：掉落战场宝箱（点击三选一）+ 主界面宝箱计数（每 5 波）
    if (e.isBoss) {
      if (!e.isFinalBoss) this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: 'boss' });
      this.run._waveChestDropped = true;
      this.meta.chests += 1;
      this.toast(e.isFinalBoss ? '终极Boss宝箱已存入主界面' : 'Boss 掉落宝箱 📦 点击开启', '#f7c948');
      this.save.save();
    }
    /* v1.16.76 击杀掉落线：碎片（即时入账，不受宝箱槽位限制）+ 小额击杀银币 */
    const field = this.field || CONFIG.FIELDS.ancient;
    if (field.dropAttr && field.dropAttr !== 'none') {
      const KD = CONFIG.KILL_DROP;
      let n = 0;
      if (e.type === 'elite' && Math.random() < KD.eliteShardChance) n = Math.random() < 1 / 3 ? 2 : 1;
      if (e.isBoss) n = KD.bossShardBase + (Math.random() < KD.bossShardBonusChance ? 2 : 0);
      if (n > 0) {
        const id = CONFIG.randomShardId(field.dropAttr);
        if (id) {
          // v1.17.20 碎片改「局内记账 → 局末入账」：此处不再直接 meta.addShard，
          //   否则失守时无法按 30% 折算收回（详见 settleRunShards）
          this.runShardGained += n;
          this.runShardDetail[id] = (this.runShardDetail[id] || 0) + n;   // v1.17 碎片明细（击杀掉落）
          this.toast(`🧩 圣遗物碎片 +${n}（局末结算）`, '#a86bff');
        }
      }
      // v1.17 击杀银币：单怪 (5~10 浮动) × 代际等级系数（Lv1=1，50波平均≈2倍）× 类型倍率（精英×3/Boss×8）× 战场银币倍率
      // 替代旧 1.06^w 波次通胀：收益成长改由怪物代际等级驱动（与血量曲线同源）
      const kg = Math.round((KD.killGold[0] + Math.random() * (KD.killGold[1] - KD.killGold[0]))
        * KD.goldLevelMult(e.genLv)
        * (e.isBoss ? KD.bossGoldMult : (e.type === 'elite' ? KD.eliteGoldMult : 1))
        * (field.goldMult || 1));
      const earned = kg * (this.run.gsState && this.run.gsState.gold > 0 ? GS_BALANCE.gold.multiplier : 1);
      this.run.gold += earned;
      if (earned > kg) this.fx.push({type:'floatText',text:'+'+earned,x:e.x,y:e.y,t:0,dur:0.8,size:20,color:'#ffe17c'});
    }
  },

  _relicRunTotal() {
    let n = 0;
    Object.values(CONFIG.RELIC_RUN.tower).forEach((l) => { n += l.length; });
    return n + CONFIG.RELIC_RUN.common.length + (CONFIG.RELIC_RUN.ur || []).length;
  },

  spawnRelicPick(mode) {
    const star3Mode = mode === 'star3';
    const cands = this._rollRelicCandidates(star3Mode);
    if (star3Mode && (!cands || !cands.length)) {
      this.toast('尚未拥有任何圣遗物，先解锁 1 个再来测试 3★', '#9fb2c3'); this._chestBusy = false; return;
    }
    if (!star3Mode && (!cands || !cands.length)) {
      this.toast('圣遗物已全部解锁，宝箱折算为碎片', '#a86bff');
      // v1.16.78 全解锁兜底：宝箱仍折算少量碎片，避免点击无反馈
      const shardId = CONFIG.randomShardCardId(Math.random() < 0.5 ? 'sr' : 'r');
      // v1.17.20 同样只记账，局末随其他碎片一起按比例入账
      if (shardId) {
        this.runShardGained += 1;
        this.runShardDetail[shardId] = (this.runShardDetail[shardId] || 0) + 1;   // v1.17 碎片明细（全解锁折算）
      }
      this.save.save();
      this._chestBusy = false;
      return;
    }
    this.pendingRelicPicks.push({ candidates: cands, ...(star3Mode ? { star3: true } : {}) });
    this._chestBusy = false; // v1.16.74 动画完成解锁战斗输入
  },

  _rollRelicCandidates(star3Mode) {
    const RR = CONFIG.RELIC_RUN;
    const star3 = !!star3Mode;
    // 在场塔（本局已激活的塔色）+ 通用池；候选带 tint（塔色/金色）供弹层圆底配色
    const ownedKeys = this.run.slotOrder || [];
    const meta = this.meta;
    const isUnlocked = (id) => meta.starOf(id) >= 1;   // v1.16.78 已解锁（图鉴/碎片达阈值）不再出现在三选一
    let pool = [];
    if (star3) {
      ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: k }); }); });
      RR.common.forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: 'common' }); });
      if (!pool.length) return null;
      // 3★ 模式：候选 = 已拥有池中随机 3 张（不重复），desc 取 star3
      const cands3 = [];
      const used3 = new Set();
      for (let i = 0; i < 3; i++) {
        const tier = pool.filter((p) => !used3.has(p.def.id));
        if (!tier.length) break;
        const pick = tier[Math.floor(Math.random() * tier.length)];
        used3.add(pick.def.id);
        cands3.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.star3 || pick.def.desc, run: true, tint: pick.tint });
      }
      return cands3;
    }
    ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: k }); }); });
    RR.common.forEach((d) => { if (!isUnlocked(d.id)) pool.push({ def: d, tint: 'common' }); });
    if (!pool.length) return null;
    // 稀有度权重：依次抽 3 个稀有度，每个稀有度随机抽 1 张（已用不重复；稀有度无剩余时从全池补）
    const W = CONFIG.RELIC_PICK_WEIGHT;
    const pickRar = () => { const r = Math.random(); return r < W.r ? 'r' : r < W.r + W.sr ? 'sr' : 'ssr'; };
    const cands = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const rar = pickRar();
      let tier = pool.filter((p) => CONFIG.relicRarity(p.def.id) === rar && !used.has(p.def.id));
      if (!tier.length) tier = pool.filter((p) => !used.has(p.def.id));
      if (!tier.length) break;
      const pick = tier[Math.floor(Math.random() * tier.length)];
      used.add(pick.def.id);
      cands.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.desc, run: true, tint: pick.tint });
    }
    return cands;
  },

  rerollRelicPick() {
    if (!this.relicPick) return false;
    const n = this.relicPick.rerolls || 0;
    const costs = CONFIG.RELIC_REROLL.costs;
    if (n >= costs.length) { this.toast('已达重掷上限', '#9fb2c3'); return false; }
    const cost = costs[n];
    if (this.run.gold < cost) { this.toast(`银币不足（需 ${cost}）`, '#ff6b6b'); return false; }
    const cands = this._rollRelicCandidates(!!this.relicPick.star3);
    if (!cands || !cands.length) { this.toast('暂无可用候选', '#9fb2c3'); return false; }
    this.run.gold -= cost;
    this.relicPick.rerolls = n + 1;
    this.relicPick.candidates = cands;
    this.relicPickHits = []; // 命中区随候选刷新
    this.toast(`已重掷 · 消耗 ${cost} 🪙`, '#f7c948');
    return true;
  },

  relicPickChoice(i) {
    const c = this.relicPick && this.relicPick.candidates[i];
    if (!c) return;
    if (c.run) {
      // v1.16.78 防御兜底：已解锁重复（三选一已过滤，正常不触发）→ 折算碎片不叠层
      // v1.16.108 测试战场豁免：3★ 模式候选均为已拥有圣遗物，若走折算分支会 return 卡死弹层 → 测试战场直接注入本局生效
      if (this.meta.starOf(c.id) >= 1 && this._relicReturnState !== 'testfield') {
        const n = CONFIG.DUPLICATE_SHARDS[CONFIG.relicRarity(c.id)] || 2;
        // v1.17.20 重复折算同样走「局末入账」，失守时一起按比例折算
        this.runShardGained += n;
        this.runShardDetail[c.id] = (this.runShardDetail[c.id] || 0) + n;   // v1.17 碎片明细（重复圣遗物折算）
        this.toast(`重复圣遗物 → ${c.icon}${c.name} 碎片 +${n}（局末结算）`, '#a86bff');
        this.save.save();
        return;
      }
      // 局内圣遗物（rougelike）：本局生效 + 图鉴解锁（跨局记录）
      this.runRelics.push(c.id);
      this.run.runRelic[c.id] = (this.run.runRelic[c.id] || 0) + 1;
      const wasLocked = this.meta.starOf(c.id) < 1;   // v1.17.20 记录「本局选中即解锁」，失败折算不回退
      this.meta.codexUnlock(c.id);
      if (wasLocked) this.runUnlocked.push(c.id);
      // v1.16.113 记录 3★ 生效标记：测试战场 3★ 注入 或 真实已升 3★
      const isStar3 = (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) || this.meta.starOf(c.id) >= 3;
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: isStar3 }); // v1.16.73 详情弹层需要 desc
      this.save.save();
      this.toast(isStar3 && this._relicReturnState === 'testfield' ? `★3 质变注入：${c.icon}${c.name}` : '获得圣遗物 ' + c.icon + c.name, '#ffb347');
    } else {
      this.meta.addRelic(c.id);
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: this.meta.starOf(c.id) >= 3 }); // v1.9：本局圣物展示；v1.16.73 带 desc
      this.save.save();
      this.toast('获得圣物 ' + c.icon + c.name, '#f7c948');
      this.run.relicFx(c.id, '已生效'); // v1.17 圣遗物生效提示（★星级 + 名称 + 圣遗物色）
    }
    this.relicPick = null;
    // v1.16.104 测试战场 3★ 模式：选中圣遗物按 3★ 质变注入（无需真实 3★ 解锁）
    if (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) {
      this.run._testStar3Mode = true;
      this.run._testStar3 = this.run._testStar3 || {};
      this.run._testStar3[c.id] = true;
    }
    this._lastPickStar3 = false;
    // v1.16.73 返回来源状态（测试战场添加圣遗物 → 回到 testfield；战场宝箱 → fighting）
    this.state = this._relicReturnState || 'fighting';
    this._relicReturnState = null;
    if (this.pendingRelicPicks.length) return; // 还有宝箱：下帧继续弹
    if (this.state === 'fighting' && this.run.effects.pendingTotal() > 0) this.flushUpgrades(); // 顺带处理升级待选
  }
};
