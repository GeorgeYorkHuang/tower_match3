// Workflow methods run on the current GameMain host; no game state is cached here.
const CONFIG = require('../../config.js');

module.exports = {
  finishRun(evacuated) {
    if (this.state === 'gameover' && this.runSummary) return;
    if (!evacuated && this.run.lineHp <= 0 && !this.run.adRevived && !this.run.adReviveDeclined && this.menuStage !== 'test') {
      this.state = 'reviveOffer'; this.shopOpen = false; this.funcLayer = null; this.dmgStat = false;
      return;
    }
    const EV = CONFIG.EVAC;
    // 深渊裂隙合约：深度结算 ×2（deepMult）
    const deepMult = (this.field && this.field.deepMult) || 1;
    const payout = Math.round(this.depthPool * (evacuated ? 1 : EV.deadRatio) * deepMult);
    this.meta.gold += payout;
    // 战斗结束统一结算金币：局内银币（波末累加 + 击杀）按深度池口径折算（poolShare=50%）
    //   折算系数对齐 EV.poolShare，使「局内银币→局外金币」与深度结算 payout 数量级相当（招财符按星级 +20%）
    const b = this.meta.relicBonus();
    const silver = Math.round(this.run.gold * EV.poolShare * (1 + 0.20 * b.gold));
    if (silver > 0) {
      this.meta.gold += silver;
      this.silverGained = silver;
    }
    this.run.gold = 0;
    if(this.menuStage==='ancient') this.meta.ancientBestWave=Math.max(this.meta.ancientBestWave||0,this.run.wave);
    const miles = this.meta.checkMilestone(this.run.wave);   // 首达里程碑 + 更新最深波次
    // 前三波阵亡取消深度宝箱低保（木箱不再发放；撤离最早 10 波不受影响）
    const noChest = !evacuated && this.run.wave <= 3;
    const cleared = this.run.clearedWaves || 0;
    const tier = noChest || cleared < 1 ? null : this.meta.tierByWave(cleared);
    let chestExtra = null, chestExtraFull = false;
    const ok1 = tier ? this.meta.grantDeepChest(tier) : false;
    if (evacuated && cleared >= CONFIG.EVAC.lateWave) {
      // 撤离成功顶配加发：星辉→黄金 / 黄金→白银（低一档宝箱）
      const idx = CONFIG.DEPTH_CHEST.tiers.indexOf(tier);
      const lower = CONFIG.DEPTH_CHEST.tiers[Math.max(0, idx - 1)];
      if (this.meta.grantDeepChest(lower)) chestExtra = lower.name;
      else chestExtraFull = true;
    }
    this.save.save();
    // 结算数据补全：总击杀 + 本局圣遗物快照 + 招财符加成系数（结算界面展示）
    const ks = this.combat && this.combat.kills ? Object.values(this.combat.kills).reduce((a, b) => a + b, 0) : 0;
    // 碎片统一入账：撤离全额，失守按 SHARD_SETTLE.deadRatio 折算（floor 张数 + 随机保留）
    const ss = this.settleRunShards(evacuated ? 1 : CONFIG.SHARD_SETTLE.deadRatio);
    this.runSummary = {
      evacuated, wave: this.run.wave, stage: this.menuStage, payout, miles,
      cleared: this.run.clearedWaves || 0,   // 全歼波数（通关数口径：一波怪全部死亡才算，非「到达第几波」）
      chestName: tier ? tier.name : null, chestKey: tier ? tier.key : null, chestGranted: ok1, chestExtra, chestExtraFull,   // chestKey：结算页宝箱档位图标
      chestSkipped: noChest,   // 前三波阵亡无宝箱（结算页区分提示）
      // 碎片三件套：raw=掉落总张数 / kept=折算后保留 / lost=损失（失败态展示"损失 N"）
      bonusShardDetail: ss.awardedDetail,
      relicDust: ss.dust,
      shards: ss.kept, depthMult: this.depthMult,
      shardDetail: ss.finalDetail,      // 折算后明细（结算页按此绘制图标×数量）
      shardsRaw: ss.raw, shardsLost: ss.lost,
      unlockedThisRun: this.runUnlocked.slice(),   // 本局三选一选中即解锁的圣遗物（失败不回退）
      relicCards: this._buildRelicCards(ss.finalDetail),   // 结算大卡数据（稀有度→碎片数降序）
      silver: this.silverGained || 0,   // 局内银币按深度池口径折算的金币
      goldBonus: 0.2 * b.gold,          // 招财符加成系数（结算页展示）
      kills: ks,                        // 本局总击杀
      relics: this.battleRelics.slice(), // 本局获取圣遗物快照（结算页图标展示）
    };
    this.gameoverAt = Date.now();   // 结算动画时间基准（圣遗物逐个弹出 → 收益最后弹出）
    this.gameoverSkip = false;      // 每局结算重置跳过标记（点击任意处置 true 直达演出终点）
    this.anim = null;
    this.combat.shots = []; this.combat.delayed = [];
    this.dmgNumbers.clear();
    this.state = 'gameover';
    this.sfx.stopBgm();
  },

  _buildRelicCards(detail) {
    const W = { ssr: 0, sr: 1, r: 2 };
    return Object.keys(detail || {}).filter(id => Number(detail[id]) > 0).map(id => ({
      id, rarity: CONFIG.relicRarity(id), star: this.meta.starOf(id) || 0,
      shards: Number(detail[id]),
    })).sort((a, c) => ((W[a.rarity] ?? -1) - (W[c.rarity] ?? -1)) || (c.shards - a.shards));
  },

  settleRunShards(ratio) {
    const detail = this.runShardDetail || {};
    const pool = [];
    Object.keys(detail).forEach((id) => {
      const n = detail[id] | 0;
      for (let i = 0; i < n; i++) pool.push(id);
    });
    const raw = pool.length;
    const r = (typeof ratio === 'number' && ratio >= 0) ? Math.min(1, ratio) : 1;
    const kept = Math.max(0, Math.floor(raw * r));
    // 只保留前 kept 张 → 先打乱（kept < raw 时才需要随机；全额时不洗牌，保证明细稳定）
    if (kept < raw && kept > 0) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
    }
    const finalDetail = {};
    for (let i = 0; i < kept; i++) {
      const id = pool[i];
      finalDetail[id] = (finalDetail[id] || 0) + 1;
    }
    const awardedDetail = Object.assign({}, finalDetail);
    let dust = 0;
    Object.keys(finalDetail).forEach(id => {
      const result = this.meta.addShard(id, finalDetail[id]);
      dust += result.dust;
      if (result.kept) finalDetail[id] = result.kept;
      else delete finalDetail[id];
    });
    const res = { finalDetail, awardedDetail, raw, kept, dust, lost: raw - kept };
    // 清空本局账本，避免重复入账（goMenu/restart 与 finishRun 都会调本方法）
    this.runShardDetail = {};
    this.runShardGained = 0;
    if (raw > 0) this.save.save();
    return res;
  },

  settleRunShardsOnExit(reason) {
    if (!this.runShardGained || this.runShardGained <= 0) return;
    const ss = this.settleRunShards(CONFIG.SHARD_SETTLE.deadRatio);
    if (ss.raw > 0) {
      this.toast(`${reason} · 碎片按 ${Math.round(CONFIG.SHARD_SETTLE.deadRatio * 100)}% 结算 ${ss.kept}/${ss.raw}`, '#a86bff');
    }
  }
};
