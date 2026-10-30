# W可领取任务：战斗反馈与连消方案（v1）

状态：供owner转发，未向W会话代发。评估采用game-designer工作流，仅用于设计/分工；现有重构继续由Codex执行。

## 结论与边界

| 项目 | 对拆分影响 | W交付 | Codex接线 |
|---|---|---|---|
| 隐藏怪物血条 | 低；纯显示，不删hp/maxHp/尾条状态 | combat-presentation配置与验收说明 | render.enemies/drawEnemyBar显示开关；默认仅怪物，城墙保持 |
| 按塔色显示伤害数字 | 低到中；展示可并行，事件入口需统一 | 独立damage-numbers表现模块、六色映射/格式/密集显示规则与测试 | damage.js事件发出、statuses腐化直接扣血补覆盖、Renderer效果分发 |
| 连消全部方块转攻击弹道 | 中；涉及伤害次数与时序，不能只改表现 | 独立清除格归一/去重与弹道数据模块、动画草案/测试 | Run._chainBonus、消除动画阶段、spawnChainShots与命中接线 |

第一、二项可先交W，第三项可并行做独立模块与方案；W不要直接改combat.js、combat/damage.js、combat/statuses.js、run.js、match3.js、main.js或render.js，也不改正在迁移的towers目录。Codex顺序集成，避免同文件冲突。

## 建议只新增文件

- js/config/combat-presentation.js：血条开关、伤害数字配色/字号/生命周期/合并参数。
- js/game/fx/damage-numbers.js：接收纯数据事件并格式化/绘制；绘制helpers注入，不反向require Renderer/Main。
- js/skills/chain-attacks.js：对归一化清除记录做去重与弹道描述输出，不持有Run/Combat，不直接扣血或发奖。
- 配套tools测试和独立预览/说明。各批分别提交，不合入别人的未提交资源。

这些文件名为建议领取范围，开工前先核对是否已被其他会话新增。

## 伤害数字口径建议

使用本次sourceKey配塔色，而非受击后lastDmgKey推测。优先复用现有六塔表现色：火#ff7043、冰#7fd4ff、毒#7ee2a8、电#f4d03f、镖#c39bd3、炮#d89e63；未知来源用中性色。

建议显示实际扣除的存活血量（处理护甲/易伤后、限制过量伤害），事件包含enemyId/坐标/sourceKey/amount；原始伤害精度留逻辑层，显示独立格式化。Codex在扣血后、死亡递归回调前发事件；直接腐化真伤单独补入口，不漏、不重复。普通攻击、技能、DoT均可见，不能按测试号日志规则隐藏。

密集DoT可按敌人+来源短时间合并，仅减少视觉，不减少实际伤害/击杀/奖励。参数由配置控制，性能限额只作用于表现。隐藏血条后要实测伤害数字/debuff是否仍清晰，不能把hp字段或Boss/城墙逻辑一起删掉。

## 连消已确认规则

用户已确认：新弹道替换现有连消额外攻击，保留正常经验与充能，不叠加旧连消攻击奖励。具体数据与验收见《连消全格弹道-设计草案-v1》。本次仅评估/立任务，不在冰塔重构提交中实施玩法。
