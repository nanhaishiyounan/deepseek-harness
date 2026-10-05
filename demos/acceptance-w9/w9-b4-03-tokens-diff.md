# w9-b4-03 tokens diff 摘要 —「W7 铸造」→「酱园琥珀」关键值对照

来源: git diff packages/client/ui-mobile/src/client/tokens.css（B4 前后）；完整 diff 见 git，此处列语义面关键对照。

| 维度 | W7 铸造（旧） | 酱园琥珀（新·亮） | 酱园琥珀（新·暗） |
|---|---|---|---|
| 画布 canvas | #eaebe8 暖灰 | #fbf5eb 暖纸 | #191310 焙黑 |
| 卡面 card | #ffffff | #ffffff | #2a221c |
| 输入井 card2/muted | #f3f4f1 | #f6eddf | #1f1913 |
| 主色 primary→brand | #1e4e8c 普鲁士蓝 | #b4530a 柿橙（对画布4.7:1） | #e58b4a（对卡6.2:1） |
| 主文字 foreground→ink | #1f2630 | #3d2b1f 深焙墨（对卡13.5:1） | #f2e3d3（12.6:1） |
| 次文字 muted-foreground→ink-sub | #55606e | #6f5b49（对卡6.4:1） | #c3ab93（7.2:1） |
| 描边 border→line | #e0e1de | #eadfc9 焙线 | #453728 |
| 链接 link | #1e4e8c | #1e4e8c（对白卡8.3:1，anchor 语义） | #7b9dd1 |
| focus-ring | rgba(30,78,140,.35) | rgba(180,83,10,.40) 柿橙 | rgba(229,139,74,.55) |
| tab-active | var(--primary) | #b4530a（对托盘4.9:1） | #f09a5e（7.9:1） |
| tabbar-bg | #ffffff | rgba(255,252,246,.96) 暖纸托盘+blur14 | rgba(31,25,19,.96) |
| 正文 body | 13px | 14px（fs-body，呼吸感上调） | 同 |
| 数字阶 | xl24/num26 | num-md 26 / num-lg 32 / adm-grade10 44 | 同 |
| 圆角 | m12/l16/bubble16 | r-ctl14 / r-card20 / r-bubble18+尾角6 | 同 |
| 语义五态 | Fiori 蓝灰系 | 琥珀暖化（success #4a7031 等，fg对白卡≥4.95:1） | 提亮阶（≥6.1:1） |
| 气泡 user | 蓝实底 #1e4e8c | 柿橙 #b4530a（白字5.0:1） | #a85f1f（6.1:1） |
| 印章系 | 无 | seal-ring/seal-face/shadow-seal 柿橙染影 新增 | 同 |
| 温度徽章/码盘 | 保留 | 保留未动（cargo 语义） | 保留 |
| --adm-* | 蓝系映射 | 19 行全量：brand/ink/line/card2/canvas + 字阶 9/11/12/14/15/17/20/24/30/44 | 同（var 跟随） |
| W8 语义 | 11 gate | 全保留（touch44/40、fs-input16、focus-ring、link、暗轨对比度） | 同 |
| 新增钩子 | 无 | .dshm-seal-chip/.dshm-seal-cta/.dshm-bubble-paper-*/.dshm-stamp-* | 同 |
-  --dshm-brand2: #3a69a4;           /* 同源蓝第二阶（图表序列），替代旧亮青渐变副色 */
+  --dshm-canvas: #fbf5eb;           /* 暖纸画布（ink 对它 12.0:1） */
+  --dshm-card2: #f6eddf;            /* fold 区 / 输入井（对卡 RGB 平均差 ~20） */
+  --dshm-brand: #b4530a;            /* 柿橙主色（对画布 4.7:1 / 对白卡 5.0:1） */
+  --dshm-brand-deep: #8f4106;       /* 按压态 / soft 底上的深一阶（对 brand-soft 5.8:1） */
+  --dshm-brand-soft: #f8e4d2;       /* 主色 soft 底（chip / 选中槽） */
+  --dshm-ink: #3d2b1f;              /* 深焙墨·主文字（对画布 12.0:1 / 对卡 13.5:1） */
+  --dshm-ink-sub: #6f5b49;          /* 墨·次文字（对画布 6.0:1 / 对卡 6.4:1） */
+  --dshm-ink-weak: #9a8570;         /* 仅装饰/骨架/时间戳壳，不负载正文 */
+  --dshm-line: #eadfc9;             /* 焙线描边 */
+  --dshm-line-strong: #dfc9a6;      /* 回执卡描边（深一阶） */
+  --dshm-fs-display: 30px;          /* hero 问候、章中心字（800/1.25） */
+  --dshm-fs-body: 14px;             /* 正文（400/1.6 — the breathing lift from 13px） */
+  --dshm-fs-num-lg: 32px;           /* 统计大数字（700 mono tabular；hero 可到 44px） */
+  --dshm-r-card: 20px;              /* 卡片/回执/追问卡 */
+  --dshm-shadow-seal: 0 4px 12px rgba(180, 83, 10, 0.30); /* 主 CTA 印章柿橙染影 */
-  --dshm-focus-ring: 0 0 0 3px rgba(30, 78, 140, 0.35); /* keyboard focus halo (W8 V8) */
-  --dshm-tab-active: var(--dshm-primary);  /* selected Tab state (see tail override) */
+  --dshm-focus-ring: 0 0 0 3px rgba(180, 83, 10, 0.40); /* keyboard focus halo */
+  --dshm-tab-active: #b4530a;       /* selected Tab state (4.9:1 on the tray) */
+  --dshm-brand2: var(--dshm-brand-deep);         /* chart series 2 — the amber second step */
+  --dshm-on-soft: var(--dshm-brand-deep);        /* fg on primary-10/brand-soft (5.8:1) */
-  --dshm-on-soft: #1e4e8c;          /* foreground on primary-10/primary-soft fills (7:1 on soft) */
-  --adm-color-primary: var(--dshm-primary);
+  --adm-color-primary: var(--dshm-brand);
-  --adm-radius-m: var(--dshm-radius);
+  --adm-radius-m: var(--dshm-r-ctl);
-  --adm-font-size-10: 28px;
+  --adm-font-size-10: 44px;
-  --dshm-tab-active: #5783bc;       /* chart-3 blue: the primary-on-tabbar figure
-  --dshm-focus-ring: 0 0 0 3px rgba(83, 131, 199, 0.5);
+  --dshm-canvas: #191310;           /* 焙黑画布 */
+  --dshm-card2: #1f1913;            /* fold 区 / 输入井（对卡 ~10 RGB step） */
+  --dshm-brand: #e58b4a;            /* 柿橙提亮一阶（对卡 6.2:1） */
+  --dshm-brand-deep: #c26f33;
+  --dshm-brand-soft: #3b2a1c;
+  --dshm-ink: #f2e3d3;              /* 纸墨·主文字（对卡 12.6:1） */
+  --dshm-ink-sub: #c3ab93;          /* 墨·次文字（对卡 7.2:1） */
+  --dshm-ink-weak: #8d7b66;         /* 仅装饰/骨架，不负载正文 */
+  --dshm-line: #453728;
