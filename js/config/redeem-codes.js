'use strict';
/**
 * 兑换码配置：新增兑换码只需在下方复制一段配置，保存后重新编译。
 * 兑换码忽略大小写及首尾空格，每个存档每码只能兑换一次。
 * enabled: false 可关闭该码；已发送到邮箱的奖励不受后续配置变更影响。
 * rewards 支持：diamond 钻石、gold 金币、relicDust 圣物粉尘、shards 指定圣遗物碎片。
 * 所有数量使用非负整数；不需要的奖励可省略。
 */
module.exports = {
  vip666: {
    enabled: true,
    title: '兑换码奖励',
    body: '感谢支持圣坛裂痕，请查收奖励。',
    rewards: { diamond: 50 },
  },
  vip888: {
    enabled: true,
    title: '兑换码奖励',
    body: '感谢支持圣坛裂痕，请查收奖励。',
    rewards: { diamond: 50 },
  },
  mimi: {
    enabled: true,
    title: '兑换码奖励',
    body: '咪群友的测试专属测试码。',
    rewards: { diamond: 5000 },
  },

  // 新增示例：取消下面注释，修改兑换码、enabled 和奖励即可。
  // garden2026: {
  //   enabled: false,
  //   title: '圣庭补给',
  //   body: '你的专属补给已送达。',
  //   rewards: {
  //     diamond: 20,
  //     gold: 1000,
  //     relicDust: 100,
  //     shards: {
  //       ur_sanctum_fire: 5, // 圣庭·烬火圣印
  //       r_fire_atk: 2,     // 火·强攻
  //     },
  //   },
  // },
};
