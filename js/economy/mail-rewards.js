/**
 * mail-rewards.js —— 邮件奖励：校验和归一化附件，合并奖励，并发放到玩家档案。
 * 兼容旧钻石邮件和旧红卡编号；碎片溢出沿用圣遗物成长系统转为粉尘。
 */
'use strict';
const CONFIG = require('../config.js');
const { legacy } = require('../config/red-relics.js');
const currencies = ['diamond', 'gold', 'relicDust'];
const names = { diamond: '钻石', gold: '金币', relicDust: '圣物粉尘' };

// 配置校验使用 strict 模式，遇到非法字段或数量即拒绝；读取旧存档时则忽略无效项。
function normalize(input, strict = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const result = { diamond: 0, gold: 0, relicDust: 0, shards: {} };
  if (strict && Object.keys(input).some((k) => !currencies.includes(k) && k !== 'shards'))
    return null;
  for (const key of currencies) {
    const n = input[key] == null ? 0 : Number(input[key]);
    if (!Number.isSafeInteger(n) || n < 0) {
      if (strict) return null;
    } else result[key] = n;
  }
  if (input.shards != null && (typeof input.shards !== 'object' || Array.isArray(input.shards))) {
    if (strict) return null;
  } else
    for (const [raw, n] of Object.entries(input.shards || {})) {
      // 旧红卡编号在此映射到当前红卡，避免历史邮件发出已退役碎片。
      const id = legacy[raw] || raw,
        count = Number(n);
      if (!CONFIG.relicRunDef(id) || !Number.isSafeInteger(count) || count < 0) {
        if (strict) return null;
        continue;
      }
      if (count) result.shards[id] = (result.shards[id] || 0) + count;
    }
  return result;
}

function nonempty(rewards) {
  return (
    !!rewards &&
    (currencies.some((k) => rewards[k] > 0) || Object.values(rewards.shards).some((n) => n > 0))
  );
}

// 优先读取新的多种附件结构，兼容旧版本仅存 diamond 的邮件。
function ofMail(mail) {
  return normalize(mail.rewards || { diamond: mail.diamond }) || normalize({});
}

// 生成统一展示列表，供邮件行高、附件文本和领取提示共用。
function entries(rewards) {
  const list = currencies
    .filter((k) => rewards[k] > 0)
    .map((key) => ({ key, label: names[key], amount: rewards[key] }));
  for (const [id, n] of Object.entries(rewards.shards || {}))
    if (n > 0) {
      const def = CONFIG.relicRunDef(id);
      list.push({ key: 'shard', id, label: (def ? def.name : id) + '碎片', amount: n });
    }
  return list;
}

function summary(rewards) {
  return entries(rewards)
    .map((item) => item.label + ' ×' + item.amount)
    .join('、');
}

// 合并多封邮件中的同类货币和同一圣遗物碎片，供一键领取使用。
function combine(mails) {
  const total = normalize({});
  for (const mail of mails) {
    const rewards = ofMail(mail);
    for (const key of currencies) total[key] += rewards[key];
    for (const [id, n] of Object.entries(rewards.shards))
      total.shards[id] = (total.shards[id] || 0) + n;
  }
  return total;
}

// 沿用碎片容量与溢出粉尘规则；返回实际保留的碎片和包含溢出收益的粉尘数。
function apply(meta, rewards) {
  const actual = { ...rewards, shards: {} };
  for (const key of currencies) meta[key] = (Number(meta[key]) || 0) + rewards[key];
  // 先复制碎片表再发放，保存失败时业务层才能恢复原表。
  if (Object.keys(rewards.shards).length) meta.shards = { ...meta.shards };
  for (const [id, n] of Object.entries(rewards.shards)) {
    const result = require('../relics/progression.js').addShard(meta, id, n);
    if (result.kept) actual.shards[id] = result.kept;
    actual.relicDust += result.dust;
  }
  return actual;
}

module.exports = { normalize, nonempty, ofMail, entries, summary, combine, apply };
