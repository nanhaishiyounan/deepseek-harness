# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

### 本地启动

上面的命令面向 harness 本体；整套示例组合——kb-agent（食品产业知识库 agent）跑在 DSH Web 工作台上，配套 NocoBase 业务后台与本地 PostgreSQL——按下述三步在仓库根目录启动。

| 组件 | 地址 | 职责 |
|---|---|---|
| DSH Web 工作台（kb-agent 组合） | http://127.0.0.1:3080 | 对话、知识库、数据资产、连接器、图谱、业务管理 |
| NocoBase 业务系统（完整 UI） | http://127.0.0.1:13000 | 订单单一事实源，也是可独立使用的业务后台：登录后管理 collections、审批 workflow 与系统设置（初始管理员 admin@nocobase.com / admin123） |
| PostgreSQL 17 | localhost:5432 | NocoBase 的数据库，由 setup 脚本幂等拉起 |

1. 安装依赖，并在仓库根目录的 `.env` 写入 `MINIMAX_API_KEY`（对话与向量化共用；无 key 时检索仍可用）：

```sh
pnpm install
```

2. 启动 NocoBase。首次执行会在 `platform/nocobase` 内安装依赖（yarn，约 15 分钟）、构建完整 UI 客户端产物（首次约 20 分钟，产物保留、之后启动秒级）、幂等拉起本机 PostgreSQL、初始化五个 collections（含种子数据与审批 workflow），并把 `NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY` 写入 `.env`。`http://127.0.0.1:13000` 即完整业务系统：浏览器打开登录后可管理数据、workflow 与设置，与 DSH 工作台（业务管理页的「高级配置」内嵌同一后台）互为双入口：

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts
```

日常用 `start` 启动既有安装，用 `verify` 复核（断言完整 UI 可达 + collections + 种子 + workflow + API key；`--env-file=.env` 让 API-key 检查读到凭据）：

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts start
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify
```

3. 启动 DSH Web 工作台：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
```

该命令输出 `dsh web: http://127.0.0.1:3080` 并自动打开浏览器；追加 `--no-open` 跳过打开（完整写法：`dsh web --patch <file> --no-open`）。注意 flag 顺序：`--patch` 等 dsh 启动器 flag 必须写在 web 应用自己的 flag（如 `--no-open`）之前——从第一个启动器不认识的参数起，其余参数原样交给 web 应用。工作台无鉴权，只在本机使用。服务端源码改动（`packages/**/src`）需重启该进程才生效；客户端产物按请求从磁盘重读。

环境前提、示例语料入库、场景角色与常见坑见完整手册：[examples/kb-agent/QUICKSTART.zh.md](examples/kb-agent/QUICKSTART.zh.md)。

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
