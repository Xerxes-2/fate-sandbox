# pi 0.80.4→0.80.6 增量与资源隔离调研

> 范围：仅 Pi 一手资料（0.80.6 CHANGELOG、官方 docs/source）与本仓库启动/子进程代码。没有改动项目代码或既有研究文档。

## 建议现在做什么（最多 3 项）

1. **保持现有隔离启动与两条后台 spawn argv，不因 0.80.4 改造。** `PI_CODING_AGENT_DIR=.pi/agent`、主进程的 `--no-skills --skill ./skills/` 和显式 `-e` 已分别隔离用户配置、收紧技能边界、固定扩展入口；后台的 `--no-approve` / `--no-tools`（以及 showrunner 的 `--no-extensions -e ... --no-builtin-tools`）必须原样保留。来源：`start.sh`、`start.ps1`、`engine/core/backstage/backstage-spawn.ts`、`engine/core/showrunner/showrunner-spawn.ts`；Pi `docs/usage.md`「Project Trust」「Resource Options」。
2. **升级项目三项 Pi 依赖至 0.80.6，然后用 `agent_settled` 替代 two-pass 的 idle 轮询。** 0.80.6 源码在 emit 前先将 `_isAgentRunActive=false`；活体 spike 证实 handler 中 `ctx.isIdle() === true`，`sendMessage({triggerTurn:false})` 走 append-only 分支，只有一次 LLM 调用。这直接消除 25ms×400 轮询及其 10s 丢 prose 风险。涉及 `package.json`、`pnpm-lock.yaml`、`extensions/two-pass-render/index.ts`。来源：0.80.4 CHANGELOG；0.80.6 `dist/core/agent-session.js` `_emitAgentSettled()` / `_runAgentPrompt()` / `sendCustomMessage()`；官方 `docs/extensions.md`「agent_start / agent_end / agent_settled」。
3. **0.80.4 的 project-local resource 配置无需改造现有隔离。** `pi config -l` 只是管理 project scope 的资源 override，不是新的 runtime sandbox；`showCacheMissNotices` 只作为本地开发诊断开关，默认不写入发布配置。来源：0.80.4 CHANGELOG、`docs/packages.md`「Enable and Disable Resources」、`docs/settings.md`「Model & Thinking」。

## 版本完整增量（0.80.4 / 0.80.5 / 0.80.6）

| 版本   | 原始条目与本项目判断                                                                                                                                                           | 分类                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 0.80.4 | `agent_settled` 与 session-level fully-settled idle waiting。源码与真实 provider spike 均确认 handler 运行时已 idle，可安全 append-only 追加 prose 且不会触发第二轮 LLM。      | **应采用**（two-pass-render） |
| 0.80.4 | `before_provider_headers`：每次 provider 请求前可改 headers。可做网关 tracing/租户路由，但会触及所有主游戏请求；本项目没有这一需求。绝不能拿它给后台子进程补权限或改变其隔离。 | **不采用**                    |
| 0.80.4 | entry renderers：持久化、**仅显示**、且不进入模型 context 的 session entry renderer。适合未来审计/提示卡；现有 `fsn-prose` 使用 custom message 并承担连续性锚，不能机械迁移。  | **延后**                      |
| 0.80.4 | `InlineExtension`：SDK/嵌入式入口的具名 inline factory 类型。项目是 CLI `pi -e` 加载，不使用 `main()`/SDK host。                                                               | **无关**                      |
| 0.80.4 | `pi config -l` 与 Tab 在全局/项目 scope 间管理资源 override。对目前已经手写 `.pi/settings.json` 的 packages 无运行时隔离增益；仅方便交互式编辑其资源过滤。                     | **不采用（当前）**            |
| 0.80.4 | `showCacheMissNotices` 与 `/settings` toggle。长叙事/compaction 调试可观察明显 prompt cache miss；默认打开会污染玩家 transcript。                                              | **开发期可选，默认不采用**    |
| 0.80.4 | `/login <provider>` 自动补全；仅改善首次手动登录体验，未改变 auth storage scope。                                                                                              | **被动收益**                  |
| 0.80.4 | GPT-5.6/Copilot Claude/zstd Codex SSE、各 provider 修复、模型默认选择修复。依所选 provider 被动受益；没有项目 API 改动。                                                       | **被动收益**                  |
| 0.80.5 | CHANGELOG 只有版本标题，没有 Added/Changed/Fixed 条目。                                                                                                                        | **无变更**                    |
| 0.80.6 | `max` thinking level、input-token pricing tier、`shellPath` 的 `~` 展开。项目未固定上述设置；可被用户选择使用。                                                                | **被动/无关**                 |
| 0.80.6 | 修复 compaction 后错误沿用压缩边界前 assistant usage 的 output-token budgeting。长 session 直接受益，无需代码。                                                                | **被动收益（相关）**          |

**一手引文：** `@earendil-works/pi-coding-agent/CHANGELOG.md`「[0.80.4]」「[0.80.5]」「[0.80.6]」。0.80.4 另修复 custom message 被计入 compaction retained-token budget，故不应为“省 context”而擅自改变现有 two-pass custom-message 语义。

## 精确的 scope / 隔离结论

### 1. 现在实际存在的三层

| 语义层                                                                                                                                  | 默认位置        | fate-sandbox 实际位置/效果                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **用户（global）agent 配置**：`settings.json`、`auth.json`、信任决定、用户自动发现资源、用户 package 安装                               | `~/.pi/agent/`  | 被 `PI_CODING_AGENT_DIR=.pi/agent`（Windows 为绝对 `$ProjectAgentDir`）改写为仓库内私有 `.pi/agent/`。因此全局 auth/skills/extensions/packages 不会作为该游戏的 user scope 自动漏入；首次脚本只复制 auth。 |
| **当前 cwd 的 project-local 配置/资源**：`.pi/settings.json`、`.pi/extensions`、`.pi/skills`、project packages 及 `.pi/npm` / `.pi/git` | `<cwd>/.pi/`    | **仍独立存在，环境变量没有吞掉它。** 当前 `.pi/settings.json` 声明两个 package；经 trust 后自动安装/加载 project resources，npm 物理安装在 `.pi/npm/`。                                                    |
| **显式 CLI 资源**：`-e`、`--skill` 等                                                                                                   | 每次 invocation | 主启动明确装载项目 extension；docs 明确 CLI `-e` 在 trust 前也会加载，且 `--no-*` 可与显式路径组合。主启动用 `--no-skills --skill ./skills/` 把 skill 允许集锁死。                                         |

依据：`docs/settings.md`「Settings」「Resources」「Project Overrides」；`docs/packages.md`「Install and Manage」「Package Sources」「Enable and Disable Resources」「Scope and Deduplication」；`docs/usage.md`「Project Trust」「Resource Options」；`start.sh`、`start.ps1`。

补充：项目 settings 覆盖 global settings，嵌套对象 merge（`docs/settings.md`「Project Overrides」）；相同 package 同时出现在 global/project settings 时项目项获胜（`docs/packages.md`「Scope and Deduplication」）。这里的“global”是 **effective agent dir**，故设置环境变量后是 `.pi/agent`，不是 `~/.pi/agent`。

### 2. 0.80.4 `pi config -l` 在这里到底做什么

`pi config` 是 package/local-dir 的 extension、skill、prompt、theme **启用/禁用（过滤）管理 UI**；0.80.4 新增 `-l` 进入 project mode，Tab 切 global/project。它改变对应 settings 中的资源 override，下一次正常 runtime 读取该 settings 时才体现；**不是**一项新的运行时 resource-loader sandbox，也不替代 CLI flags，更不改变 `PI_CODING_AGENT_DIR`。

所以它不只是“只影响 `/settings`”：它会持久修改配置，进而影响之后的 runtime loading；但它也**不是**一次运行的加载开关。对本仓库而言：

- 不加 `-l` 的 global pane 会写入 effective global `.pi/agent/settings.json`；
- `-l` 的 project pane 会写入 `.pi/settings.json`；
- 两个文件都碰巧位于本仓库，不代表 scope 被合并；它们的 precedence、相对路径基准与 trust 语义不同；
- 当前主启动的 `--no-skills --skill ./skills/`、显式 `-e` 优先级/disable 组合继续决定该次运行，不能由 `pi config -l` 绕开。

来源：0.80.4 CHANGELOG；`docs/packages.md`「Enable and Disable Resources」；`docs/settings.md`「Resources」；`docs/usage.md`「Resource Options」。

### 3. Trust 以及后台 hermetic 边界

Pi 在 interactive startup 遇到 project `.pi/settings.json`、resources 或 `.agents/skills` 且无既有决定时询问 trust。trust 后才读取 project settings/resources、安装缺失 project packages、执行 project extensions；trust decision 写入 effective agent-dir 的 `trust.json`。在 `-p`/JSON/RPC 中没有询问；无已保存决定时由 **global-only** `defaultProjectTrust` 决定，单次可用 `--approve` 或 `--no-approve` 覆盖。来源：`docs/usage.md`「Project Trust」、`docs/settings.md`「Project Trust」。

这带来两个明确结论：

- 用户启动：不要为“免一次提示”向 `start.sh`/`start.ps1` 加 `--approve`。release 项目本身含可执行 extension 和 package 安装，保留用户明示 trust；并且现有 `-e` 是刻意、可审计的预信任加载入口。
- 后台：保留 `--no-approve`。它保证 print-mode child 忽略 project-local settings/resources；showrunner 再以 `--no-extensions -e timeline --no-builtin-tools --no-skills --no-prompt-templates` 做最小允许集。这比任何新 hook/config API 都强，不能降级。`env: process.env` 继承 `PI_CODING_AGENT_DIR` 只决定其 effective user/global storage，不抵消 `--no-approve` 对 project resources 的拒绝。

## 现状替代方案逐项裁决

| 建议变化                                              | 裁决                   | 原因与涉及文件                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用 `pi config -l` 取代手动 auth copy                  | **拒绝**               | 它管理 resources，不管理 `auth.json`；auth 仍属于 effective agent dir。保留 `start.sh`/`start.ps1` 的首次复制或让用户在隔离目录 `/login`。0.80.4 只有 `/login <provider>` 补全，没有 auth scope 新机制。                                         |
| 删除 `PI_CODING_AGENT_DIR`，改靠 project-local config | **拒绝**               | 会重新暴露 `~/.pi/agent` 的全局 auth/resources/packages，且 project `.pi` 不等于 user/global agent storage。涉及 `start.sh`、`start.ps1`。                                                                                                       |
| 用 project-local packages 替代当前 npm 隔离           | **已实现；不改**       | `.pi/settings.json` 已是 project package 声明，官方规定其安装在 `.pi/npm/`；trust 后自动安装。`pi config -l` 不会更隔离，只是筛选资源。涉及 `.pi/settings.json`。                                                                                |
| 用 `.pi/extensions` 自动发现取代主启动的显式 `-e`     | **拒绝**               | 显式清单是本项目可审计的 extension allowlist，且 trust 前可确定加载；自动发现/包资源受 trust 和 settings 影响。主启动保留 `-e`。涉及 `start.sh`、`start.ps1`、`extension.ts`。                                                                   |
| 放宽 `--no-skills`，交给 config 管理                  | **拒绝**               | 当前 `--no-skills --skill ./skills/` 是严格边界；`pi config` 是持久过滤而非本次 CLI allowlist。涉及 `start.sh`、`start.ps1`。                                                                                                                    |
| 在主启动加入 `--approve` / 修改 `defaultProjectTrust` | **拒绝**               | 前者跳过用户对可执行 project code/packages 的一次信任决定；后者是 effective-global 设置，且影响面更宽。后台已有且必须保留 `--no-approve`。涉及 `start.sh`、`start.ps1`、两份 spawn 文件。                                                        |
| 用 `agent_settled` 重写 two-pass 调度                 | **采用（先升级依赖）** | 0.80.6 源码与真实 provider spike 均证实事件触发时 `ctx.isIdle() === true`；custom prose 走 append-only 分支，只有一次 agent run。可删除 idle 轮询及 10s 丢弃路径。涉及 `package.json`、`pnpm-lock.yaml`、`extensions/two-pass-render/index.ts`。 |
| 使用 `before_provider_headers` 给主游戏请求加标识     | **拒绝（无需求）**     | 能注入 header，但增加 provider/gateway 行为与隐私面；不适合用作隔离。若将来确有自有网关 tracing，限定在 `extension.ts` 并明确不加载到 hermetic children。                                                                                        |
| entry renderer 迁移现有 prose                         | **延后**               | 新 renderer 是 display-only/no-model-context，和现有 prose 的 continuity 责任不同；可另做“审计 marker”设计，不迁移核心消息。                                                                                                                     |
| InlineExtension                                       | **拒绝**               | CLI 项目不走 SDK embedding；无行为收益。                                                                                                                                                                                                         |
| 开启 `showCacheMissNotices`                           | **延后（调试开关）**   | 对定位 cache 回退有益，玩家 transcript 会增加提示。若使用，只在本地 `.pi/agent/settings.json` 开发配置，不入 `.pi/settings.json`/发布物。                                                                                                        |

## API 要点（供后续 spike 精确引用）

- **`agent_settled`**：0.80.4 新增 extension/RPC event，文档定位为“Pi 不会自动继续运行”的状态整合点；对应 session-level fully-settled idle wait。0.80.6 `_emitAgentSettled()` 在 emit 前先把 `_isAgentRunActive=false`，因此 event ctx 的 `isIdle()` 为 true；此时 `sendCustomMessage(..., {triggerTurn:false})` 进入直接 append + session persistence 分支。2026-07-10 活体 spike（真 0.80.6 + DeepSeek provider）记录为：`agent_start:1 → agent_end idle=false → agent_settled idle=true → custom_sent → shutdown starts=1`，session JSONL 尾部为 custom_message，无第二条 assistant message。来源：0.80.4 CHANGELOG；0.80.6 `dist/core/agent-session.js`；`docs/extensions.md`「agent_start / agent_end / agent_settled」。
- **`before_provider_headers`**：在请求发出前修改 outgoing headers；适用于 tracing/session correlation/tenant routing。它是请求级 hook，不是 auth/resource scope API。来源：0.80.4 CHANGELOG；`docs/extensions.md`「before_provider_headers」。
- **entry renderers**：渲染 persisted display-only entries，interactive 可见、模型 context 不可见。来源：0.80.4 CHANGELOG；`docs/extensions.md` 的 custom rendering / session-entry renderer 说明。
- **`InlineExtension`**：为 named inline extension factories 提供类型，SDK ResourceLoader/嵌入式 host 使用；不是 CLI `-e` 的替身。来源：0.80.4 CHANGELOG；`docs/sdk.md`「InlineExtension」。
- **compaction/cache**：0.80.4 `showCacheMissNotices`；0.80.6 修复 compaction 后 output-token 预算误用旧 usage。前者诊断、后者直接稳定性收益。来源：0.80.4、0.80.6 CHANGELOG；`docs/settings.md`「Model & Thinking」「Compaction」。

## 来源

- **保留：** `@earendil-works/pi-coding-agent/CHANGELOG.md`「[0.80.4]」「[0.80.5]」「[0.80.6]」——本次版本增量的原始发布记录。
- **保留：** `docs/packages.md`「Enable and Disable Resources」「Scope and Deduplication」「Install and Manage」——`pi config -l`、package 安装位置、scope 结论。
- **保留：** `docs/usage.md`「Project Trust」「Resource Options」——trust 时序、CLI explicit resources 与 `--approve`/`--no-approve`。
- **保留：** `docs/settings.md`「Settings」「Project Trust」「Resources」「Project Overrides」「Model & Thinking」「Compaction」——配置 precedence、资源路径与 cache notice。
- **保留：** `docs/extensions.md`「agent_start / agent_end / agent_settled」「before_provider_headers」及 entry renderer 相关章节——新 extension API 的语义。
- **保留：** `docs/sdk.md`「InlineExtension」——SDK-only 类型边界。
- **保留：** `start.sh`、`start.ps1`、`.pi/settings.json`、`extension.ts`、`engine/core/backstage/backstage-spawn.ts`、`engine/core/showrunner/showrunner-spawn.ts`——本项目的实际加载与 hermetic argv 证据。
- **保留：** `docs/pi-changelog-api-research.md`「勘误：two-pass-render 轮询替代方案调查（证伪）」——`agent_settled` spike 的既有约束，不当作 Pi 一手资料来支撑版本事实。

## 剩余实施前提

- 全局 `pi` 已是 0.80.6，但项目 `package.json` 仍声明 `^0.80.3`，当前 `node_modules` 三项 Pi 包实际解析为 0.80.3。采用 `agent_settled` 前必须把 `@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui` 一起升级并锁定到 0.80.6，再跑四项检查。
- spike 验证的是最小 custom-message 交付语义。实际迁移仍需覆盖 `direct-reply`、`render-fallback`、正常 rendered prose、choice/render widget 清理以及玩家抢跑输入的回归测试。
