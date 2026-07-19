# pi-taskflow 对 fate-sandbox 的适用性评估

## 结论

**不建议把 `pi-taskflow` 直接引入游戏 runtime，也不建议用它替换 backstage / showrunner 两条 engine-owned spawn seam。** 它解决的是“编程代理的通用多阶段 DAG 编排”，而本项目需要的是“携带 hidden-canonical 信息、不能写 canonical state、只能经领域 gate 回程”的两条窄通道。当前两条通道分别只有一次异步生成和一次同步审计；引入通用 DAG、脚本阶段、共享上下文、缓存和审批面，会扩大可达能力与维护面，却不能替代领域防火墙。项目对此已有明确决策：不依赖子代理框架，隔离必须由 spawn 现场结构性保证（`AGENTS.md:201-216`；`docs/adr/0005-thin-spawn-seam-over-subagent-framework.md:3-9`；`docs/adr/0007-showrunner-audit-on-engine-sync-spawn-seam.md:3-7`）。

**值得借鉴，但应在 engine 内按领域重做的部分：** durable run record、原子终态、不可变重试 lineage、显式 stale/projection hash、纯函数式离线重判，以及“无审批者即 fail-closed”。不要复用 Taskflow 的通用 `RunState` 作为 canonical game state，也不要复用其 child runner 作为安全边界。

本评估固定在官方包页所列 **`pi-taskflow@0.2.3`** 与 GitHub tag **`v0.2.3` / `b0a3c22058941f05d7ae3a4072e3721de9e24d5c`**；该 release 发布了 durable background runs、原子终态和加强后的 detached ownership。[Pi 官方包页](https://pi.dev/packages/pi-taskflow)；[GitHub v0.2.3 release](https://github.com/heggria/taskflow/releases/tag/v0.2.3)；[CHANGELOG 0.2.3](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/CHANGELOG.md#L5-L23)。

## 1. 直接采用

### 判定：游戏 runtime 中拒绝

| 维度       | pi-taskflow                                                                                                         | fate-sandbox 要求                                                                                                            | 判定                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 子进程     | 每个 agent phase 单独起 `pi --mode json -p --no-session`；默认 `resourceProfile: "isolated"` 会加 `--no-extensions` | backstage 必须零工具；showrunner 只能有 `lookup`；两者还必须禁 context files，showrunner 另禁 skills/templates/builtin tools | **隔离不等价**           |
| 状态权威   | 通用 flow 可运行 agent、`script`、共享 context、文件工作区                                                          | canonical state 只能由 engine 领域事件改变                                                                                   | **权限面过宽**           |
| 回程格式   | `output:"json"` + 小型 `expect` contract；解析器会从 fence 或前后 prose 中抽 JSON                                   | 领域 TypeBox schema gate，非法内容不得回流或落地                                                                             | **不能替换**             |
| 持久化     | project-local `.pi/taskflows/runs`，保存 phase output、run state、trace                                             | hidden transcript 必须进入 gitignored `.pi/agent/*-sessions`                                                                 | **默认落点不合格**       |
| 工作流形态 | 12 种 phase、DAG、fan-out、gate、loop、cache、resume/replay/recompute                                               | 当前是两个窄的一次调用 seam                                                                                                  | **明显过度建模**         |
| 依赖       | Pi extension `pi-taskflow` 依赖 `taskflow-core`，并注册模型可调用工具和 skill                                       | 当前 runtime 已硬切子代理框架                                                                                                | **扩大 runtime surface** |

来源：Taskflow 的 phase/运行保证见[官方 README](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/README.md#L211-L244)；包依赖与 Pi extension 注册见[`packages/pi-taskflow/package.json:46-64`](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/package.json#L46-L64)。本项目现状见 `engine/core/backstage/backstage-spawn.ts:34-63`、`engine/core/showrunner/showrunner-spawn.ts:30-99`、`package.json:49-75`。

### 为什么不能只“配成安全模式”

1. **Taskflow 的 `isolated` 只收掉 ambient extensions，不是本项目的 hermetic contract。** Pi runner 的实际 argv 是 `--mode json -p --no-session`，非 `inherit` 时追加 `--no-extensions`；它没有追加 `--no-context-files`、`--no-approve`、`--no-skills`、`--no-prompt-templates` 或 `--no-builtin-tools`。如果 phase/agent 未声明 `tools`，也不会传工具白名单。它还使用 `--append-system-prompt`，而 showrunner 要求 `--system-prompt` replace semantics。[runner 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/src/runner.ts#L297-L379)。本项目固定 flags 见 `engine/core/backstage/backstage-spawn.ts:34-45`、`engine/core/showrunner/showrunner-spawn.ts:30-48`，不变量见 `AGENTS.md:210-215`。

2. **host 配置可以恢复 ambient inheritance。** `PiChildSettings.resourceProfile` 有 `isolated | allowlist | inherit`，默认虽为 `isolated`，但 `inherit` 是受支持配置；flow 本身不能扩权是优点，却仍不满足“每次 spawn 现场固定死”的项目要求。[配置源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/agents.ts#L12-L28)；[官方 README](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/README.md#L257-L278)。本项目要求见 `docs/adr/0005-thin-spawn-seam-over-subagent-framework.md:7`。

3. **工具/工作区隔离不能充当 canonical-state firewall。** Taskflow agent 的 `tools` 省略时默认全部工具，phase 还能声明 `script`；workspace isolation 还是 opt-in，而且分配失败会 fail-open 回到 `baseCwd`。官方文档明确把 workspace 当“增强而非正确性要求”。[agent 工具文档](https://heggria.github.io/taskflow/zh-cn/docs/guides/agents-and-model-roles)；[phase 字段文档](https://heggria.github.io/taskflow/zh-cn/docs/syntax/phase-types)；[workspace fail-open 文档](https://heggria.github.io/taskflow/zh-cn/docs/concepts/workspace-isolation)；对应源码文档行见[`agents-and-model-roles.mdx:239-247`](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/guides/agents-and-model-roles.mdx#L239-L247)、[`workspace-isolation.mdx:101-121`](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/concepts/workspace-isolation.mdx#L101-L121)。本项目规定工具是领域事件、engine 是状态权威，见 `AGENTS.md:132-146`、`docs/adr/0001-split-public-and-secret-game-state.md:1-3`、`docs/adr/0003-engine-enforced-ledgers.md:3-15`。

4. **安装会重新向主 GM 暴露一个通用编排入口。** `pi-taskflow` 注册模型可调用的 `taskflow` 工具，prompt guideline 明示“Use taskflow for ALL delegation”并“replaces the subagent tool”。这与 ADR 0007 删除旧入口、避免继续教模型走框架的 hard-cut 理由正面冲突。[注册源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/src/index.ts#L720-L741)；本地依据 `docs/adr/0007-showrunner-audit-on-engine-sync-spawn-seam.md:3-5`、`AGENTS.md:29-42`。

### 唯一可接受的“直接使用”范围

可把它当作**开发者个人的 repo 审计/迁移工具**，运行在独立 Pi 配置与不含 campaign secrets 的输入上；不要由游戏启动脚本加载，不要注册给 GM，不要进入 release，不要把 backstage/showrunner prompt 或 session 交给它。这个范围符合它“编程代理 DAG”的官方定位，却不属于游戏 runtime adoption。[官方定位与安装](https://pi.dev/packages/pi-taskflow)；本项目 release/privacy 边界见 `AGENTS.md:220-230`。

## 2. 可选择性借鉴的架构思想

### A. Engine-owned durable run record

Taskflow 会先持久化 `RunState`，每 phase 完成后原子更新，并把 `finalOutput` 与终态一起写入；异常 detached exit 会落一个可审计的 `__detach__` failure。这个设计可用于补强 backstage 当前“pending marker + 扫 session 文件”的可观测性。[后台运行文档](https://heggria.github.io/taskflow/zh-cn/docs/compiler-runtime/background-runs)；[文档源码行 35-53、78-96](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/compiler-runtime/background-runs.mdx#L35-L53)；[v0.2.3 原子终态](https://github.com/heggria/taskflow/releases/tag/v0.2.3)。

建议只在本项目 engine 内新增窄的 `BackstageRunRecord`（如 `spawned/running/completed/failed/harvested/rejected/landed`、pid、lineId、spawn state revision、output digest、failure summary），继续让 candidate 与 canonical event 分离。当前 marker 只有 `{runId,lineId,spawnedAt}`，见 `engine/core/backstage/backstage-state-schema.ts:67-71`、`engine/core/backstage/backstage-pending.ts:19-43`；当前读取依赖 session 文件名扫描，见 `engine/core/backstage/backstage-session-read.ts:60-84`、`docs/adr/0006-pending-harvest-guard.md:3-20`。若进入 Game State，必须按本项目规则 bump schema 并做逐版本 migration（`AGENTS.md:29-38`）。

### B. 不可变重试 lineage，而不是原地“续跑”

Taskflow 0.2.2 起，resume 只接受 `failed/paused`，创建带 `parentRunId` 的新 run，保留原 run 不变，并只复用不受影响的已完成 phase。[release 变更](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/CHANGELOG.md#L25-L40)；[resume 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/resume.ts#L1-L18)。

可借鉴为：director/showrunner 重试总是新 `runId`，记录 `supersedesRunId`/`retryOf`，旧输出保持审计可见但永不自动落地。showrunner 仍应维持“零 engine retry，由 GM 决定是否重调”，见 `engine/core/showrunner/showrunner-audit.ts:1-8,39-74`、`tools/settlement/run-showrunner-audit.ts:104-110`；不能把 Taskflow resume 变成自动通过或自动回写 canon。

### C. Spawn-time projection hash 与 harvest-time stale 检查

Taskflow 以 resolved input hash、声明/观测依赖和 stale frontier 判断哪些结果还能复用；真实 recompute 默认 dry-run，遇到未观测依赖会拒绝 apply。[resume 文档](https://heggria.github.io/taskflow/zh-cn/docs/concepts/resume)；[增量重算文档](https://heggria.github.io/taskflow/zh-cn/docs/compiler-runtime/incremental-recompute)；[安全守卫源码文档行 232-252](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/compiler-runtime/incremental-recompute.mdx#L232-L252)。

可借鉴为：spawn 时记录 `stateRevision`、`projectionHash`、`timeWindow`；harvest 时若 canonical clock、line state 或相关 actor/faction facet 已变化，则把 candidate 标为 stale，要求重新生成或显式复核。不要直接采用跨运行缓存：Fate 的后台候选和题材审计是 freshness-sensitive judgment，且 canonical truth 仍由领域 state 决定（`docs/adr/0003-engine-enforced-ledgers.md:11-17`）。

### D. 把 replay 限定为“确定性决策重判”

Taskflow 的 replay 不重跑模型；它只重新 fold 已记录事件，在新 gate threshold/budget 下做 what-if，模型/args 改动会报告 `needs-live-rerun`。[确定性 replay 文档](https://heggria.github.io/taskflow/zh-cn/docs/compiler-runtime/deterministic-replay)；[replay 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/replay.ts#L1-L15) 与 [`replayRun` 契约](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/replay.ts#L160-L170)。

本项目若增加 replay，应只重放确定性部分：schema validation、pending/obligation ledger 转移、candidate 是否 stale、某 verdict 是否满足机械 gate；绝不声称能重放或复现 LLM 叙事。现有 Session Log 已承担 audit/rewind/repair，Game State 才是事实权威，见 `docs/adr/0008-separate-session-log-from-settlement-working-set.md:3-17`。

### E. 无审批者时 fail-closed

Taskflow 的 detached/headless `approval` 没有 callback 时自动 reject，并产生 blocking gate，而不是自动批准。[approval 文档](https://heggria.github.io/taskflow/zh-cn/docs/compiler-runtime/background-runs)；[approval 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/runtime/phases/approval.ts#L19-L43)。

这可作为通用原则，但不能替换本项目的 reviewed-before-landing：backstage 的“审批者”是 harvest 后的 GM 审查与领域落地工具，不是 TUI 人工按钮；未 harvest 时 engine 已拒绝关闭义务，见 `engine/core/backstage/backstage-pending.ts:59-89`、`tools/settlement/harvest-backstage-candidate.ts:25-46`。showrunner 只返回审计意见且无 canonical write authority，因此只需失败不算通过（`engine/core/showrunner/showrunner-audit.ts:20-29,47-74`）。

### F. Host authority 不能由 flow 数据铸造

Taskflow 把 Pi child resource profile 放在 host settings 而非 flow DSL，并在 child env 中删除 resolve-only/reconcile 扩权变量；其 authority 模型要求 host allowlist 与 grant principal 双向同意。[Pi child 配置源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/agents.ts#L14-L28)；[runner env 收窄](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/src/runner.ts#L345-L369)；[authority 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/resources/authority.ts#L82-L108)。

可借鉴为本项目测试不变量：任何 GM/tool 参数都不能扩大 child tools、extension list、session root 或 state projection。当前项目已经更强地把这些写死在 engine spawn argv（`engine/core/backstage/backstage-spawn.ts:34-63`；`engine/core/showrunner/showrunner-spawn.ts:30-99`），应保留这一方向。

## 3. 关键不匹配与风险

### Bare JSON 与 schema gate

Taskflow 确实提供执行期 `expect`：JSON shape 不符会让 phase 失败并可进入显式 retry；但 contract 只支持 `type/properties/required/items/enum`，不表达本项目已经使用的 `minLength`、更细的领域 enum 与完整嵌套 TypeBox 约束。[contract 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/contract.ts#L1-L24)；[runtime gate](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/runtime.ts#L1694-L1706)。同时 `safeParse` 会接受 fenced JSON 或从 prose 中截取第一个平衡对象，因此它不保证字节级 bare JSON。[解析源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/interpolate.ts#L164-L208)。

本项目必须保留 compiled TypeBox 回程 gate：`engine/core/backstage/parallel-line-output-schema.ts:17-58`、`engine/core/showrunner/showrunner-output-schema.ts:19-75`，showrunner 失败只返回字段错误而不回流 raw（`engine/core/showrunner/showrunner-audit.ts:64-74`）。另需注意：本项目两个 `parseRawJson` 当前也会截取首尾 `{}`，所以“bare”本身仍不是字节级强制；见 `engine/core/backstage/parallel-line-output-schema.ts:61-72`、`engine/core/showrunner/showrunner-output-schema.ts:77-88`。这应单独收紧本地 parser，而不是换成更宽松的 Taskflow parser。

### Secrets-at-rest 与 context leakage

Taskflow 的“context isolation”是**不把中间输出自动塞回 host conversation**，不是保密存储：phase output、失败尝试与 trace 会落盘，`peek/trace` 可显式取回；trace 还记录 resolved task 与完整输出。[上下文隔离文档](https://heggria.github.io/taskflow/zh-cn/docs/concepts/context-isolation)；[文档源码行 22-38、60-77](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/concepts/context-isolation.mdx#L22-L38)；[trace 内容](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/compiler-runtime/deterministic-replay.mdx#L16-L24)。

更关键的是 project runs 固定在最近 `.pi/taskflows/runs`；本仓库 `.gitignore` 只忽略 `.pi/agent/` 与 `.pi/npm/`，没有忽略 `.pi/taskflows/`。[store 路径源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/store.ts#L1019-L1038) 与 [`runsDir`](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/store.ts#L1268-L1275)；本地 `.gitignore:1-9`。当前 backstage/showrunner session 刻意放在 gitignored `.pi/agent/*-sessions`，见 `engine/core/backstage/backstage-substrate-config.ts:20-29`、`engine/core/showrunner/showrunner-substrate-config.ts:8-15`。因此让 Taskflow 接收 `privateFacts` 或 Showrunner Projection 会直接制造新的 secrets-at-rest 风险。

共享上下文树也是有意打开的隔离口：它给 child `ctx_read/write/report/spawn`，并由 env 指向共享 blackboard。[官方文档](https://heggria.github.io/taskflow/zh-cn/docs/concepts/context-isolation)；[runner 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/src/runner.ts#L53-L86)。本项目两条 hermetic seam 都不应启用此能力；showrunner 的投影必须由父进程一次性内嵌，见 `engine/core/showrunner/showrunner-context-block.ts:1-21`、`engine/core/showrunner/showrunner-prompt.ts:1-46`。

### Persist / resume / recompute 的语义错位

Taskflow 的缓存正确性围绕 phase resolved input hash、文件/git/env fingerprint 与 DAG 依赖；跨运行缓存还明确要求 opt-in。[resume 文档](https://heggria.github.io/taskflow/zh-cn/docs/concepts/resume)；[官方 README](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/README.md#L234-L244)。Fate 的 canonical world 每个 turn 都推进，hidden facts、NPC agenda 和 offscreen consequences 不是普通构建输入；一个旧 candidate 即使 prompt 文本 hash 相同，也不因此仍可落地。故只能借鉴 provenance/stale 机制，不能缓存审计 verdict、后台行动或 canonical event。

Taskflow `RunState.schemaVersion` 当前仍是 v1，旧字段以 optional/tolerant 方式兼容，并未展示本项目要求的线性 persisted-state migration chain。[build-info 源码](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/taskflow-core/src/build-info.ts#L21-L25)；本项目 migration 规则 `AGENTS.md:29-38`。因此也不应把 upstream `RunState` 嵌入 Game State；应定义窄领域 schema 并按本项目规则迁移。

### Approval 的责任主体不同

Taskflow approval 是人工 TUI checkpoint；detached 模式无人工 callback，必然 auto-reject。[phase 文档](https://heggria.github.io/taskflow/zh-cn/docs/syntax/phase-types)；[对应源码文档行 265-284](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/website/content/docs/zh-cn/syntax/phase-types.mdx#L265-L284)。backstage 的 review 是 GM 对 hidden candidate 的领域审查，最终 authority 是 `record_offscreen_event`/`resolve_backstage_line`；showrunner 则根本没有写 canon 的能力。把两者映射成 Taskflow approval 会引入错误的“人点了按钮即可授权”语义，绕开现有 ledger 与工具边界（`tools/settlement/harvest-backstage-candidate.ts:49-67`；`docs/adr/0006-pending-harvest-guard.md:11-20`）。

### Runtime 依赖与版本风险

`pi-taskflow@0.2.3` 要求 Node `>=22.19.0`，与本项目 Node `>=24` 兼容；它只声明一个直接 runtime dependency `taskflow-core`，Pi SDK/TypeBox 为 wildcard peers。[package manifest](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/packages/pi-taskflow/package.json#L29-L64)；本地 `package.json:49-75`。但 wildcard peers 不锁定本项目使用的 Pi API 版本，而 0.2.2 刚出现 resume/reduce breaking changes，说明该通用 surface 仍在快速演进。[v0.2.2 release notes](https://github.com/heggria/taskflow/blob/b0a3c22058941f05d7ae3a4072e3721de9e24d5c/CHANGELOG.md#L25-L40)。对仅有两个窄调用点的游戏 runtime，这个维护成本没有对应收益。

## 建议

1. **维持现状：** backstage/showrunner 继续由 engine 直接 spawn，保留固定 flags、父侧 projection、独立 gitignored session、领域 schema gate 和 failure-loud 行为（`AGENTS.md:201-216`）。
2. **若要增强可靠性，先做窄 run ledger：** 为 backstage 增加 engine-owned run status、终态、failure、lineage 与 spawn projection hash；不要注册通用 orchestration tool。依据是当前 pending ledger 的可观测性缺口，而不是需要 DAG（`docs/adr/0006-pending-harvest-guard.md:3-20`）。
3. **resume 只做“新 run 重试”，replay 只做确定性重判，recompute 只做 stale 分析；** 三者都不得自动落地 candidate 或覆写 canon。
4. **继续使用本地 TypeBox gate，并单独收紧 bare-JSON parser；** 不采用 Taskflow 的 lenient `safeParse`/小型 `expect` 作为回程防火墙。
5. **若开发者个人试用 Taskflow，使用独立配置与无 secrets 的 cwd；** 不把它加入游戏依赖、`.pi/settings.json`、启动脚本或发布包。
