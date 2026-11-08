/**
 * mail.js —— 邮箱业务：整理邮件存档、兑换码发信、领取附件和删除已领取邮件。
 * 领取与兑换通过统一保存事务执行，保存失败时恢复邮件、兑换记录和奖励资产。
 */
'use strict';
const CODES = require('../config/redeem-codes.js'),
  Rewards = require('./mail-rewards.js');

// 统一兑换码大小写和首尾空格，使输入方式不影响兑换记录。
function codeOf(input) {
  return String(input || '')
    .trim()
    .toLowerCase();
}

// 载入时去重并补齐旧邮件字段；兑换历史独立保留，不随邮件删除或配置停用而清空。
function normalize(data) {
  const seen = new Set(),
    mails = (Array.isArray(data.mails) ? data.mails : [])
      .filter((m) => m && typeof m.id === 'string' && !seen.has(m.id) && seen.add(m.id))
      .map((m) => {
        const rewards = Rewards.ofMail(m);
        return {
          id: m.id,
          title: String(m.title || '奖励邮件'),
          body: String(m.body || ''),
          diamond: rewards.diamond,
          rewards,
          createdAt: Math.max(0, Number(m.createdAt) || 0),
          claimed: !!m.claimed,
          claimedAt: Math.max(0, Number(m.claimedAt) || 0),
        };
      }),
    redeemedCodes = Object.create(null);
  for (const [key, value] of Object.entries(data.redeemedCodes || {}))
    if (value && codeOf(key)) redeemedCodes[codeOf(key)] = true;
  return { mails, redeemedCodes };
}

// 返回排序副本：未领取优先，同状态按新邮件在前，不改动存档原始顺序。
function list(meta) {
  return (meta.mails || [])
    .slice()
    .sort((a, b) => Number(a.claimed) - Number(b.claimed) || b.createdAt - a.createdAt);
}

// 兑换仅发送邮件，并把当时的奖励配置复制进附件；实际资产在领取时到账。
function redeem(meta, input, now = Date.now()) {
  const code = codeOf(input),
    entry = Object.entries(CODES).find(([key]) => codeOf(key) === code);
  if (!entry) return { ok: false, reason: 'code' };
  const config = entry[1];
  if (!config || config.enabled === false) return { ok: false, reason: 'disabled' };
  const state = normalize(meta);
  if (state.redeemedCodes[code] || state.mails.some((m) => m.id === 'redeem:' + code))
    return { ok: false, reason: 'used' };
  const rewards = Rewards.normalize(
    config.rewards || {
      diamond: config.diamond,
      gold: config.gold,
      relicDust: config.relicDust,
      shards: config.shards,
    },
    true
  );
  if (!Rewards.nonempty(rewards)) return { ok: false, reason: 'reward' };
  const mail = {
    id: 'redeem:' + code,
    title: String(config.title || '兑换码奖励'),
    body: String(config.body || '兑换码 ' + code + ' 的奖励，请查收。'),
    diamond: rewards.diamond,
    rewards,
    createdAt: now,
    claimed: false,
    claimedAt: 0,
  };
  meta.mails = state.mails.concat(mail);
  meta.redeemedCodes = { ...state.redeemedCodes, [code]: true };
  return { ok: true, mail };
}

// id 为空表示一键领取；先筛掉已领取邮件，合并附件后统一发放并标记。
function claim(meta, id, now = Date.now()) {
  const mails = meta.mails || [],
    selected = mails.filter((m) => !m.claimed && (id == null || m.id === id));
  if (!selected.length) return { ok: false, reason: 'empty' };
  const ids = new Set(selected.map((m) => m.id)),
    total = Rewards.combine(selected),
    rewards = Rewards.apply(meta, total);
  meta.mails = mails.map((m) => (ids.has(m.id) ? { ...m, claimed: true, claimedAt: now } : m));
  return { ok: true, count: selected.length, diamond: rewards.diamond, rewards };
}

// 只删除已领取邮件，未领取附件继续保留，兑换历史也不重置。
function deleteClaimed(meta) {
  const mails = meta.mails || [],
    kept = mails.filter((m) => !m.claimed),
    count = mails.length - kept.length;
  if (!count) return { ok: false, reason: 'empty' };
  meta.mails = kept;
  return { ok: true, count };
}

// 统一包裹会写入档案的操作；保存返回失败或抛错时恢复操作前的数据引用。
function transact(game, operation) {
  const m = game.meta,
    old = {
      mails: m.mails,
      redeemedCodes: m.redeemedCodes,
      diamond: m.diamond,
      gold: m.gold,
      relicDust: m.relicDust,
      shards: m.shards,
    };
  try {
    const result = operation(m);
    if (!result.ok) return result;
    if (game.save.save() === false) {
      Object.assign(m, old);
      return { ok: false, reason: 'save' };
    }
    return result;
  } catch (error) {
    Object.assign(m, old);
    return { ok: false, reason: 'save' };
  }
}

module.exports = { normalize, list, redeem, claim, deleteClaimed, transact };
