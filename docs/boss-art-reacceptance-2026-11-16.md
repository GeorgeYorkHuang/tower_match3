# Boss美工返修v2复验与工程压缩候选

日期：2026-11-16。结论：三张待机仍有主体裁切，正式动画验收不通过；维尔德静态轮廓完整，动作幅度偏小，尚未单独判定为正式动画通过。本次未替换运行时占位。

## 人眼复核

已查看 acceptance-idle-preview-dark.png、acceptance-battle-size-preview.png，以及分帧源图：

- frames/carlos-idle/frame_01.png：右侧躯干被竖直切掉，并非盾拳收回；总览第2帧左上还有相邻肩甲碎片。
- frames/ignis-idle/frame_02.png：左右肩甲沿竖线被切掉，形体比第1/3帧骤窄，不能将此解释为呼吸收展。中排帧的异常已进入384px分帧本身。
- frames/skar-idle/frame_01.png：右侧风刃平切且右下出现邻帧碎片；总览其他帧也有切边。
- 维尔德各帧轮廓基本一致，风带微动很弱；需结合循环播放确认节奏，不能只依赖边距数值通过。

原因：原图切线处角色互相覆盖，重排管线只把已裁残的包围盒缩放到安全框；out_of_margin=[]无法证明主体完整。不得用放大/缩小残缺帧来制造动作。

## 工程压缩完成项

已将四条384px分帧逐帧下采样为128px透明PNG条，候选位于 art/boss_lava_frost_w40_w60/runtime-candidates/，不进包：

- carlos-idle-128.png：90937字节
- velde-idle-128.png：101807字节
- ignis-idle-128.png：101041字节
- skar-idle-128.png：158916字节

共452701字节，约0.432MiB，小于所述2.42MB余量。这里只计算四条待机新增资源，不能据此保证全项目或全部21组技能资源上传不超限。源图和候选仍处art目录（项目配置排除art），未添加到assets。

播放页：art/boss_lava_frost_w40_w60/acceptance-idle-v2.html，支持暂停/逐帧/帧率。构建命令：powershell -ExecutionPolicy Bypass -File tools/build-boss-idle-candidates.ps1。

## 美工返修要求

三只残缺角色需要从完整单体参考重新逐帧制作，或重新绘制受损部位；不可继续对当前残缺图简单等分/找低墨量切线。每帧整只角色完整后统一画布/锚点，交深底完整轮廓对照，再确认收展/尾摆的连续性。伊格尼斯双肩需保持完整且宽度平滑变化。斯卡尔须去除独立邻帧碎片。

纯冰封/回炉及其余技能的新版资源本次未做完整逐帧复验，不能因为待机候选压缩完成而标记整批通过。待合格待机源图交回后，可复用工程压缩脚本，再接BOSS_ART与正式战斗回归。
