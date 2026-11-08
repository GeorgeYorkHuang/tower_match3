# 邮箱、兑换码与猩红宝箱

- vip666、vip888：忽略大小写和首尾空格，每个存档每码限用一次；兑换投递50钻石邮件，领取后才到账。删除已领取邮件不删除兑换记录。
- 邮箱提供单封领取、一键领取、删除已领取；未领取邮件保留；支持上下滚动。兑换、领奖和删除均在保存失败时回滚，异步兑换回调校验当前档案和界面。
- 猩红宝箱：钻石商店新卡片，20钻石立即开启，从当前圣庭红卡中等概率选一张，再等概率获得1／2／3片，不产金币或钻石。沿用手动碎片解锁。保存失败回滚扣款和奖励。
- 商店增加一行并扩展滚动范围；详情和开箱收益均使用猩红宝箱图片。

## AI资源

使用内置 imagegen。邮箱背景保存为 assets/images/interface/home/mail-garden-v1.jpg（650×1040）；宝箱最终透明图为 assets/images/chests/scarlet-v2.png（256×256）。

邮箱提示词：
Use case: stylized-concept. A portrait 650 by 1040 style decorative background for an in-game MAILBOX modal in a sacred altar garden fantasy mobile game. Elegant aged gold rectangular frame, modest green ivy and a tiny wax-sealed envelope ornament ONLY along top border, rich deep forest-green stone/paper texture, very subtle warm light. Main central 85 percent is calm dark green empty space for dynamic mail cards and text, no objects in center, no lettering, no text, no UI mockup. Premium hand-painted garden sanctuary style, restrained decoration, clear open reading area, full image background, opaque.

宝箱提示词：
Use case: stylized-concept. One premium mobile fantasy game treasure chest icon, closed scarlet red relic chest, crimson lacquer and ruby gemstone, elegant dark antique gold hardware, subtle sacred garden vine carvings. Straight-on three-quarter view, centered isolated chest fills 80 percent of a square image. Dark forest-green background, warm highlights, clean readable silhouette at 100px, hand painted polished game art. No text, no numbers, no watermark, no UI mockup, no other items. A red relic-fragment chest.

透明编辑提示词：
Remove ONLY the dark green background, leaving genuine transparent alpha everywhere outside the chest silhouette, including the space below its feet. Preserve the existing ruby red chest, gold hardware, ivy and flowers, its exact silhouette, view angle, proportions, and all painted colors. No new frame, no drop-shadow rectangle, no text. A clean isolated transparent PNG game item cutout.

验证：兑换与持久化、重复领取与重复兑换、删信、保存回滚、切档回调防护、18种红卡碎片结果、真实购买及邮件点击路由、滚动、广告商店回归；画布预览检查邮箱、商品卡和详情。未作微信真机验证。
