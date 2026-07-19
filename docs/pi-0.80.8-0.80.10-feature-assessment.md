# pi 0.80.8–0.80.10 对 fate-sandbox 的功能评估

> 基线：开发机全局 `pi` 已是 0.80.10；项目 `package.json`、lock 与本地 `node_modules` 仍是 0.80.6。本文只评估 0.80.7 之后的增量。

## 结论

应升级项目依赖到 0.80.10，但不能只改版本号。0.80.8 删除了 SDK 的 `AuthStorage` 导出和 `ModelRegistry.create()` 路径，`scripts/render-bench.ts` 正在使用这两个入口，必须迁到 `ModelRuntime`。生产游戏 extension 仍可使用兼容的 `ctx.modelRegistry.find()` 与 `getApiKeyAndHeaders()`，因此 Pass A、Pass B 和后台子进程没有同级别的 API 迁移。

0.80.9 为 Kimi K3 增加原生 deferred tool loading，0.80.10 修复 Kimi thinking。项目默认使用 Anthropic Opus 4.6，已有原生 deferred loading；新版本没有解决工具卸载导致 fallback/cache invalidation 的限制，因此不改变“当前不采用 dynamic tool loading”的结论。

## 当前版本分裂

| 路径                              | 当前版本 | 影响                                                   |
| --------------------------------- | -------: | ------------------------------------------------------ |
| `start.sh` 调用的全局 `pi`        |  0.80.10 | Pass A、session、TUI、spawn 子进程使用 0.80.10 runtime |
| 项目 `@earendil-works/pi-ai`      |   0.80.6 | two-pass Pass B 的 `pi-ai/compat` 裸流仍运行 0.80.6    |
| 项目 `pi-coding-agent` 类型与 SDK |   0.80.6 | typecheck 还看不到 0.80.8 的 SDK breaking changes      |
| 项目 `pi-tui`                     |   0.80.6 | extension 编译与全局 TUI runtime 不一致                |

统一版本可消除开发机、发布环境与本地 SDK 的 split-brain。

## 0.80.8：ModelRuntime

### 项目必须迁移的代码

`scripts/render-bench.ts` 当前：

```ts
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

const registry = ModelRegistry.create(AuthStorage.create());
```

0.80.10 不再导出 `AuthStorage`，`ModelRegistry` 也只保留接收 `ModelRuntime` 的构造器。SDK 的 canonical 路径是：

```ts
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const model = modelRuntime.getModel(provider, modelId);
const events = modelRuntime.streamSimple(model, context, options);
```

`ModelRuntime.stream()` / `streamSimple()` 自己完成 auth、headers 和 provider request assembly。benchmark 不应继续手工调用 `getApiKeyAndHeaders()` 再走全局 compat stream。

### 生产 extension 暂时不用迁

0.80.10 继续在 `ExtensionContext` 暴露同步兼容 facade：

- `ctx.modelRegistry.find()`
- `ctx.modelRegistry.getApiKeyAndHeaders()`
- `ctx.modelRegistry.getAvailable()`
- `ctx.modelRegistry.refresh()`，但返回值改为 `Promise<void>`

项目没有调用 `refresh()`。`extensions/two-pass-render/index.ts` 的两个 auth call 和模型查找仍存在于 0.80.10 类型中。长期应减少 `pi-ai/compat` 依赖，但 0.80.10 没有强迫本次同时重写生产 Pass B。

### Live model catalog

0.80.8 增加 `models-store.json`、`/model` 后台 catalog refresh 与 `pi update --models`。项目的 `.pi/agent/` 已整体 gitignore，因此缓存文件不会进入 release。这个功能改善模型元数据更新，但不改变叙事 runtime 契约。

benchmark 若要求可复现，可在独立 `ModelRuntime.create()` 中设置 `allowModelNetwork: false`，避免 benchmark 运行时刷新 catalog。

## 0.80.9–0.80.10：Kimi K3

0.80.9 增加 Kimi K3 模型目录和 Kimi 原生 deferred tool serialization；自定义 OpenAI-compatible 模型可通过 `compat.deferredToolsMode: "kimi"` 描述该协议。0.80.10 修正 Kimi Coding adaptive thinking、K3 `max` level、空 thinking signature replay 和价格元数据。

当前路径不使用 Kimi，故升级后只获得可选模型能力。即使以后选择 Kimi，dynamic loading 仍遵循 additive 规则：

- 新增 active tools 可以走原生 deferred loading；
- 删除或替换 active tools 仍走 fallback；
- loader 仍增加一次模型 round-trip；
- 新工具仍要到下一次模型响应才可调用。

因此 Kimi 支持没有改变本项目对 dynamic tool loading 的收益判断。

## 其他变化

| 变化                                                | 相关性                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| provider-owned `/login` 与统一 auth runtime         | 升级即受益，但必须 smoke Anthropic OAuth/API key 与项目隔离 `.pi/agent/auth.json` |
| 相邻 thinking blocks 合并显示                       | TUI 小修复                                                                        |
| Codex session ID 截断                               | 未来使用 Codex 时受益                                                             |
| tab 输出规范化、Windows 标题修复                    | 通用 UI 修复                                                                      |
| clone/fork 在首个 assistant response 前给出明确错误 | 通用 session UX 修复                                                              |
| xAI OAuth、Grok 4.5 与目录调整                      | 当前不相关                                                                        |

一次本地 `ModelRuntime.getAuth()` smoke 对项目隔离的 Anthropic credential 返回 `invalid_grant`。这更像本机凭据状态而非源码兼容性结论，但升级验收必须包含真实 `/login`、Pass A 和 Pass B 请求，不能只依赖 typecheck。

## 建议落地

1. 把三个直接 pi 依赖升级到 0.80.10，并更新 lock。
2. 将 `scripts/render-bench.ts` 从 `AuthStorage` / `ModelRegistry.create()` / compat stream 迁到 `ModelRuntime`。
3. 保留 production extension 的 `ctx.modelRegistry` 兼容路径，避免把 SDK 重构扩大到游戏主链。
4. 运行四项检查，再做默认 Anthropic 新局、续局、Pass B、backstage、showrunner 和 render bench smoke。
5. 不实施 dynamic tool loading；Kimi 的新增支持没有改变此前结论。

## 一手来源

- 本机 `@earendil-works/pi-coding-agent@0.80.10/CHANGELOG.md` 的 0.80.8、0.80.9、0.80.10 条目
- [SDK 文档](https://github.com/earendil-works/pi-mono/blob/v0.80.10/packages/coding-agent/docs/sdk.md)
- [Providers 文档](https://github.com/earendil-works/pi-mono/blob/v0.80.10/packages/coding-agent/docs/providers.md)
- [Custom Models 文档](https://github.com/earendil-works/pi-mono/blob/v0.80.10/packages/coding-agent/docs/models.md)
- [Dynamic Tool Loading 文档](https://github.com/earendil-works/pi-mono/blob/v0.80.10/packages/coding-agent/docs/extensions.md#dynamic-tool-loading)
- [Kimi deferred-tools 示例](https://github.com/earendil-works/pi-mono/blob/v0.80.10/packages/coding-agent/examples/extensions/kimi-deferred-tools.ts)
- 本机 0.80.10 `dist/core/model-runtime.d.ts` 与 `dist/core/model-registry.d.ts`
