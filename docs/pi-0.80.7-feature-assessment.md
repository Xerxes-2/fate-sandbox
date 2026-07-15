# pi 0.80.7 对 fate-sandbox 的功能评估

> 评估基线：项目当前锁文件解析到 `@earendil-works/pi-ai`、`pi-coding-agent`、`pi-tui` 0.80.6；目标版本为 0.80.7。只使用项目本地文件、pi v0.80.7 官方源码/文档/CHANGELOG/PR。
>
> 结论标签含义：**立即采用**＝本项目应安排实现；**升级即受益**＝只升级依赖即可获得；**暂不采用**＝功能有价值但当前不应同时改造；**不相关**＝当前配置/运行路径不触发。

## 结论摘要

建议把三个直接 pi 依赖统一升级并锁定到 **0.80.7**（`pi-agent-core` 随 `pi-coding-agent` 间接升级）；这是低迁移成本的小版本升级，项目不存在唯一 breaking change 所涉及的旧配置字段，并能避免当前“全局 CLI 0.80.7、项目依赖 0.80.6”的 split-brain。当前机器通过 `start.sh` 调用的全局 CLI 已获得跨日期 system prompt 缓存修复和 CLI 修复；项目本地 `pi-ai` 路径仍停在 0.80.6。0.80.7 最有潜力的功能是 cache-friendly dynamic tool loading：本项目 Pass A 一次注册 33 个领域工具且默认模型是受支持的 Anthropic Opus 4.6，技术上高度匹配；但它要求把 registry 改造成“常驻 loader + 只增不减的 active tools”，会影响当前工具路由契约和存档重放，故建议**升级后单独设计、测试再采用**，不要与版本升级绑在一起。

## 当前项目基线

| 检查项        | 事实与相关性                                                                                                                                                                                                                                                                                                                                                                                   | 证据                                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本          | `package.json` 三个 pi 直接依赖均为 `^0.80.6`；`pnpm-lock.yaml` 与项目 `node_modules` 当前解析均为 0.80.6。当前机器的全局 `pi --version` 已是 0.80.7，而 `start.sh` 调用全局 CLI；two-pass 又从项目依赖解析 `@earendil-works/pi-ai/compat`，因此本机实际是 Pass A/runtime core 0.80.7、Pass B SDK 0.80.6。由于是 caret range，重新解析可能自动进入 0.80.7，但可复现安装仍由 lock 锁在 0.80.6。 | [`package.json`](../package.json)；[`pnpm-lock.yaml`](../pnpm-lock.yaml)；[`start.sh`](../start.sh)                                                                                                                                                                             |
| 主工具注册    | `extension.ts` 启动时调用 `registerAllTools(pi)`；`tools/registry.ts` 静态注册 33 个领域/调试工具，当前没有 `getActiveTools()` / `setActiveTools()`。                                                                                                                                                                                                                                          | [`extension.ts`](../extension.ts)；[`tools/registry.ts`](../tools/registry.ts)                                                                                                                                                                                                  |
| two-pass      | Pass A 是正常 agent loop；Pass B 在 `agent_end` 后通过 `@earendil-works/pi-ai/compat` 的裸 `stream()` / `streamSimple()` 进行无工具渲染，并自设稳定 `sessionId`、缓存 retention。                                                                                                                                                                                                              | [`extensions/two-pass-render/index.ts`](../extensions/two-pass-render/index.ts)；[`engine/render/render-turn.ts`](../engine/render/render-turn.ts)                                                                                                                              |
| system prompt | 项目并非完全替换默认 prompt；`buildSystemPrompt(baseSystemPrompt)` 把 Fate system 追加到 pi 默认 prompt，所以默认 prompt 中日期造成的跨日失效会传导到 Pass A。                                                                                                                                                                                                                                 | [`engine/prompt-assembly/injection.ts`](../engine/prompt-assembly/injection.ts)                                                                                                                                                                                                 |
| 子进程        | backstage 为 `pi -p --no-tools`；showrunner 为 `--no-extensions -e timeline --no-builtin-tools` 且仅注册 `lookup`。二者都不适合动态加载。                                                                                                                                                                                                                                                      | [`engine/core/backstage/backstage-spawn.ts`](../engine/core/backstage/backstage-spawn.ts)；[`engine/core/showrunner/showrunner-spawn.ts`](../engine/core/showrunner/showrunner-spawn.ts)；[`extensions/subagents/timeline/index.ts`](../extensions/subagents/timeline/index.ts) |
| 模型配置      | 隔离 settings 默认 `anthropic/claude-opus-4-6`；本地 custom model 是 Google Generative AI 路径。项目 `models.json` 未使用 `sendSessionIdHeader` 或 `sessionAffinityFormat`。                                                                                                                                                                                                                   | [`.pi/agent/settings.json`](../.pi/agent/settings.json)；本机私有 `.pi/agent/models.json`（仅核对 schema，本文不复述凭据）                                                                                                                                                      |
| 启动方式      | `start.sh` 设 `PI_CODING_AGENT_DIR=.pi/agent`，显式加载主 extension 与 two-pass、compaction、panel 等扩展；子进程继承同一环境和默认模型。                                                                                                                                                                                                                                                      | [`start.sh`](../start.sh)                                                                                                                                                                                                                                                       |

## 逐项评估

### 1. 升级到 0.80.7 — **立即采用**

应将 `@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui` 的 manifest 与 lock 统一到 0.80.7；`pi-agent-core` 会随 coding-agent 间接升级。当前全局 CLI 虽已是 0.80.7，但这不能替代项目 lock 升级：本地 typecheck 与 two-pass 的直接 `pi-ai/compat` import 仍解析到 0.80.6，发布环境的全局 CLI 也未必与开发机一致。不要只更新某一个包，因为 dynamic tool loading 横跨 coding-agent、agent-core 和 pi-ai：coding-agent 记录 active-tool 增量，agent-core 把 `addedToolNames` 放进 `ToolResultMessage`，pi-ai 再转换为 provider 原生延迟加载表示。[coding-agent CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/CHANGELOG.md)；[agent CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/agent/CHANGELOG.md)；[pi-ai CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/ai/CHANGELOG.md)

本项目没有命中 0.80.7 唯一 breaking config（详见第 4 节），现有 `ExtensionAPI` 注册、two-pass compat import 与 spawn CLI flags 均无此次破坏性变更。升级仍须按项目纪律运行四项检查，并至少做一次默认 Anthropic 模型的真实新局/续局 smoke test。

### 2. Cache-friendly dynamic tool loading — **暂不采用（高价值候选）**

#### 精确扩展 API

0.80.7 并没有新增 `registerLazyTool()` 一类 API。官方契约是现有 API 的组合：

1. 所有候选工具先用 `pi.registerTool()` 注册，使其存在于 `pi.getAllTools()`；
2. 用 `pi.setActiveTools()` 把大部分候选工具设为 inactive，只保留常驻 loader；
3. loader **执行期间**读取 `pi.getActiveTools()`，调用 `pi.setActiveTools([...current, ...matches])`；
4. 同一次调用必须是纯加法，不能移除现有 active tool；未知/未注册名称会被忽略；
5. coding-agent 自动把新增名称记到该 loader 的 tool result，下一次模型请求立即可用；扩展不应自行返回 provider-specific reference。

官方完整示例与契约：[Dynamic Tool Loading 文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#dynamic-tool-loading)；实现 PR [#6474](https://github.com/earendil-works/pi/pull/6474)；底层 marker 类型见 [agent CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/agent/CHANGELOG.md)。

需特别区分：普通的“运行时 `pi.registerTool()` 后立即可见”早在旧版本已存在；0.80.7 新增的是**由 tool result 锚定、保持缓存前缀的 active-tool 增量加载**。官方 `dynamic-tools.ts` 只演示运行时注册，不等同于 0.80.7 的 loader 模式。[官方 runtime registration 示例](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/examples/extensions/dynamic-tools.ts)

#### 缓存与重放语义

- 纯 additive active-set 变化会记录 `ToolResultMessage.addedToolNames`，加载点因而持久位于 transcript 的该 tool result；下一次请求即可调用新增工具。[PR #6474](https://github.com/earendil-works/pi/pull/6474)
- 原生支持时，新增 schema 不进入初始 cached prefix：Anthropic 用 `defer_loading` definition + `tool_reference`；OpenAI Responses/Codex 用已完成的 client `tool_search_call` + `tool_search_output`，definition 带 `defer_loading: true`。[官方文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#models-with-native-deferred-loading)；[provider 实现 commit](https://github.com/earendil-works/pi/commit/3d8f74357c169d24f996a1611ecc4be72b7744bd)
- 不支持的模型仍会在下一请求收到完整当前 active tools，功能正确但新 schemas 可能使 provider cache prefix 失效；非纯加法（包括 removal/组替换）也走此安全 fallback。[官方 fallback 文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#fallback-behavior)
- 若延迟工具有 `promptSnippet` / `promptGuidelines`，激活会重建 system prompt，仍可能使 prefix 失效；延迟工具通常只靠 `description`。这点对本项目尤其重要，因为工具路由现在集中写在 `prompts/settlement/tool-policy.md`，而各 Fate tool definition 并未依赖 prompt metadata。[官方 fallback 文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#fallback-behavior)；[`prompts/settlement/tool-policy.md`](../prompts/settlement/tool-policy.md)
- provider 源码对 marker 做防御：marker 指向已不在 `Context.tools` 的工具会忽略；在 marker 之前已被调用的工具保持 immediate；重定义/冲突会折回 prefix 以保证 replay。[`splitDeferredTools`](https://github.com/earendil-works/pi/blob/v0.80.7/packages/ai/src/utils/deferred-tools.ts)；[PR #6474](https://github.com/earendil-works/pi/pull/6474)

#### 支持模型

| 路径                                   | 0.80.7 原生支持                                                                                      | 本项目命中情况                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Anthropic Messages                     | Sonnet、Opus、Fable **4.5+**，不含 Haiku；自定义端点可明确设 `compat.supportsToolReferences: true`。 | 默认 `anthropic/claude-opus-4-6` 命中，Pass A 可获最大收益。    |
| OpenAI Responses / Codex Responses     | `gpt-5.4` 及更新 family；自定义端点可明确设 `compat.supportsToolSearch: true`。                      | 当前默认不命中；未来切 GPT-5.4+ 可用。                          |
| Google、OpenAI Chat Completions 及其他 | 功能 fallback，非原生延迟加载，新增 schema 可能破坏 cache prefix。                                   | 本地 Google custom models 仅获功能 fallback，不获主要缓存收益。 |

模型边界来自 [0.80.7 官方 Dynamic Tool Loading 文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#models-with-native-deferred-loading)。compat flag 只应在端点实际支持协议后启用，不能因“OpenAI/Anthropic compatible”字样猜测开启。

#### 是否适用于 `tools/registry.ts` 与 story runtime

**技术上适用且潜在收益高。** Pass A 当前每次暴露 33 个 schema；实测这些 definition 的序列化 parameters + description 合计约 **42,610 字符**（其中 schema 33,371、description 9,239，尚未计 provider 包装）；默认 Opus 4.6 原生支持。工具本身已有明显阶段/能力分组，可降低首请求 schema 体积，例如：

- 常驻核心：`commit_turn`、`get_status`、`lookup`、一个窄的领域工具 loader；
- 初始化组：`initialize_new_game`、`configure_campaign`；
- 战斗/从者组：`resolve_combat_exchange`、`update_servant_form`、`reveal_secret`；
- 后台导演组：`run_parallel_line`、`harvest_backstage_candidate`、`record_offscreen_event`、`resolve_backstage_line`、`run_showrunner_audit`；
- debug/修档组：`patch_state`、`override_locked_fact`、`migrate_state`、`reset_state`、`get_state_schema`，正常玩法本就不应常驻。

但当前不应直接改，原因是：

1. 现有 hard rule 要求每轮准确命中 `commit_turn` 及多种领域事件；loader 多引入一个模型决策/工具 round-trip，需证明不会让模型绕过领域事件或错误结束回合；
2. `tool-policy.md` 当前直接列出具体工具，需决定 loader 是按场景自动路由还是由模型搜索，不能只把 schemas 隐藏而保留互相矛盾的可用性叙述；
3. 旧 session 从中途恢复时要验证 `addedToolNames` marker、active-set 重建、branch/compaction 后 replay；
4. 工具调用默认并行，同一 assistant batch 中 loader 新增的工具只能在**下一次模型请求**使用，不能让模型在同一 batch 先 load 再调用；
5. 项目工程宪章禁止把 prompt 当防线，分组与允许状态应由 registry/engine 的确定逻辑和测试保证。

建议后续独立 ADR/实现：先仅把 debug/初始化工具从正常游玩 active set 移出，再做一个确定性 capability loader；记录请求 tools schema 字节数、cacheRead、额外 turn 数和错误率，确认后才扩大到战斗/后台组。`tools/registry.ts` 是唯一应改的主入口；**Pass B 不应应用**（它本来就没有工具），backstage `--no-tools` 不应应用，showrunner 单一 `lookup` 也不应应用。

### 3. `toolChoice` — **暂不采用**

0.80.7 为 pi-ai 的 OpenAI Responses 与 Codex Responses 补齐 `StreamOptions.toolChoice`，支持 `"auto"`、`"required"` 和指定工具；官方 PR 的 live test 用 `toolChoice: "required"` 强制 `gpt-5.4` 与 Codex `gpt-5.5` 调工具。[pi-ai CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/ai/CHANGELOG.md)；[PR #6588](https://github.com/earendil-works/pi/pull/6588)

对当前项目没有立即用途：

- Pass A 走 coding-agent 自有 agent loop，项目没有在调用点传 `toolChoice`；把 `commit_turn` 强制为 named choice 还会妨碍一轮内先做领域工具、再 commit 的现有流程。
- Pass B 裸 `stream()` 的 context 没有 tools，设置 `none` 没有实质收益。
- backstage 是 `--no-tools`，showrunner 是否调用唯一 `lookup` 应由审计需要决定，不应强制。

未来若把“最终 direction packet”拆成独立单次 OpenAI Responses 调用，named tool choice 可作为结构化收口；当前应继续靠 engine schema/invariant，而不是把它当 correctness 防线。

### 4. `sessionAffinityFormat` breaking change — **升级即受益（无需迁移）**

0.80.7 删除 OpenAI Responses custom model 的 `compat.sendSessionIdHeader`，改为：

- `"openai"`：OpenAI 风格 affinity fields；
- `"openai-nosession"`：对应旧 `sendSessionIdHeader: false`；
- `"openrouter"`：使用 OpenRouter 的 `x-session-id`。

迁移规则是 `sendSessionIdHeader: false` → `sessionAffinityFormat: "openai-nosession"`。[release breaking note](https://github.com/earendil-works/pi/releases/tag/v0.80.7)；[PR #6496](https://github.com/earendil-works/pi/pull/6496)

本项目私有 `models.json` 只有 Google provider，未出现旧字段，因此升级无配置工作。Pass B 自设稳定 `sessionId`，但当前默认 Anthropic，不受 OpenAI header schema 影响；未来若用 OpenRouter/OpenAI Responses 渲染器，0.80.7 的 provider-correct affinity 会直接改善 sticky cache routing。

### 5. System prompt date/cache fix — **升级即受益（高相关）**

0.80.7 从 coding-agent 默认 system prompt 中删除当前日期，修复跨日期缓存失效。[release fix / issue #6621](https://github.com/earendil-works/pi/releases/tag/v0.80.7)

本项目 `buildSystemPrompt(baseSystemPrompt)` 会保留整个 pi 默认 prompt 再追加 Fate system，因此该修复直接稳定 Pass A 的跨日 prefix。当前开发机的全局 CLI 已是 0.80.7，所以本机 Pass A 已实际获得该修复；统一项目依赖仍是可复现性和 Pass B SDK 版本一致性的要求。Pass B 使用完全自建 `buildRendererSystemPrompt()`，不包含 pi 默认日期，且 `render-turn.ts` 已用滞回窗口维持散文史前缀稳定，所以 Pass B 不受该 bug 影响但也无需改代码。[`engine/prompt-assembly/injection.ts`](../engine/prompt-assembly/injection.ts)；[`engine/render/render-turn.ts`](../engine/render/render-turn.ts)

### 6. 其他 provider / UI fixes

| 0.80.7 项目                                                | 结论                     | 本项目相关性                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic-compatible proxy 缺失 `message_delta.usage` 容错 | **升级即受益**           | 主模型是 Anthropic；即使直连通常返回 usage，代理/适配器异常时可避免流失败。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                  |
| Ctrl+V 在剪贴板无图时粘贴文本                              | **升级即受益**           | 互动叙事大量中文输入，纯 UI 可靠性改善，无项目改造。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                         |
| Ctrl+X 复制最后/树中 assistant message                     | **升级即受益**           | 便于复制 GM 输出；注意最终玩家正文是 `fsn-prose` custom message，不应假定“last assistant”总等于最终正文，需手测实际 UX。[keybinding docs](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/keybindings.md#display-and-message-queue) |
| Alt+symbol legacy terminal decode                          | **升级即受益**           | 通用输入修复；项目未自定义这些 key。[TUI CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/tui/CHANGELOG.md)                                                                                                                                 |
| npm package removal peer conflict                          | **升级即受益**           | `.pi/settings.json` 配置了两个 npm pi packages，卸载/更新维护更稳；不影响故事 runtime。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                      |
| branch summary ambient auth                                | **升级即受益（边缘）**   | `/tree` 分支可能用到；项目自有 compaction 不等于 branch summary。默认 Anthropic API key/OAuth 未必触发，但修复无害。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                         |
| OpenRouter context window / session ID                     | **暂不采用，升级即具备** | 当前不以 OpenRouter 为默认；未来切换可直接受益。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                             |
| Fable 5 原生 `xhigh` / `max`                               | **不相关**               | 默认 Opus 4.6，custom models 为 Gemini；项目未配置 Fable 5。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                 |
| Bedrock login、SigV4、stop reason                          | **不相关**               | 当前 provider/config/spawn 未使用 Bedrock。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                                  |
| Cloudflare ambient IDs                                     | **不相关**               | 未配置 Cloudflare provider。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                                                 |
| Copilot `mai-code-1-flash-picker` Responses route          | **不相关**               | 当前未使用该模型。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                                                           |
| Azure encrypted reasoning replay                           | **不相关**               | 未配置 Azure OpenAI Responses。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                                              |
| OpenCode Responses affinity header                         | **不相关**               | 未配置 OpenCode。[release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)                                                                                                                                                                            |

## 建议落地顺序

1. **单独版本升级**：把三个直接 pi 包和 lock 更新到 0.80.7，不同时改 registry。
2. 运行 `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`。
3. 手工 smoke：默认 Anthropic 新局一轮、续局一轮、触发 Pass B lint retry、`run_showrunner_audit`、`run_parallel_line` 后 harvest；确认子进程仍继承隔离 settings。
4. 用 provider trace 对比跨日 Pass A system prompt、Pass B cacheRead；确认 date fix。
5. 另开设计任务试验 dynamic loading，先移出 debug/初始化工具，再逐组扩展；不要在升级 commit 中混入。

## 风险与未知项

- 本次仅研究与写文档，未把项目依赖与 lock 升至 0.80.7，因此尚未验证统一 0.80.7 依赖后的 typecheck/test/smoke；当前机器的全局 CLI 已是 0.80.7。
- dynamic loading 的收益依赖真实 provider 是否兑现原生协议和 cache usage；官方模型范围只能证明协议路径，不能替代本项目请求级指标。
- `Ctrl+X` 对 `fsn-prose` custom message 的选择行为需升级后手测。
- 私有 `.pi/agent/models.json` 含认证材料，本文只核对配置字段与 API 类型，不复制任何值；该文件应继续保持 gitignored。

## 一手来源索引

- [pi 0.80.7 release](https://github.com/earendil-works/pi/releases/tag/v0.80.7)
- [coding-agent 0.80.7 CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/CHANGELOG.md)
- [pi-ai 0.80.7 CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/ai/CHANGELOG.md)
- [agent-core 0.80.7 CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/agent/CHANGELOG.md)
- [pi-tui 0.80.7 CHANGELOG](https://github.com/earendil-works/pi/blob/v0.80.7/packages/tui/CHANGELOG.md)
- [Dynamic Tool Loading 官方文档](https://github.com/earendil-works/pi/blob/v0.80.7/packages/coding-agent/docs/extensions.md#dynamic-tool-loading)
- [Dynamic loading PR #6474](https://github.com/earendil-works/pi/pull/6474)
- [`splitDeferredTools` 官方源码](https://github.com/earendil-works/pi/blob/v0.80.7/packages/ai/src/utils/deferred-tools.ts)
- [`toolChoice` PR #6588](https://github.com/earendil-works/pi/pull/6588)
- [`sessionAffinityFormat` PR #6496](https://github.com/earendil-works/pi/pull/6496)
