# 战斗界面与流程调整

日期：2026-11-11。

## 已接入

1. 城墙与塔位共用750×122横带，新图为 `assets/images/interface/battle/wall-garden-v2.jpg`（14,512字节）。顶部石墙、中部安静石台、底部血条留白；塔、按钮、血条由代码覆盖。通过内置图像工具生成、编辑，导出JPEG，原图保留在Codex生成目录，不将大原图加入资源包。
2. 战斗顶部按stage读取章节上限，前三章10/20/40波，普通关卡60波；终点位置和Boss节点随上限缩放。
3. 前两章同时拦截精英与Boss的局内宝箱；入盘控制器也清理遗留宝箱格，按本章色池补落。第三章沿用W5开放，正式关卡保持W2首箱。
4. 页面和切换操作共用selectable序列，只展示/切换到第一个未解锁战场为止。正式关卡依次通关解锁：圣坛花园→熔岩矿场→霜风峡谷→深渊。新增fieldClears持久记录，失败或仅撤离不会记通关。旧档只有通用通关标记时保留圣坛完成资格，不猜测已经完成熔岩或霜风。
5. 连消弹先下落再起飞，起飞时从当前位置选最近目标并固定飞行方向；无目标向上飞离，目标死亡或移动不再悬停/追踪。路径碰撞可命中敌人，也允许落空。3秒或飞出边界结束，并同步清理贴图，保留回旋镖旋转表现。

## 验证

通过：`test-battle-ui-refresh.cjs`、`test-battle-relic-schedule.cjs`、`test-wall-breach-settlement.cjs`、`test-targeting-and-landings.cjs`、`test-attack-energy-discount.cjs`、`test-codex-energy.cjs`、`test-first-wave-chest.cjs`。

新专项覆盖10/20/40/60波HUD、顺序准入及存档、通关/撤离记录区分、无目标/目标死亡/目标移动/实际命中四种连消飞行、贴图同步清理，以及前两章精英/Boss/遗留宝箱。

图鉴测试补入已解锁塔的档案条件，适配已有的图鉴准入限制；运行代码不因此绕过解锁规则。原P2脚本 `test-prologue-features.cjs` 仍在allowSwap(0,0,0,1)断言失败：当前教学已要求指定交换，旧脚本假设任意交换。此项未改教学规则，待其维护方更新脚本。没有宣称所有历史脚本均通过。

新图已经按成品尺寸检查；游戏内真机显示、进度条与微信胶囊的遮挡情况，以及连消弹观感仍需实际设备确认。

## 图像生成记录

使用内置image_gen。第一轮提示如下：

+ Use case: stylized-concept. Generate a production 2D game environment strip, a garden sanctuary defensive wall and tower placement floor. Match the provided reference's hand-painted soft stone and moss green garden palette, warm muted gray sandstone, restrained ivy and tiny white flowers only near the extreme edges. Extremely wide composition 6.15:1, intended final asset 750x122. Full image opaque. Layout: upper 20% low crenellated wall coping, middle 65% quiet dark gray-green stone terrace with subtle slab joints and low contrast, bottom 15% very plain dark recess reserved for a UI health bar drawn separately. Straight-on slightly top-down orthographic game view. Must remain readable under 2/3/4 towers and two global skill icons overlaid by code, no painted slots or towers, no pedestals, no buttons, no text, no icons, no healthbar. Flat horizontal continuous silhouette, no perspective vanishing point, no tall ornaments. Edge vegetation minimal, brighter and more garden-like than the old midnight blue wall, yet sufficiently subdued for tower silhouettes.

第二轮编辑要求：去掉顶部全部白色空白，让石墙顶沿贴边，保持同样苔绿色砂岩风格，整张不透明、无文字和图标；为750×122横带提供干净石台与深色下沿。随后仅按游戏实际尺寸导出优化JPEG。
