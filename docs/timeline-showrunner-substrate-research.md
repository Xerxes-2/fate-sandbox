# timeline-showrunner 底座调研：pi-subagents vs 引擎自有 spawn seam

日期：2026-07-09。方法：只读一手源码取证；所有事实性断言附 `path:line` 引用。

## 研究问题

审计子代理 `timeline-showrunner` 目前跑在 `pi-subagents` extension 上。评估：

1. 现状实现是否合理？它实际消费了 pi-subagents 的哪些能力？
2. 有没有更简单的做法？
3. 能否彻底脱离 pi-subagents？最小实现是什么、代价是什么？

---

## 一、现状取证

### 1.1 子代理定义与调用链

- Agent 定义：`.pi/agents/timeline-showrunner.md:1-8` frontmatter 声明 `tools: lookup`、`extensions: extensions/subagents/timeline/index.ts`、`inheritProjectContext: false`、`inheritSkills: false`、`systemPromptMode: replace`。正文是 141 行的审计 persona（输入/输出契约、10 条 timeline profile、13 步审计流程、审计纪律）。
- **谁调用**：主 GM 模型在结算回合中经 pi-subagents 注册的 `subagent` 工具调用（模型自主决定，不是引擎触发）。触发条件写在 prompt 层：`prompts/settlement/tool-policy.md:49`（"Call `timeline-showrunner` when timeline tone drifts, a beat spins in place, ..."）与 `prompts/settlement/story-driver.md:30`（"If tool policy says `timeline-showrunner` ... run that check before ending the turn"）。引擎中不存在任何 showrunner 触发器或 verdict 消费者——grep `TimelineShowrunnerOutput|driftLevel|hookLedger|requiredCorrections` 在 `*.ts` 中零命中；engine 侧唯一提及是 `engine/core/memory/hooks.ts:7` 的注释（hook 账本"供 timeline-showrunner 对账"）。
- **是否同步**：是。pi-subagents 前台单次执行以 `pi --mode json -p` 子进程运行（`.pi/npm/node_modules/pi-subagents/src/runs/foreground/execution.ts:191`），父进程 await 子进程退出（`execution.ts:290`），把最终 assistant 输出取回（`getFinalOutput(result.messages)`，`execution.ts:565,882`）作为 `subagent` 工具结果返回给调用模型。即 GM 的当前 turn 阻塞等待审计 JSON。
- **verdict 如何消费**：纯 prompt 层。JSON verdict 作为工具结果回到 GM 上下文，GM 自行解读执行；**没有引擎侧 schema 校验或 return-trip gate**（对比 backstage 的 `parseParallelLineOutput` 验收，`docs/adr/0005` 第 1 段）。注意输出契约本身是"下一回合导向"的：`.pi/agents/timeline-showrunner.md`（Audit discipline 节）"When `verdict=fail`, `requiredCorrections` must say what the main GM must do **next turn**"——同步取回，但矫正动作大多落在下一回合。
- **上下文注入**：主进程 `extension.ts:76-92` 挂 `tool_call` hook，当 `event.toolName === "subagent"` 时就地改写工具入参，把 `buildTimelineStateContextBlock(exportState())` 追加进 task。注入逻辑 `extensions/subagents/timeline/task-injection.ts:46-113` 覆盖 pi-subagents 的三种输入形态（SINGLE `agent/task`、PARALLEL `tasks[]`、CHAIN 的顺序步骤/静态 parallel/动态 expand 模板），并保住 chain 缺省 task 的 `{previous}` 语义（`task-injection.ts:25`）。测试：`tests/timeline-task-injection.test.ts:12-73`。
- **上下文块内容**：`engine/core/state/state-file-projection.ts:90-139` 的投影。注意它**不是纯玩家可见事实**：包含 `secrets.offscreenEventLog` 末 6 条摘要（`state-file-projection.ts:98,110-112`）与 `secrets.actorStates` 的 agenda/knowledgeLens 面（`state-file-projection.ts:103-105`），但过滤掉 `actorSecrets/secretEventLog/campaignSecrets` 原文（测试断言 `tests/timeline-task-injection.test.ts:82`）。showrunner 是"半特权"审计员：拿 hidden-canonical 的摘要层，不拿 secret 原文。

### 1.2 `lookup` 从哪来；裸 `pi` 子进程会不会有它

`lookup` 是**项目自有代码**，与 `pi-web-access` 无关：实现在 `tools/lookup/lookup.ts:9-13`（查 `engine/world-data/lookup.ts` 本地索引）。它在两处注册：

- 主 GM 进程：`tools/registry.ts:9,67`（`registerAllTools` 经 `extension.ts:95`）。
- showrunner 子进程：timeline extension 自己重注册一份（`extensions/subagents/timeline/index.ts:17-28`）。

所以：**裸 `pi -p` 子进程默认没有 `lookup`**——除非（a）不加 `--no-extensions`，让它加载整个项目 `extension.ts`（那会连全部结算工具和 GM prompt 注入一起装上，不可接受）；或（b）显式 `-e extensions/subagents/timeline/index.ts` 只装 timeline extension。方案 (b) 正是 pi-subagents 现在替我们做的事（见 1.3）。

### 1.3 showrunner 路径实际消费的 pi-subagents 能力

pi-subagents（v0.34.0，`.pi/npm/node_modules/pi-subagents/package.json:3`）src 共 92 个 `.ts` 文件、38,813 行。showrunner 单次前台运行实际走的翻译层：

- 项目作用域 agent 发现 + frontmatter 解析（`src/agents/agents.ts`、`src/agents/frontmatter.ts`；README "Agent locations" 表：Project = `.pi/agents/**/*.md`）。
- argv 组装 `src/runs/shared/pi-args.ts`：
  - `tools: lookup` → `--tools lookup`（非路径条目按 builtin 允许清单转发，`pi-args.ts:120-137`）；
  - `extensions: <path>` → `--no-extensions` + `--extension <prompt-runtime>` + `--extension extensions/subagents/timeline/index.ts`（`pi-args.ts:144-149`）；
  - `inheritSkills: false` → `--no-skills`（`pi-args.ts:155-157`）；
  - `systemPromptMode: replace` → persona 写临时文件后 `--system-prompt <file>`（`pi-args.ts:160-166`）；
  - task 以 `Task: ...` 参数传入，>8000 字符落临时文件（`pi-args.ts:12,169-177`）；
  - 无 session 目标时 `--no-session`（`pi-args.ts:105-108`；`execution.ts:1039`）。
- 子进程内固定注入的 prompt-runtime extension（`src/runs/shared/subagent-prompt-runtime.ts`）：child 边界指令、按 `PI_SUBAGENT_INHERIT_PROJECT_CONTEXT=0` 剥离系统提示里的 "# Project Context" 段（`subagent-prompt-runtime.ts:11,51`）。
- 前台阻塞执行 + 超时处理 + 最终输出回填工具结果（`execution.ts:91-99`（timeout）、`execution.ts:354-381`（final-stop 宽限强杀）、`execution.ts:565,882`）。

**没有用到的**：chains、parallel、动态 fanout、async/background、artifacts/run registry、TUI clarify UI、fleet/status、intercom/supervisor channel、profiles、modelScope、per-agent memory、worktrees、acceptance、RPC、嵌套 fanout 深度控制——即 README 的绝大部分。按模块行数粗估，showrunner 路径触碰的代码 ≈ 3-5K 行，**约占框架的 10%**，与 ADR 0005 对其它候选框架的判语（"using ~5% of the framework and fighting the other 95%"）同量级。讽刺的是 `task-injection.ts` 还必须为没用到的 PARALLEL/CHAIN 形态写防御性覆盖（`task-injection.ts:46-113` 及其 84 行测试），因为无法阻止 GM 模型用那些形态调用。

### 1.4 裸 `pi` CLI 能力核对（`pi --help` 实测输出）

| 需求 | 裸 `pi -p` 能否满足 | 依据 |
| --- | --- | --- |
| (i) 只加载 timeline extension | ✅ `--no-extensions -e extensions/subagents/timeline/index.ts` | `--extension, -e` / `--no-extensions, -ne`（help 输出；pi-subagents 自己就是这么拼的，`pi-args.ts:144-149`） |
| (ii) 只有 `lookup` 工具 | ✅ `--no-builtin-tools`（保留 extension 工具）或 `--tools lookup` | `--no-builtin-tools, -nbt` / `--tools, -t`（help 输出） |
| (iii) 同步返回 | ✅ 父进程 spawn（不 detach）等 exit；产物读 stdout（`--mode json` 结构化事件）或 session jsonl（引擎已有 `extractLastAssistantText`，`engine/core/backstage/backstage-session-read.ts:25-40`） | help 输出 + backstage 既有代码 |
| 独立 persona | ✅ `--system-prompt <file>` | help 输出 |
| 不吸项目上下文 | ✅ `--no-context-files --no-skills --no-prompt-templates` | help 输出 |
| session 落点控制 | ✅ `--session-dir` + `--session-id`（或 `--no-session`） | help 输出；backstage 同款（`engine/core/backstage/backstage-spawn.ts:36-49`） |
| 模型钉住 | ✅ `--model`（当前 backstage 选择继承默认主模型，ADR 0005 Amendment） | help 输出 |

结论：**showrunner 对 pi-subagents 的全部消费，裸 `pi` CLI 一比一都有对应 flag**；pi-subagents 在这条路径上是一个 argv 翻译器 + 阻塞等待器 + 输出取回器。

### 1.5 与 backstage 先例的三点结构差异（逐条对源核实）

任务书列的三条差异，核实结果：

- **(a) 防火墙理由不同 — 部分成立**。backstage 子进程按设计吃全量 `privateFacts`（ADR 0005 第 3 段"the firewall is not 'the subagent has no secrets'"）；showrunner 的输入是 secrets 过滤后的投影，但**并非纯玩家可见**——含 offscreen 事件摘要与 actor agenda/knowledgeLens（`state-file-projection.ts:98,103-105`），属于 hidden-canonical 的摘要层。所以 showrunner 的隔离诉求弱于 backstage（无 secrets-at-rest 全量泄漏面），但其 transcript 也不是可以随便进玩家可读渠道的东西。
- **(b) 同步 vs 异步 — 成立，但强度低于表述**。backstage 是 detached+unref、隔轮 harvest（`backstage-spawn.ts:59-66`；`tools/settlement/run-parallel-line.ts:38-47`）；showrunner 是前台阻塞工具调用、当回合取回（`execution.ts:191,290`）。但 verdict 的矫正指令本身面向"next turn"（`.pi/agents/timeline-showrunner.md` Audit discipline），story-driver 要求在"回合收尾前"跑检查（`story-driver.md:30`）——即"同回合必须消费"是当前实现形态，不是领域硬需求；异步+隔轮催账（backstage obligation 模式，`prompts/settlement/tool-policy.md:57-63`）在领域上也自洽，只是矫正延迟一拍。
- **(c) `--no-tools` vs `lookup` — 成立**。backstage 子进程零工具（`backstage-spawn.ts:38`）；showrunner 需要 `lookup`（`.pi/agents/timeline-showrunner.md:4`，persona 明示 lookup 是仅有的三个信息源之一，`:54`）。这意味着 showrunner 的 spawn seam 不能照抄 `--no-tools`，要 `-e timeline-ext --no-builtin-tools`。

另有一条重要背景：`context.md:88` 记录过一次 pi API 调查——**领域工具的 `execute` 拿不到 agent-spawn 官方 API，`subagent` 能力本身是模型调用的工具**。这只封死了"引擎经 pi-subagents 同步起子代理"这条路；引擎自己 `child_process.spawn("pi",...)` 不受此限（backstage 已在 `run_parallel_line` 的 execute 里 spawn，`tools/settlement/run-parallel-line.ts:41`）；同步版只是不 detach、await exit 而已。

---

## 二、能力矩阵

| 能力 | showrunner 是否用 | pi-subagents 提供方式 | 裸 `pi -p` + 引擎 seam 对应物 |
| --- | --- | --- | --- |
| project-scope agent 发现 | ✅ | `.pi/agents/**/*.md` 扫描 + frontmatter | 不需要：persona 收进 engine（同 `backstage-director-persona.ts`）或引擎读 md 文件 |
| 工具白名单（仅 lookup） | ✅ | frontmatter `tools` → `--tools lookup`（`pi-args.ts:120-137`） | `--no-builtin-tools` + timeline extension（或 `--tools lookup`） |
| 按 agent 加载 extension | ✅ | frontmatter `extensions` → `--no-extensions -e ...`（`pi-args.ts:144-149`） | 同款 flag，引擎直接拼 |
| systemPromptMode replace | ✅ | persona 落 tmp 文件 → `--system-prompt`（`pi-args.ts:160-166`） | `--system-prompt <file>` 或 prompt 全文作为 `-p` 输入 |
| 剥项目上下文/skills | ✅ | prompt-runtime extension + `--no-skills`（`subagent-prompt-runtime.ts:11,51`） | `--no-context-files --no-skills` |
| 同步阻塞 + 结果回填模型回合 | ✅ | 前台执行器（`execution.ts:191,290,565`） | spawn 不 detach + await exit + 读 session jsonl（`backstage-session-read.ts:25` 已有解析器） |
| 超时/挂死子进程处理 | ✅（隐性受益） | `execution.ts:91-99,354-381` | **需自己写**（~30 行：timeout + kill） |
| 输出 JSON schema 校验 | ❌（当前没有任何校验） | 有 `outputSchema` 能力但未启用 | 引擎 return-trip gate（同 `parallel-line-output-schema.ts` 模式）——**迁移反而补上这道防线** |
| 模型覆盖/fallback（agentOverrides） | ❌（未配置） | settings `subagents.*` | `--model`（如需） |
| chains/parallel/async/TUI/artifacts/intercom/RPC | ❌ | 框架主体 | 不需要 |
| task 注入面（防 3 种输入形态） | ✅（被迫） | `tool_call` hook 改写 `subagent` 入参（`extension.ts:76-92`；`task-injection.ts:46-113`） | 消失：引擎在拼 prompt 时直接嵌上下文块，单一形态 |

---

## 三、方案比较

### A. 维持现状（pi-subagents）

- **成本**：0 新代码。但持续负债：`task-injection.ts`（113 行 + 84 行测试）本质是在**追踪 pi-subagents 的工具入参 schema**——上游改 SINGLE/PARALLEL/CHAIN 形态，注入静默失效（注入失败被 catch 吞掉、不阻断调用，`extension.ts:87-90`，此时子代理按"缺上下文"契约降级，`.pi/agents/timeline-showrunner.md:54`）。这是一条跨版本的隐式契约。
- **不变量**：read-only 靠 `tools: lookup` 白名单结构性成立（child 连 `read` 都没有——`pi-args.ts:121-123` 只在有 skills 时强加 `read`，此处 `inheritSkills: false`）；**executable-JSON-only 只有 prompt 约束，无引擎 gate**；独立性靠 `systemPromptMode: replace` + fresh context 成立。
- **"移除是否真是收益"**：pi-subagents 同时是本仓库**开发期**编排工具（本次调研即经它运行，见 `.pi-subagents/artifacts/`），从 repo 移除不现实。收益应准确表述为：**游戏运行时路径与它解耦**——`.pi/settings.json:2` 的 packages 是发布给玩家的安装清单，若运行时不再需要，玩家安装面可少一个 38K 行外部依赖；且 `tool_call` hook 的入参形态耦合消失。
- **LoC**：维持 113+84 行注入层 + 141 行 agent md + hook 块。

### B. 引擎自有同步 spawn seam（backstage 模式改阻塞）——推荐

新领域工具 `run_showrunner_audit`（名字示意）：

1. GM 模型仍在 tool-policy 触发点调用它（**WHO/WHEN 不变**：今天决定何时审计的就是 GM 模型，`tool-policy.md:49`、`story-driver.md:30`；引擎没有触发器）。所以 B 不改结算流结构——它只是把"prompt 组装、上下文注入、输出校验"从 pi-subagents + tool_call hook 搬进引擎。
2. execute 内：`buildShowrunnerPrompt(state, input)` = persona（从 `.pi/agents/timeline-showrunner.md` 收编为 `engine/core/showrunner/showrunner-persona.ts`，同 `backstage-director-persona.ts` 先例）+ GM 传入的 `TimelineShowrunnerInput` JSON + 引擎侧直接内嵌 `<timeline_state_context>`（复用 `buildTimelineStateContextBlock`，`task-injection.ts:27-44`——注入不再需要猜工具入参形态）。
3. `spawn("pi", ["-p","--no-extensions","-e","extensions/subagents/timeline/index.ts","--no-builtin-tools","--no-context-files","--no-skills","--session-dir",SHOWRUNNER_SESSION_DIR,"--session-id",runId,"--system-prompt",personaFile, prompt])`，**不 detach**，await exit（带 timeout+kill）。
4. 读 session jsonl 的最后 assistant 文本（复用 `extractLastAssistantText`，`backstage-session-read.ts:25`），过 TypeBox `TimelineShowrunnerOutput` schema 校验（新文件，模式同 `parallel-line-output-schema.ts`，73 行先例），校验通过才把 verdict 作为工具结果返回 GM。**这给 executable-JSON-only 不变量补上今天缺失的引擎 gate。**

- **收益**：删除 `task-injection.ts` + 测试 + `extension.ts:76-92` hook 块；运行时零 pi-subagents 依赖；输出契约从 prompt 防线升级为 schema 防线（符合宪章"Prompt 不是防线"）；child flags 显式可审计；session 落点自控（放 gitignored 目录，容纳投影里的 hidden-canonical 摘要）。
- **成本**：自己扛 timeout/挂死/spawn 失败诊断（backstage 用 per-run spawn log 解决，`backstage-spawn.ts:55-60`，可照搬）；工具 execute 阻塞 1-3 分钟（与今天前台 subagent 调用的体验等价，不是新增代价）；persona 从"玩家可直接编辑的 md"变成引擎源码（或保留 md、引擎读文件——发布打包需确认包含）；放弃 pi-subagents 的 UI 进度流与 agentOverrides 模型配置（当前均未使用）。
- **LoC 估算**：+persona 收编 ~140；+spawn/wait/read seam ~120（backstage-spawn 76 行 + wait/timeout ~40）；+输出 schema ~80；+工具注册 ~60；+测试（fake-spawn seam 先例已有，`backstage-spawn.ts:70-73`）~120。−task-injection 113 −测试 84 −hook 块 ~15 −agent md 141。**净增约 +350 行引擎代码，换掉运行时 38K 行外部依赖。**
- **变体 B2（引擎决定 WHEN）**：仿 backstage obligation（`context.md:87` / `tool-policy.md:57-63`）让引擎按漂移信号强制审计。这改变结算流、且"漂移"不像"≥30 分钟推进"那样可机械判定——**超出本题范围，不建议与迁移捆绑**；B1 落地后它只是这条缝上的增量。
- **变体 B-async**：完全照抄 backstage（detached + 隔轮 harvest + pending 催账）。领域上可行（verdict 本就 next-turn 导向，见 1.5(b)），且复用面最大；代价是矫正延迟一拍、GM 需两步操作。若 B1 的阻塞时长实测不可接受，这是现成退路。

### C. 内联审计（rubric 并入结算 prompt）

否决。三重代价均直击要害：

1. **prompt 预算**：141 行 rubric（10 个 timeline profile + 13 步流程）进每回合结算上下文，而它只在漂移嫌疑时才需要。
2. **独立性丧失**：persona 的核心指令是"Do not make excuses for path dependency"（`.pi/agents/timeline-showrunner.md:13`）——审计员的价值恰恰在于**没有** GM 的生成路径依赖；让 GM 自审等于让被审计者写审计报告。
3. 违背宪章分层（`AGENTS.md`：prompt 模块分工、"不要把所有规则塞进 system 层"）。

### D. 确定性引擎对账 + 更小的 LLM 审计（补充项，非替代）

rubric 的机械部分已经或可以下沉为引擎不变量，源码证据：

- hook 计数/状态机已是领域对象：`public.hooks: HookState[]`，active+escalated ≤2 硬不变量、surface/escalate 强制 novelty、终态留账（`engine/core/memory/hooks.ts:10-31`；`docs/system-potential-backlog.md:39`）。审计步骤 2-7（hookLedger）大半可从 state 对账而非让 LLM 从 recentBeats 里"数"。
- "连续两轮无代价"已有引擎判定：backstage obligation 的 no-cost 触发器（`context.md:87`）。审计步骤 10 可直接读账。
- 时间/UTC 检查（步骤 12）是纯格式校验，engine 已在 offscreen 落地处强制（`context.md:80`）。

剩给 LLM 的是真正需要判断力的部分：题材契约、玩家优先级、NPC 主动性质感、压力形态。D 与 B 正交：先做 B（换底座），D 作为后续把审计输入从"读叙事"逐步换成"读账本"——backlog 已有此方向（`docs/system-potential-backlog.md:60`"审计从读对话变成对账"）。

---

## 四、ADR 0005 原则套用到 showrunner

原则（`docs/adr/0005` 末段）："the harder a system's domain invariants, the more build-vs-buy tilts toward a thin self-owned seam"——框架的杠杆在你不需要的调度上，盲区恰是你的核心不变量。

showrunner 的不变量与 backstage 防火墙不同，逐条看框架是否承载：

| showrunner 不变量 | pi-subagents 是否结构性保障 | 引擎 seam 下的保障 |
| --- | --- | --- |
| read-only / 零 canon 写入 | ✅（`--tools lookup`，child 无写工具、无 `read`） | 等价（`--no-builtin-tools` + 仅 lookup extension） |
| executable-JSON-only 输出 | ❌ 纯 prompt（无 schema gate；框架的 `outputSchema` 未被使用） | ✅ 引擎 return-trip 校验（新增防线） |
| 独立于 GM 路径依赖 | ✅（fresh context + replace prompt） | 等价（独立进程 + 引擎拼 prompt） |
| 上下文投影保真（不陈旧、secrets 过滤在父侧） | ⚠️ 靠 `tool_call` hook 追着框架入参 schema 注入，失败静默降级（`extension.ts:87-90`） | ✅ 引擎拼 prompt 时内嵌，单形态、无猜测 |

**结论：原则指向同一方向，但推力弱于 backstage。** backstage 的迁移是"框架物理上给不了防火墙"（in-process 框架无法提供进程隔离 + 零工具，ADR 0005 第 3 段）；showrunner 这里 pi-subagents 没有能力缺口——它把两条不变量保障得不错，问题是（1）为此背 38K 行运行时依赖 + 一层追 schema 的注入胶水，（2）最要紧的输出不变量它虽有能力却没被接上，而引擎 gate 反正要自己写。用量 ~10%、胶水层是唯一活跃维护点、且迁移顺手补一道防线——净账倾向 thin seam，只是不像 backstage 那样是"必须"，更像"该"。

---

## 五、建议

**采用 B1**：引擎自有同步 spawn seam，GM 决定 WHEN 的现状不变；不与 B2（引擎触发）捆绑。短期维持 A 无害（依赖已在仓库里），但每次 pi-subagents 升级都是 task-injection 的回归风险点。

### 最小迁移清单

**新增**：

- `engine/core/showrunner/showrunner-persona.ts` — persona 收编（源自 `.pi/agents/timeline-showrunner.md` 正文；先例 `backstage-director-persona.ts`）。
- `engine/core/showrunner/showrunner-prompt.ts` — persona + input JSON + `buildTimelineStateContextBlock` 内嵌（复用 `task-injection.ts:27-44` 的块构造，该函数迁至 engine 或 projection 模块）。
- `engine/core/showrunner/showrunner-spawn.ts` — 阻塞版 spawn seam：args 拼装纯函数 + timeout/kill + 可替换 spawner 测试缝（照 `backstage-spawn.ts:36-73` 改：去 `detached/unref`，加 `--no-extensions -e extensions/subagents/timeline/index.ts --no-builtin-tools`，去 `--no-tools`）。
- `engine/core/showrunner/showrunner-output-schema.ts` — `TimelineShowrunnerOutput` TypeBox schema + 校验（先例 `parallel-line-output-schema.ts`）。
- `tools/settlement/run-showrunner-audit.ts` + `tools/registry.ts` 注册。

**删除**：

- `.pi/agents/timeline-showrunner.md`（agent 定义整体退役；`.pi/agents/` 目录仅剩它，`ls .pi/agents/` 实测）。
- `extensions/subagents/timeline/task-injection.ts` 的 subagent 入参改写部分 + `tests/timeline-task-injection.test.ts` 对应用例（上下文块构造函数保留迁移）。
- `extension.ts:76-92` 的 `tool_call` hook 块。
- `prompts/settlement/tool-policy.md:49` 与 `story-driver.md:30` 改指新工具名（硬切，不留旧入口——宪章"硬切优先"）。
- `AGENTS.md:210` 子代理纪律段同步改写（"仍走同步子代理"表述失效）。
- 待稳定后：`.pi/settings.json` packages 里的 `pi-subagents` 可从**发布**清单摘除（开发期继续本地使用不受影响）。

**保留不动**：`extensions/subagents/timeline/index.ts`（子进程 lookup 载体，spawn args 继续引用）。

### 必须保持的不变量（迁移验收线）

1. child 只有 `lookup`，无任何写工具、无 `read`/`bash`。
2. verdict 只有通过 schema 校验才返回 GM；校验失败返回结构化错误（列出缺失字段），不把裸文本漏给 GM。
3. child 不加载项目 `extension.ts` / AGENTS.md / skills（`--no-extensions --no-context-files --no-skills`）。
4. 上下文投影继续过滤 `actorSecrets/secretEventLog/campaignSecrets`（现测试 `tests/timeline-task-injection.test.ts:75-83` 迁移后保留）。
5. child session 落 gitignored 目录（投影含 hidden-canonical 摘要，参照 `BACKSTAGE_SESSION_DIR` 的处置，ADR 0005 第 3 段）。
6. spawn 失败/超时不得静默假装"审计通过"——返回明确失败，由 GM 决定重试或跳过。

### 测试缝

- args 拼装纯函数快照测试（先例 `backstage-spawn.test.ts`）。
- `setShowrunnerSpawnerForTest` 假 spawner（先例 `backstage-spawn.ts:70-73`；`@mjasnikovs/pi-task` 的 `fake-spawn` 印证，ADR 0005 第 2 段）。
- 输出 schema 正/反例（先例 `parallel-line-output-schema.test.ts`）。
- prompt 组装含 `<timeline_state_context>` 且不含 secrets 原文（迁移现有断言）。
