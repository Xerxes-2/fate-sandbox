# Research: pi (@earendil-works/pi-coding-agent) API 变更调研 — 项目起始基线 → 0.80.3

> 调研日期：2026-07-09。目标：确定 fate-sandbox 项目开工时（首个 commit `7167d4a`，2026-05-27 01:42 +1000）pi 的当时最新版本，并梳理该基线到当前安装版 0.80.3 之间新增/变更的、本项目实际能用上的 API。
> 方法：npm registry 发布时间戳（primary）+ 安装包内 `CHANGELOG.md` 全文（primary）+ 对本仓库扩展代码的实际用法盘点。**未修改任何项目代码。**

---

## 结论摘要（最值得采用的 API，按对本仓库价值排序）

1. **`session_before_compact` / `session_compact` 事件新增 `reason` + `willRetry`（0.79.10）**
   - 是什么：compaction 事件现在携带触发原因（手动 `/compact` / 阈值自动 / overflow retry）与是否将重试。
   - 为什么重要：`extensions/compaction-policy/index.ts` 目前对所有 compaction 一视同仁地做确定性截断。有了 `reason`，可以区分「玩家手动压缩」与「overflow 紧急压缩」，对 overflow 场景采取更激进的截断或额外告警；`willRetry` 可用于决定是否把 dumpCompaction 调试落盘标记为重试轮。
   - 谁用：`compaction-policy`。（配套：0.80.3 修复了 pre-prompt compaction 压缩后立即继续的问题，#6074。）

2. **`InputEvent.streamingBehavior`（0.77.0）——【已证伪，见文末勘误】**
   - 是什么：扩展 input 事件可区分 idle prompt、mid-stream steer、queued follow-up。
   - 原推荐（不成立）：用 `streamingBehavior` + 0.77.0 的「`agent_end` 队列 follow-up 在 idle 前 drain」修复（#5115）把 `sendProseWhenIdle` 的 25ms×400 轮询后备逻辑收紧或简化。
   - **勘误（2026-07-09 活体 spike + 源码验证）：轮询在 pi 0.80.3 上是结构性必需的，不可用 `deliverAs:"followUp"` 或任何现有 API 替代。详见文末「勘误：two-pass-render 轮询替代方案调查（证伪）」。**

3. **`before_agent_start` systemPrompt 覆盖不再被工具变更冲掉（0.80.3 修复，#6162）**
   - 是什么：同一 agent run 内扩展工具变更现在会在下一次 provider 请求前生效，且不丢 `before_agent_start` 的 system prompt override。
   - 为什么重要：`extension.ts` 正是用 `before_agent_start` 返回 `buildSystemPrompt(...)` 做全量 system prompt 接管——这个修复直接消除了一个可能让结算 pass 短暂回落到默认 coding-agent 提示词的窗口。升级本身就是收益，无需改代码。
   - 谁用：`extension.ts`。

4. **Project trust 体系（0.79.0 `project_trust` 事件 + `--approve`/`--no-approve` 语义、0.79.1 `ctx.isProjectTrusted()` 与 `defaultProjectTrust` 设置）**
   - 是什么：pi 现在在加载项目本地 settings/resources/instructions/packages 前询问信任；非交互模式用 `--approve`/`--no-approve` 控制。
   - 为什么重要：两条后台工作进程的 spawn argv（`engine/core/backstage/backstage-spawn.ts`、`engine/core/showrunner/showrunner-spawn.ts`）已带 `--no-approve`——0.79.0 之后这个 flag 的语义变成「拒绝加载项目本地资源」，恰好强化了隔离不变量（防线从 prompt 变成结构性）。另外 `start.ps1`/`start.sh` 的首次启动体验会新增一次 trust 询问，release 文档（README）应提示玩家选 trust；也可评估在启动脚本里对自家项目加 `--approve`。
   - 谁用：backstage/showrunner spawn seam（已被动受益）、start 脚本、发布文档。

5. **`--no-session --session-id`（0.80.3 修复，#6070）与 `--name` / `-n`（0.78.0）**
   - 是什么：ephemeral（不落盘）CLI run 也能用确定性 session ID 换取 provider cache 亲和；`--name` 可在启动时给 session 设显示名。
   - 为什么重要：backstage director 与 showrunner auditor 都以 `--session-id <runId>` 落盘 session（0.76.0 引入的 `--session-id` 本身就在基线边界内，本项目已在用）。若未来某类审计 run 不需要持久 transcript，`--no-session --session-id` 可以省掉 gitignored session 清理负担同时保留缓存亲和；`--name` 可让 `.pi/agent/backstage-sessions/` 里的 run 在 session 列表里可读。
   - 谁用：`backstage-spawn.ts`、`showrunner-spawn.ts`（可选增强）。

6. **`ctx.mode` + `ctx.getSystemPromptOptions()`（0.78.1）——【复核后降级：基本无落点】**
   - 是什么：扩展可区分 TUI / RPC / JSON / print 模式（`"tui" | "rpc" | "json" | "print"`），并读取基础 system prompt 的构造输入。
   - 复核（2026-07-09）：`extensions/subagents/timeline/index.ts` 实际只有 28 行、仅注册 lookup 工具，**没有任何 UI 分支可供 `ctx.mode` 简化**；全仓库现有 `ctx.hasUI` guard 均正确。唯一潜在落点：`player-panel` 的 `ctx.ui.custom` 是终端专属组件，而 `hasUI` 在 RPC 模式下也为 true——若未来做外部前端（RPC 模式），该处应改用 `mode === "tui"` guard。当前不值得动。
   - 谁用：暂无（未来 RPC 前端时的 `player-panel`）。

7. **公共导出补齐：`CONFIG_DIR_NAME`（0.79.7）、`generateDiffString`/`generateUnifiedPatch`/`EditDiffResult`（0.79.7）、`convertToPng`、`parseArgs`/`Args`（0.78.0）、包资产路径 helpers 与 RPC extension UI 类型（0.79.0）**
   - 为什么重要：`CONFIG_DIR_NAME` 让 `backstage-substrate-config.ts` 这类硬编码 `.pi/agent/...` 路径的模块可以从 SDK 取常量（本包 `piConfig.configDir = ".pi"`，硬编码目前正确但属于隐式耦合）；diff helpers 对未来做「修档工具展示 state diff」有用。
   - 谁用：`engine/core/backstage/`、`engine/core/showrunner/`、potential debug 工具。

8. **扩展 autocomplete 触发字符（0.79.1，`ctx.ui.addAutocompleteProvider()` trigger characters，#4703）**
   - 是什么：自动补全可由 `#`、`$` 等字符触发，不再限于斜杠命令前缀。
   - 为什么重要：`player-choices` 目前用 widget 列出 `/choice N`；可以给玩家提供输入 `#` 直接弹出候选行动补全的更顺手交互。
   - 谁用：`player-choices`。

9. **`session_info_changed` 扩展事件（0.80.3）**
   - 是什么：session 改名时通知扩展。
   - 为什么重要：若给对局 session 起名（战役名/章节名），player-panel 或存档管理可以联动。优先级低但零成本。
   - 谁用：`player-panel`（可选）。

10. **pi-ai 全局 API 迁往 `/compat`（0.80.0，过渡期）**
    - 是什么：`stream`/`streamSimple` 等从 `@earendil-works/pi-ai` 根入口移到 `@earendil-works/pi-ai/compat`；compat 入口与 loader alias **将在未来版本移除**。
    - 现状：`two-pass-render` 已改从 `/compat` 导入并留有注释（「待 coding-agent ModelManager 迁移完成后改用 createModels() + provider 工厂」）。这是本仓库唯一已知的待办迁移债，应跟踪 pi 的 migration guide。
    - 谁用：`two-pass-render`。

---

## 基线版本判定（date → version 证据）

- 仓库首个 commit：`7167d4a` "feat: bootstrap strict TS engineering baseline"，2026-05-27 01:42 +1000 = **2026-05-26 15:42 UTC**（任务给定）。
- npm registry（`https://registry.npmjs.org/@earendil-works/pi-coding-agent`，各 version 的 `_npmOperationalInternal.tmp` 发布纪元毫秒）：
  - `0.75.4` → `1779287056768` ≈ **2026-05-20 14:24 UTC**（CHANGELOG 标注 2026-05-20，吻合）
  - `0.75.5` → CHANGELOG 标注 **2026-05-23**
  - `0.76.0` → `1779912237670` ≈ **2026-05-27 20:04 UTC**（CHANGELOG 标注 2026-05-27，吻合）
- 判定：**首 commit 时刻（05-26 15:42 UTC）npm 上最新的是 0.75.5**；`0.76.0` 在约 28 小时后发布。用户记忆的「~0.76」基本准确——项目开工正好卡在 0.75.5 → 0.76.0 交界。
- 因此本报告的变更区间取 **`0.76.0` 起（含）至 `0.80.3`（含）**，即项目存续期内发布的全部版本。注意 `--session-id`（backstage spawn 依赖）恰好是 0.76.0 新增的，说明该能力是项目开工后才拿到的。
- 仓库地址：0.76.0 时代为 `github.com/earendil-works/pi-mono`，0.80.3 的 package.json `repository` 已改为 `github.com/earendil-works/pi`（同一项目迁移）。

---

## 版本区间完整变更清单（0.76.0 → 0.80.3，按领域分组）

来源：安装包 CHANGELOG.md（`/home/ubuntu/.local/share/pnpm/.../pi-coding-agent/0.80.3/.../CHANGELOG.md`）。标注 **可用** = 本项目有直接落点；**受益** = 升级即生效的修复，无需改码；**无关** = 与本项目无交集（主要是 provider/模型 metadata 类，此处只汇总不逐条列举）。

### A. 扩展 API（extension events / ctx / 公共导出）

| 版本    | 变更                                                                                                                      | 相关性                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0.77.0  | `InputEvent.streamingBehavior`（idle / steer / queued follow-up）                                                         | ~~可用~~ → **证伪**（见文末勘误；two-pass-render 轮询不可替代）     |
| 0.77.0  | `agent_end` 排队的 follow-up 在 agent idle 前 drain（#5115）                                                              | **受益**（two-pass-render 的 idle 假设）                            |
| 0.77.0  | SIGTERM/SIGHUP 退出会先跑 `session_shutdown` 清理并还原终端（#5080）                                                      | **受益**                                                            |
| 0.77.0  | `pi.getAllTools()` 暴露每个工具的 `promptGuidelines`（#4879）                                                             | 可用（低优先）                                                      |
| 0.77.0  | session disposal 会 abort 在途 agent/compaction/branch summary/retry/bash（#5029）                                        | **受益**（rewind 的 abort+waitForIdle 路径）                        |
| 0.78.0  | 导出 `convertToPng`、`parseArgs` / `Args`（#5167、#5202）                                                                 | 可用（低优先）                                                      |
| 0.78.1  | `ctx.mode`（TUI/RPC/JSON/print）                                                                                          | ~~可用~~ → 基本无落点（timeline 无 UI 分支；见结论摘要第 6 项复核） |
| 0.78.1  | `ctx.getSystemPromptOptions()`（#5306）                                                                                   | 可用                                                                |
| 0.78.1  | `renderShell: "self"` 渲染器空行修复（#5299）                                                                             | **受益**（registerMessageRenderer 用户）                            |
| 0.79.0  | `project_trust` 扩展事件；导出 RPC extension UI 请求/响应类型（#5455）、包资产路径 helpers（#5415）                       | 可用                                                                |
| 0.79.0  | **移除 `./hooks` 子路径导出**                                                                                             | 无关（本项目未用）                                                  |
| 0.79.1  | `ctx.isProjectTrusted()`（#5523）；`ctx.ui.addAutocompleteProvider()` 触发字符（#4703）；`areExperimentalFeaturesEnabled` | **可用**（player-choices 的 `#` 触发补全）                          |
| 0.79.7  | 导出 `CONFIG_DIR_NAME`（#5869）；导出 `generateDiffString` / `generateUnifiedPatch` / `EditDiffResult`（#5756）           | **可用**                                                            |
| 0.79.9  | 同目录 session 切换复用已 import 的扩展模块、保持新实例与生命周期事件（#5905）                                            | **受益**（rewind / session 切换 + session_tree 再水合）             |
| 0.79.10 | `session_before_compact` / `session_compact` 增加 `reason` + `willRetry`（#5962）                                         | **可用（首推）**（compaction-policy）                               |
| 0.80.3  | `session_info_changed` 扩展事件（#6175）                                                                                  | 可用（低优先）                                                      |
| 0.80.3  | 扩展工具变更在同一 run 的下次 provider 请求前生效且不丢 `before_agent_start` systemPrompt override（#6162）               | **受益（重要）**（extension.ts）                                    |

### B. Compaction

| 版本    | 变更                                                                                                              | 相关性                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0.79.0  | compaction 摘要 system prompt 对非 coding agent 用中性措辞（#5401）                                               | **受益**（叙事游戏；但本项目已自管 summary，仅后备路径受益） |
| 0.79.8  | compact 结果与 compaction 事件包含压缩后 token 估算（#5877）                                                      | **可用**（compaction-policy 的告警/调试落盘）                |
| 0.79.8  | 无可压缩消息时拒绝 compaction 而非产出空摘要（#4811）；overflow 触发的自动压缩成功后不再重试已完成的回复（#5720） | **受益**                                                     |
| 0.79.10 | reason/willRetry（见上）                                                                                          | **可用**                                                     |
| 0.80.3  | pre-prompt compaction 压缩后停止、不再立即继续（#6074）                                                           | **受益**                                                     |

### C. Headless / CLI（`pi -p` 子进程 seam、start.sh）

| 版本   | 变更                                                                                                                                       | 相关性                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 0.76.0 | `--session-id <id>`（#4874）；RPC `bash` 的 `excludeFromContext`（#5039）；`retry.provider.maxRetries` 设置                                | **可用/已用**（backstage & showrunner spawn 已用 `--session-id`；RPC 项无关）                 |
| 0.77.0 | `--exclude-tools` / `-xt` 选择性禁用工具（#5109）                                                                                          | 可用（spawn firewall 粒度备选；当前 `--no-tools`/`--no-builtin-tools` 更强，维持现状即可）    |
| 0.77.0 | Codex 订阅 device-code 登录（headless）                                                                                                    | 无关                                                                                          |
| 0.78.0 | `--name` / `-n` 启动时设 session 显示名（#5153）                                                                                           | **可用**（backstage/showrunner session 可读性）                                               |
| 0.78.1 | 超大 JSONL session 改为逐行读取，避免 OOM（#5231）                                                                                         | **受益**（长对局 session；注意 `backstage-session-read.ts` 自己读 jsonl，不受此影响但可参照） |
| 0.78.1 | SDK `createAgentSession()` 不再要求 bundle 旁有 package.json（#5226）                                                                      | 无关（本项目不 bundle SDK）                                                                   |
| 0.79.0 | project trust + `--approve` / `--no-approve`（非交互模式）                                                                                 | **可用/已被动受益**（spawn argv 已带 `--no-approve`；start 脚本首启会多一次 trust 询问）      |
| 0.79.2 | 项目 trust 检测忽略 `$HOME` 下的全局状态（#5619）                                                                                          | 受益                                                                                          |
| 0.79.9 | 深分支 session 的 context/branch 构建从平方降为线性（#5909）                                                                               | **受益**（rewind 频繁 getBranch/navigateTree、长对局树）                                      |
| 0.80.3 | `--no-session --session-id` ephemeral 确定性 session ID（#6070）；`--session` / `SessionManager.open()` 拒绝覆盖非法 session 文件（#6002） | **可用**（spawn seam 备选）/ 受益                                                             |
| 0.80.3 | 包级 `./rpc-entry` 导出、RPC `get_entries` / `get_tree`（#6078）                                                                           | 无关（本项目不用 RPC 模式；若未来做外部前端则可用）                                           |

### D. TUI / 渲染（中文游戏体验相关）

| 版本   | 变更                                                                         | 相关性                                                      |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 0.78.1 | overlay 焦点恢复（#5235）、tab 宽度合成（#5218）                             | **受益**（player-panel 的 `ctx.ui.custom` overlay）         |
| 0.79.1 | 中英混排 CJK 断行修复（#5495）；prompt 历史草稿恢复（#5494）                 | **受益**（全链路中文输入/输出）                             |
| 0.79.2 | 编辑器 CJK 断行（#5585）、宽松列表空行（#5562）                              | **受益**                                                    |
| 0.79.4 | overlay 覆盖 CJK 全宽字符时边框对齐（#5297）                                 | **受益**（player-panel 面板边框）                           |
| 0.79.7 | 自动主题模式（light/dark 跟随终端）；`/settings` 分别配置明暗主题            | 可用（start.sh 目前写死 `"theme": "dark"`，可改用自动模式） |
| 0.79.9 | Markdown 流式代码围栏闪烁修复（#5846）                                       | 受益                                                        |
| 0.80.3 | `outputPad` 输出内边距设置（#6168）；`externalEditor` 设置（#6122）          | 可用（叙事正文排版微调）/ 无关                              |
| 0.80.3 | 用户消息转写保留 Markdown 反斜杠转义（#6105）；输出长度截停显式报错（#4290） | 受益                                                        |

### E. pi-ai / 模型层（two-pass-render 的裸 stream 调用）

| 版本                                                                                                          | 变更                                                                                                                                              | 相关性                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0.79.8                                                                                                        | `@earendil-works/pi-ai/base` 选择性 provider 入口（#5348）                                                                                        | 无关（**0.80.0 已移除**）                                                                                                |
| 0.80.0                                                                                                        | **pi-ai 全局 API（`stream`/`complete`/`getModel`…）移至 `@earendil-works/pi-ai/compat`**；loader 对扩展做运行时 alias；compat 与 alias 未来将移除 | **可用/已迁移**（two-pass-render 已 import `/compat`；后续需按 migration guide 迁到 `createModels()`/provider 工厂）     |
| 0.80.0                                                                                                        | 移除 `/base` 入口                                                                                                                                 | 无关                                                                                                                     |
| 0.80.2                                                                                                        | `ApiKeyCredential` 判别符改 `type: "api_key"`；`ExecutionEnvExecOptions` 更名 `ShellExecOptions`                                                  | 无关（本项目不触这两个类型）                                                                                             |
| 0.80.3                                                                                                        | `Usage.reasoning` token 计数（#6057）；provider HTTP 错误带响应体（#5832）；`streamSimple()` max-token 上限修复（#5595）                          | **受益**（two-pass-render 用 `stream`/`streamSimple`，错误可诊断性提升）                                                 |
| 0.76.0–0.80.3 各版大量 provider/模型 metadata 修正（DeepSeek、GLM、Kimi、Claude、GPT-5.x、Bedrock、Azure 等） | 逐条从略                                                                                                                                          | 受益（按所用模型；extension.ts 注释标明 DeepSeek V4 特化，0.79.5/0.79.6/0.79.9 多条 DeepSeek thinking 兼容修复直接相关） |

### F. 配置 / 安全 / 打包

| 版本    | 变更                                                                                              | 相关性                                                        |
| ------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 0.76.0  | provider 重试/超时可控（`retry.provider.maxRetries`、`websocketConnectTimeoutMs`）                | 可用（长渲染轮稳定性）                                        |
| 0.78.1  | 临时扩展安装目录改私有 `~/.pi/agent/tmp/extensions`（0700）；HTML 导出 XSS 修复；git 包来源安全化 | 受益                                                          |
| 0.79.5  | `auth.json` API key 条目支持 `env` 覆盖；全局 `httpProxy` 设置（#5790）                           | 可用（项目隔离的 `.pi/agent/auth.json` 可挂 provider 级 env） |
| 0.79.4  | 自定义 provider 大写字面量不再被当环境变量引用（需显式 `$ENV_VAR`）（#5661）                      | 受益                                                          |
| 0.79.7  | 文档/运行时改用配置的 config dir 而非硬编码 `.pi`；`pi update` 默认只更自身                       | 受益                                                          |
| 0.79.10 | `pi update` 安装精确校验版本                                                                      | 受益                                                          |

---

## 引用

- 基线时间戳：npm registry packument `https://registry.npmjs.org/@earendil-works/pi-coding-agent`（`_npmOperationalInternal.tmp`：0.75.4 = 1779287056768、0.76.0 = 1779912237670）；单版本文档 `https://registry.npmjs.org/@earendil-works%2Fpi-coding-agent/0.76.0`。
- 变更清单：安装包 CHANGELOG（`/home/ubuntu/.local/share/pnpm/store/v11/links/@earendil-works/pi-coding-agent/0.80.3/.../node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md`），各条目附带的版本号与 issue/PR 编号即为原文引用（如 0.79.10 #5962、0.80.3 #6162、0.77.0 #5107/#5115、0.79.1 #4703、0.79.7 #5869/#5756、0.80.0 pi-ai compat 迁移说明）。
- 仓库归属：0.80.3 package.json `repository.url = git+https://github.com/earendil-works/pi.git`（目录 `packages/coding-agent`）；0.76.0 时代为 `earendil-works/pi-mono`。
- 项目用法盘点（只读）：`extension.ts`（before_agent_start / context / session_start / session_tree / tool_call / resources_discover）、`extensions/two-pass-render/index.ts`（agent_end、message_end、registerMessageRenderer、pi-ai `/compat` stream、ctx.isIdle、widget）、`extensions/compaction-policy/index.ts`（session_before_compact/session_compact）、`extensions/player-panel/index.ts`（registerCommand、ctx.ui.custom、DynamicBorder、getMarkdownTheme、pi-tui 组件）、`extensions/player-choices/index.ts`（turn_start、ctx.ui.setWidget）、`extensions/rewind/index.ts`（ctx.abort/waitForIdle、ctx.navigateTree、ctx.sessionManager.getBranch/getLeafId、ctx.ui.setEditorText）、`engine/core/backstage/backstage-spawn.ts` 与 `engine/core/showrunner/showrunner-spawn.ts`（`pi -p` + `--session-id`/`--no-approve`/`--no-tools`/`--no-extensions -e`/`--no-builtin-tools` 等）、`start.sh`（`--no-skills --skill -e --session-dir --no-context-files`、`PI_CODING_AGENT_DIR`）、`package.json`（pi 三件套均 `^0.80.3`）。

## Gaps

- 未逐条展开 0.76.0–0.80.3 间纯 provider/模型 metadata 修正（数百条，与 API 面无关）；如需按当前所用模型（DeepSeek V4 / FATE_RENDER_MODEL 指向的模型）筛选，可再做一轮针对性过滤。
- 0.80.0 承诺的 pi-ai compat 移除时间表与 `createModels()` 迁移指南尚未发布，two-pass-render 的迁移债无法在本轮给出具体改法；建议跟踪 pi 后续 release notes。
- `--name` 是否能与 `--session-id` 同时用于 `pi -p` 子进程未经实测验证（CHANGELOG 声称支持 print/JSON/RPC 模式），采用前应先在 spawn seam 上做一次冒烟测试。

---

## 勘误：two-pass-render 轮询替代方案调查（证伪，2026-07-09）

本报告结论摘要第 2 项曾推荐用 followUp 交付语义替代 `sendProseWhenIdle` 的 25ms×400 轮询。后续活体 spike + 源码阅读将其**证伪**：在 pi 0.80.3 的 API 面上，该轮询是结构性必需的。未来读到本报告的人不要重做这个实验。

### 假设与证据

| 假设                                                                                                                       | 结果      | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi.sendMessage(msg, {deliverAs:"followUp", triggerTurn:false})` 在 agent_end（仍 streaming）时可免等 idle、只追加不开新轮 | ❌ 证伪   | 活体：spike 子进程（`pi -p` + deepseek-v4-pro）中 custom message 交付后出现第二次完整 LLM 调用，其 thinking 明确在对 payload 做反应（自激振荡复现）。源码：`dist/core/agent-session.js` `sendCustomMessage()`——streaming 分支只有 `agent.followUp()` / `agent.steer()` 两条路，均进 agent 队列、drain 时继续 loop；`triggerTurn:false` 在 streaming 期被完全忽略。**streaming 期不存在 append-only 交付路径**。                                                                             |
| `ctx.waitForIdle()` 可把轮询改成事件驱动等待                                                                               | ❌ 不可行 | 活体：`TypeError: ctx.waitForIdle is not a function`。源码：`dist/core/extensions/runner.js`——`waitForIdle`/`navigateTree`/`fork` 等仅在 `createCommandContext()` 上装配（故 rewind 的 `/fuck` 命令能用），**事件 handler 拿到的裸 `createContext()` 没有它**。另：即使可用，在 agent_end handler 内 await 它会死锁（`pi-agent-core/dist/agent.js`：`waitForIdle()` 返回 `activeRun.promise`，在 `finishRun()` 才 resolve，而 finishRun 在 agent_end listeners settle 之后），必须 detach。 |
| 存在 idle 类事件可订阅                                                                                                     | ❌ 不存在 | 0.80.3 `types.d.ts` 全事件清单无 idle 事件；agent_end 触发时 `isStreaming` 仍为 true（finishRun 在后）。                                                                                                                                                                                                                                                                                                                                                                                    |

### 副产品发现

1. **现行代码潜伏 bug（未修，已知风险）**：`sendProseWhenIdle` 的 10s 放弃上限（`IDLE_POLL_MAX_ATTEMPTS`）意味着玩家抢跑且新结算轮超 10s 时（结算带工具调用，很容易超），canonical prose 会被静默丢弃只留告警。修复方向：去掉上限、改为持续等待（仅 session 关闭时停止）。2026-07-09 决定暂不修。
2. **可提 upstream feature request**（未提）：事件 ctx 补 `waitForIdle()`，或 `sendMessage` 补 streaming 期的 append-only 交付模式，或新增 idle 事件。任一被采纳后可彻底删轮询。

### 复现方法（如需重验）

一次性 extension（agent_end 里发 followUp custom message + 记日志），以 `PI_CODING_AGENT_DIR=.pi/agent pi -p --no-tools --no-approve --no-context-files --no-extensions -e <spike.ts> --model deepseek/deepseek-v4-pro --session-dir <tmp> --session-id <id> "Reply with exactly the word ok."` 运行，观察 turn_start 计数与 session jsonl 中 custom_message 后是否出现第二条 assistant 消息。
