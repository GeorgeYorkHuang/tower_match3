# 四位Boss待机压缩与运行时接入

日期：2026-11-16。

## 本批完成

卡洛斯、伊格尼斯、斯卡尔使用frames-v3，维尔德使用frames/velde-idle现行六帧。各帧384px分别下采样到112px，并放在128px画布的(8,8)，在帧格四周增加独立透明边距，再合并成768×128横向6帧。没有把384px图或原图集放进运行时目录。

正式路径：assets/images/monsters/bosses/expansion/{carlos,velde,ignis,skar}-idle-v1.png。

| 文件 | 字节 |
| --- | ---: |
| carlos | 117380 |
| velde | 80268 |
| ignis | 94318 |
| skar | 144801 |
| 合计 | 436767（0.417MiB） |

相对用户提供2.42MB剩余预算，该批资源低于余量；这不是开发者工具实际上传包体测量，不据此承诺完整包通过。art目录仍被packOptions排除。

元数据：js/game/boss-idle-art.js；分派接入js/game/layers/enemies.js。取消四位Boss的bossPlaceholder开关；W40第二分身仅渲染镜像，实体位置、碰撞、生命和伤害不修改。图集尚未加载时仍沿用原通用Boss回退。进入遭遇时按真实ID预热图集。

卡洛斯125ms/帧；维尔德160/170/200/200/120/120ms，总循环970ms；伊格尼斯167ms/帧；斯卡尔100ms/帧（为控制快速循环的闪动，本批使用10fps候选）。统一读取renderer.animNow，沿用暂停冻结的渲染时钟。

本次仅接待机主贴图，未接技能动作图、死亡动作图、分裂动画或独立召唤物美术。原技能逻辑与简版预警继续生效。美术动态质量仍需用户观看，未把先前浏览器受限的静态评审冒充动态验收。

## 验证

- node tools/test-boss-idle-art.cjs：6种Boss/分身体型，48组渲染取样；验证帧边界、非等时长边界、镜像、Canvas栈平衡、敌人状态不被绘制改写及资源预算。
- node tools/test-boss-expansion-integration.cjs：四只真实伤害/阶段/胜利与暂停、倍速、复活、退出回归通过。
- node tools/test-boss-wall-boundary.cjs：13种现有Boss形态/403次渲染通过。
- node tools/test-boss-presentation.cjs、test-frost-skall.cjs、test-lava-ignis.cjs通过。

构建：powershell -ExecutionPolicy Bypass -File tools/build-boss-idle-runtime.ps1。
HTML：tools/boss-expansion-idle-preview.html，直接读取正式压缩PNG，支持播放暂停、逐帧与棋盘底。

用户验收：熔岩/霜风W40与W60四只Boss显示正确；W40分裂后两个实体同模且第二体镜像；贴图不串帧，维尔德循环不卡顿，伊格尼斯保持刚性浮动；暂停冻结、受击闪光和debuff跟随正常。技能动作暂仍为简版效果，不属于本批动画完成范围。

未提交或推送Git，未上传微信。
