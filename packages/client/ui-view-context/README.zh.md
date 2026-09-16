# @deepseek-ai/dsh-client-ui-view-context

[English](README.md) | 中文

tab 感知工作台上下文的浏览器半边：发布 `ctx.viewContext`——业务视图包在其上注册状态投影的服务。会话正文把自己解析出的激活视图上报给该服务，一条 500 ms 防抖的循环把 `{ sessionId, view, label, snapshot, actions }` 经 `session.viewStateReport` 上行，让 host 侧 view-context 缓存始终跟随用户正在看的 tab。

## 注册面

```ts
ctx.effect(() => ctx.viewContext.provide({
  view: 'kg',
  label: () => bound('view.kg'),
  changes: store.store,               // optional: any change re-triggers the report
  snapshot: () => ({ '选中实体': state.selected ?? '无' }),
}), 'ui-kg: view-context provider')
```

`chat` 视图不注册：它的上报只带最简空快照，host 渲染为一行的对话视图块。传输失败按名吞掉——重试就是下一次 notify（切 tab 或 store 变化）。

## 已知限制与后续工作

- 组件局部视图态（详情抽屉的打开对象、场景分类过滤）在落入包级 store 之前不投影；经 push 式 notify 携带局部快照的桥接留后。
- 只上报当前会话的激活视图；后台 tab 与多会话屏幕留后。
- 上行循环不对被拒绝的 RPC 重试（部署未挂 host 侧 view-context 插件时）；组合变化之前上行保持沉默。
