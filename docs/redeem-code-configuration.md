# 兑换码配置说明

编辑文件：`js/config/redeem-codes.js`

无需修改其他业务代码。复制文件里的注释示例，加到 module.exports 对象里，保存后重新编译。每段配置末尾保留逗号。

## 新增一个兑换码

```js
garden2026: {
  enabled: true,
  title: '圣庭补给',
  body: '你的补给已送达，请查收。',
  rewards: {
    diamond: 50,
    gold: 1000,
    relicDust: 100,
    shards: {
      ur_sanctum_fire: 5,
      r_fire_atk: 2,
    },
  },
},
```

上面的 garden2026 即玩家输入的兑换码。示例仅存在于说明和配置注释中，尚未启用为正式兑换码。

| 字段 | 含义 |
| --- | --- |
| enabled | true 可兑换，false 停用；省略时可兑换 |
| title | 邮件标题，可省略 |
| body | 邮件正文，可省略 |
| rewards.diamond | 钻石数量 |
| rewards.gold | 金币数量 |
| rewards.relicDust | 圣物粉尘数量 |
| rewards.shards | 圣遗物ID到碎片数量的映射 |

奖励数量为非负整数；不需要的项目直接删掉或省略。至少配置一项正数奖励。写错字段名、未知碎片ID、负数或小数时，该码不会发奖，也不会扣掉兑换机会。

## 红色圣遗物碎片ID

| ID | 圣遗物 |
| --- | --- |
| ur_sanctum_fire | 圣庭·烬火圣印 |
| ur_sanctum_cannon | 圣庭·轰鸣核心 |
| ur_sanctum_boomerang | 圣庭·回风徽记 |
| ur_sanctum_electric | 圣庭·雷脉棱晶 |
| ur_sanctum_ice | 圣庭·霜心圣晶 |
| ur_sanctum_poison | 圣庭·蚀生之种 |

其他碎片示例：r_fire_atk 为火·强攻。普通圣遗物的ID可在 js/config/relic-catalog.js 查找。

## 生效与领取规则

- 忽略兑换码大小写和首尾空格；同一存档每个码只能使用一次。
- 兑换成功先发送邮件，领取后奖励到账。
- 邮件按兑换时的奖励配置保存，之后修改配置不会改变已经发出的奖励。
- 删除已领取邮件、停用或从配置中移除兑换码，都不清除已用记录；重新发一份奖励应使用新的兑换码。
- 已发邮件不受 enabled 后续变更影响，仍可领取。
- 碎片按现有养成规则入账，满额的普通碎片自动转换粉尘。
- 单封领取与一键领取支持混合奖励，保存失败回滚全部奖励和领取状态。

原有 vip666、vip888 均保留50钻石。旧版钻石奖励邮件仍可领取。
