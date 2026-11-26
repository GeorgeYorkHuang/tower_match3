# Boss技能特效第一批接入

日期：2026-11-16。

本批：伊格尼斯熔核独立5帧；斯卡尔纯冰封3状态（预警/成壳/封印峰值）及解封4帧；卡洛斯1–3层共鸣按层取图、超时回炉独立3帧叠加。W40裂生记录事件坐标/时间，使用裂光和外扩环表现0.5秒分裂，炉温压制/风蚀触发扩散环；不使用仍失真的角色分裂图。特效读取遭遇elapsed，重复重绘不推进，不消耗随机数或写回血量/伤害/冷却。

工程资源：assets/images/monsters/bosses/expansion/，单格128px，按序列共享alpha包围盒缩放并加独立8px透明边距，避免单帧分别拉伸。

| 资源 | 字节 |
| --- | ---: |
| ignis-core-v1.png | 97368 |
| skar-freeze-v1.png | 58109 |
| skar-shellbreak-v1.png | 108753 |
| carlos-resonance-v1.png | 39185 |
| carlos-reignite-v1.png | 37451 |
| 本批 | 340866 |
| 含上批待机 | 777633（约0.742MiB） |

只说明新增资源大小，不是微信实际打包余量测量。源图/384px帧仍只在art排除目录，不进包。

读取共享图像缓存：Renderer.bossSkillSprite→boss-skill-atlas；无法加载时斯卡尔沿用原线框预警。熔核在Enemy渲染层按bossSummonId选专属图，沿用已有碰撞和debuff描绘。

验证：test-boss-skill-art覆盖源矩形边界、资源存在/尺寸、缺图回退、冰封阶段/解封尾效、暂停重复绘制只读、Canvas栈；test-boss-expansion-integration、test-boss-idle-art、test-frost-skall、test-lava-ignis、test-lava-twins、test-frost-twins、test-boss-presentation均通过。

尚待：伊格尼斯主体喷发/读条/打断与死亡动画、斯卡尔寒风/分裂与死亡主体动画、W40完整角色分裂/死亡帧。原有简版提示和读条继续生效，本批不能称全部技能动画完成。

用户验收：熔核不再显示幼芽；斯卡尔塔位先光柱预警再冰壳、解封破壳，与1秒/4秒逻辑同步；卡洛斯共鸣按层增强，超时回复只叠回炉光效；W40裂光转场不导致额外敌人或改变命中。尚未真机/IDE视觉验收，未提交Git/上传微信。
