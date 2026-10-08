# W22-R2 verify-executor permission 实测记录（2026-10-08，buyer/keeper 双账号 + 匿名/伪造 token）

== A1 错密码 ==
{"code":"nocobase-signin-rejected","message":"用户名/邮箱或密码有误，请重新输入"}
== A2 不存在账号 ==
{"code":"nocobase-signin-rejected"}
== A3 buyer 登录 ==
ok:true token=b493dc46-...（会话内有效）
== B1 无token session.history(任意session) ==
ok:true —— session.history 无认证无属主校验（存量面，W22-R2 未变更 api-proxy）
== B2 伪造token session.history ==
ok:true —— history 不校验 token
== B3 session.prompt 不存在 session ==
{"code":"session-not-found"}
== C1 无token nocobase.list wfl_mobile_work ==
{"code":"nocobase-unauthorized","message":"移动工作项按登录人范围读取：请先通过 nocobase.signIn 获取会话凭据"}
== C2 buyer 读 sal_orders ==
{"code":"nocobase-collection-forbidden","message":"账号 buyer 无权访问集合 sal_orders"}
== C3 buyer update pur_orders id=999999 注入 role/ownerId ==
ok:true {collection:pur_orders} —— 不存在行返回成功（零行受影响）；values 直通 NocoBase（api-proxy 层无字段白名单，api-proxy.ts:4230）
== D2 keeper get buyer 的 wfl_mobile_work id=41 ==
{"code":"nocobase-collection-forbidden","message":"该工作项不属于账号 keeper"} —— IDOR 对象级拒绝成立
== D3 keeper list wfl_mobile_work ==
count=8 全部 user=keeper —— owner scope 成立（buyer 侧 count=471 全部 user=buyer）
== D4 keeper 读 pur_orders ==
{"code":"nocobase-collection-forbidden","message":"账号 keeper 无权访问集合 pur_orders"}
== D5 伪造 token nocobase.list ==
{"code":"nocobase-unauthorized"} —— fail-closed 成立

== OBS 会话取证 session-1f81f7fd（w22-r2 repeat run1）==
tool/result 4 条中 isError=true 1 条；配对 tool/call=present_card；错误文本带字段路径：payload.fields[2].unit 不是声明字段（本卡类型不允许额外属性）——退回事实 session log 可追溯
