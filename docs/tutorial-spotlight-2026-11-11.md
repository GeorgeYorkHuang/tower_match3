# 遮暗式教学与解锁指引

日期：2026-11-11。

## 行为

- 前置教学统一使用80%暗色遮罩，仅当前可操作的棋盘格、塔、技能卡、全局按钮、商店入口或圣遗物选择区保留原亮度，并描金边。提示框显示在目标以外；暗区点击和棋盘滑动均拦截。跳过本章仍可使用。
- 第二章不再通过教学调用gainExp或凭空制造待选。真实经验升级、进入picking且有skill候选时才提示选择技能。
- 第三章不再自动安排首次激活或分支；实际候选出现branch时才展示分支提示。提示明确：每个技能本局A/B/C三条路线只选一条，选定后只能升级该路线，另两条本局不可再选。底层互斥规则沿用并验证。
- 已有塔详情/功能弹窗打开时暂不覆盖教学遮罩，保留正常关闭路径，避免锁死。
- 新增主页解锁引导，覆盖三消技能、全局技能、商店、圣遗物、天赋、塔图鉴和新战场。没有进入对应分页时先高亮分页入口，再高亮具体新图标；点击查看后才保存完成标记。
- `unlockGuideSeen`跨局保存；新账号持续跟踪新解锁。旧档首次迁移将已存在的历史解锁视为已查看，避免一次强制弹出全部历史内容。测试账号不触发主页解锁指引。

## 主要文件

- `js/game/spotlight.js`：多区域镂空遮罩和提示框，不使用离屏合成或平台不一致的even-odd裁剪。
- `js/game/prologue-tutorial.js`：实际候选触发、遮罩目标及操作限制；移除教学补经验。
- `js/game/unlock-guide.js`、`js/prologue/unlock-notices.js`：主页解锁项目、入口定位和完成记录。
- `js/meta.js`：指引查看记录序列化及旧档兼容。
- `js/game/main.js`：候选状态更新教学，主页绘制解锁指引。
- `js/game/input/menu-actions.js`：主页暗区点击拦截。
- `js/game/screens/upgrade-pick.js`、`js/game/layers/battle.js`：导出真实卡片、商店入口坐标，复用既有点击逻辑。

## 验证

`node tools/test-guided-spotlight.cjs`通过：无凭空经验、真实技能/分支窗口触发、分支互斥、镂空区未被遮罩覆盖、暗区点击/滑动拦截、原生卡片绘制坐标、弹窗关闭路径、主页解锁分页导航和存档重载。

相关回归通过：`test-battle-ui-refresh.cjs`、`test-prologue-acceptance.cjs`、`test-attack-energy-discount.cjs`、`test-battle-relic-schedule.cjs`、`test-wall-breach-settlement.cjs`、`test-codex-energy.cjs`。

前置验收脚本仍报告既有的“第一章第三色无全局充能收益”待定规则，本轮不改该设计。旧 `test-prologue-features.cjs` 中“教学自动给升级”的断言不再代表现行需求；本轮新增专项按真实升级触发验证，没有宣称全部历史脚本已兼容。真机提示框遮挡、安全区与动画交互仍待设备验证。
