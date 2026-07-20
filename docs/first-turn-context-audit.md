# 第一回合上下文审计

审计日期：2026-07-20

处置更新：2026-07-20

## 范围

本次审计基于 `runtime/debug/` 中保存的第一回合上下文快照：

- `passA-1.md` 至 `passA-9.md`：Settlement agent loop 的九次模型调用
- `passB-1.md`：Renderer 首次生成
- `passB-2.md`：lint 失败后的全文重写
- `passB-3.md`：settled-prose digest

这些文件是递增快照，不是同时进入一次请求的十几份上下文。Pass A 每调用一轮工具，下一次模型请求都会携带扩大的 active loop。工具 schema 没有记录在这些快照里，因此本文统计的是可见文本下界。

本文先记录基线问题，再记录处置决定。上下文生命周期仍以 [ADR 0008](adr/0008-separate-session-log-from-settlement-working-set.md) 为准。未重新跑第一回合之前，规模数据均是修改前基线。

## 规模

| 阶段   | 模型调用数 |                   单次峰值 | 本回合快照累计字符数 |
| ------ | ---------: | -------------------------: | -------------------: |
| Pass A |          9 | 72,797 字符，102,987 bytes |              567,068 |
| Pass B |          3 |  51,888 字符，58,773 bytes |              104,739 |

Pass A 最终快照中，lookup 和 web search 结果约 24.5k 字符，占 33.6%。Pass B 的 system prompt 约 46k 字符，其中 `prompts/render/style-rules.md` 约 21.6k，接近一半。

以下问题描述保留审计时的基线行为。已经修复或明确暂缓的项目以“处置状态”表为准。

## 装配问题

### Pass A 继承了 coding-agent system

`engine/prompt-assembly/injection.ts` 的 `buildSystemPrompt()` 把 Settlement system 追加到 pi 默认 system 后面。Settlement 因此反复收到与叙事结算无关的内容，包括编码助手身份、文件工具说明、pi 文档路径和 coding skill 列表。

这部分不只占空间，还与 Settlement director 身份竞争。长期方向应是让 Settlement 使用独立、干净的 system，而不是在 coding-agent system 后面追加第二个身份。

### Direct reply 被当成叙事连续性

`extension.ts` 会从上一条 assistant 消息提取 `fsn-prose`，但当前实现没有排除 `details.kind === "direct-reply"` 的 block。

第一回合因此把“你想从哪个立场开始”之类的开局询问注入 `<prose_continuity>`，并称其为必须保持物理连续性的上一轮正文。同一段选择还存在于 settled-story capsule 和 `start-game` skill 中，形成重复和错误锚定。

### 新游戏仍携带未初始化默认 state

`passA-1.md` 注入了 `createInitialState()` 的占位时间、地点、主角类型和资金，例如 2004 年冬木、穗群原学园校门外和 50,000 円。这不是旧存档，而是 session 尚无持久化 Fate state 时的默认内存状态。`start-game` 同时要求初始化时忽略这些占位值。

未初始化默认 state 对当前裁决无用，还可能影响模型选择地点和年代。注入层应保留 hydration 的“未初始化”信号，并在初始化完成前省略所有 runtime state projection。

### 空动态块没有被省略

第一回合包含若干没有决策价值的块：

- 空的 backstage ledger
- 空的 presence
- `prompts/render/protagonist-impression.md` 中的 `Current protagonist: TBD`
- Renderer projection 中恒为 true 的 `needsRender`
- 没有内容时仍出现的 `npcOmissions` 说明

这类块应按内容条件注入。`TBD` 不应作为运行时 prompt 内容出现。

## Pass A 工作集问题

### `start-game` skill 整体常驻

完整 `skills/start-game/SKILL.md` 约 10.9k 字符。即使参数收集已经完成、初始化已经成功，后续工具轮仍保留全部流程说明，包括未选择的其他开局 recipe、收集模板和泛型 opening 示例。

这部分确实占空间，但只影响新游戏第一轮，而且阶段化装载会增加流程状态和测试复杂度。当前决定接受这笔成本，保持完整 skill 常驻，不做阶段拆分。

### 工具结果膨胀

本轮多次 lookup 返回重复角色和无关条目。web search 又把大量重复 URL、低质量来源和同音误匹配带回主上下文。最终模型使用这些材料时仍缺乏可靠出处来支持某些精确空间细节。

当前 canon 流程还要求 `web_search` 后用 `fetch_content` 核对正文，本轮没有执行 fetch。结果是上下文增长很多，事实置信度没有同步提高。

后续应考虑：

- lookup 按 canonical id 去重，只返回 top 1 至 2 个窄结果；
- web search 只负责选源，不把完整候选列表留在主工作集；
- 只 fetch 少量可信页面；
- 将可复用的 canon 研究结果做成带来源的窄结构卡片；
- 成功工具调用在 active loop 中压成短 receipt，原始参数和结果继续保留在 session log。

这与 `docs/system-potential-backlog.md` 的 canon 研究缓存方向一致。

### 规则重复，但没有成为可靠防线

秘密边界、工具顺序、行动窗口和结算职责在多个 Settlement 模块及 `start-game` 中重复出现。首次 direction packet 仍泄漏真名，最终依靠 packet firewall 拒绝。

这说明安全性来自 schema、firewall 和 engine invariant，而不是重复训话。应保留机械防线，合并重复 prompt。删减时不能反过来移除现有 packet secret firewall。

### Settlement 契约互相冲突

当前文本同时表达了以下两组冲突要求：

- “所有 state changes 都经 `commit_turn.events`”，但 condition、servant、presence、impression 又要求走窄领域工具；
- `submit_direction_packet` “exactly once”，但提交失败后又必须修复重试。

本轮实际运行选择了窄领域工具，并在 firewall 拒绝后第二次提交 packet。契约应描述真实行为：领域变化走各自工具；最终只能有一次成功提交，失败尝试可以修复后重试。

## Pass B 安全边界问题

### Raw player input 绕过 packet firewall

首次 direction packet 因包含未揭示真名而被 firewall 拒绝，但 Pass B 的 `Current Player Input` 仍原样包含“尼禄花嫁（CCC）”和“女岸波白野”。

因此现有 firewall 只能保证 direction packet 不携带这些字符串，不能保证 Renderer 接触不到秘密。此次成文没有泄漏只是模型遵守了文字约束，不是结构性隔离。

开局设定和 OOC 输入需要经过 player-safe 投影。普通局内台词是否可以原样传给 Renderer，应按输入类型单独定义，不能用同一条 raw-input 通道处理。

### Packet 含玩家不可感知的事实

Pass B 收到的 packet 仍包含可能超出当前视野的信息，例如：

- `resolvedChanges` 中 Cashura 的确切死因；
- `canonFacts` 中首先抵达的具体警方组织。

Renderer 被要求体现所有 resolved changes，却又不能泄漏玩家角色尚不知道的原因和后台事实。这会迫使模型在“忠实渲染”和“信息安全”之间自行取舍。

Direction Packet 在进入 Pass B 前需要区分：

- 可直接叙述的感知事实；
- 只能通过痕迹表现的因果；
- 纯后台 canonical facts，不能进入 Renderer。

### NPC voice 要求缺少输入

Renderer system 要求使用 NPC 印象卡中的语癖和对话范例，但当前 render preset 没有注入这些卡片。规则无法满足。

可选处理只有两种：向 Pass B 提供 player-safe render card，或者删除这项要求。不能继续要求模型使用不存在的材料。

## Pass B 规则与重写问题

### Renderer system 过大

Pass B system 约 46k 字符。`system.md`、`protocol.md`、`style-rules.md`、`style-blacklist.md`、`opening.md` 和 `output-contract.md` 多次换一种说法重复以下要求：

- 动作产生摩擦和回应；
- 环境物件承载情绪；
- NPC 必须主动；
- 禁止报告体和菜单式结尾；
- 结尾保留一个行动窗口。

`style-rules.md` 还有大量自称“机械”的规则，但现有 lint 只覆盖其中一小部分。没有机械检查的伪精确规则会增加负担，却不能稳定约束输出。

Renderer system 可先以 20k 至 25k 字符为目标。保留 packet 语义、视角、信息边界、输出格式和少量正向风格原则，合并重复的 prose 教程与 blacklist。

### `endWindow` 诱导伪菜单

本轮 packet 的 `endWindow` 写成“给她时间，还是替她做出选择”。Renderer 的输出契约明令禁止菜单式结尾，但 binding packet 又给出了二选一结构。最终正文确实以类似伪菜单的句子结束。

这里不能只靠 Renderer 自查。`endWindow` schema 或提交边界应拒绝枚举选项、问句和“是 A 还是 B”结构，只接受局势停点及需要玩家回应的压力。

### 局部 lint 触发全文重写

Pass B 首稿只因“仿佛这不是……而是……”命中一个正则，就再次发送约 51.9k 字符上下文并全文重写。两版正文高度相似，重写成本与修改范围不匹配。

当前决定接受全文重写的成本，不引入局部修订协议。秘密泄漏仍保持硬阻断。

## 处置状态

| 问题                                  | 决定                                                                     | 状态   |
| ------------------------------------- | ------------------------------------------------------------------------ | ------ |
| Settlement 继承 coding-agent system   | 使用独立 system，但保留 pi 提供的 skill list、skill 读取说明和 cwd       | 已完成 |
| Direct reply 进入 prose continuity    | 排除 `details.kind === "direct-reply"`                                   | 已完成 |
| 未初始化默认 state 进入第一轮         | 使用 hydration 结果，在 state 初始化前省略 runtime projection            | 已完成 |
| `protagonist-impression.md` 空占位    | 不做条件修补，直接删除整个模块                                           | 已完成 |
| `start-game` skill 整体常驻           | 接受第一轮成本，不做阶段化装载                                           | 不改   |
| lookup 与 web 结果膨胀                | 需要单独设计 canon 研究和工具 receipt                                    | 暂缓   |
| Settlement 规则重复                   | 删除重复 reminder，收拢成本、行动窗口和工具路由                          | 已完成 |
| Settlement 契约冲突                   | `commit_turn.events` 与窄工具按实际能力分工；packet 约束改为一次成功提交 | 已完成 |
| Raw player input 绕过 packet firewall | 需要先定义 OOC 与局内输入的安全投影                                      | 暂缓   |
| Packet 含玩家不可感知事实             | 需要重新设计 packet 的可感知层级                                         | 暂缓   |
| NPC voice 缺少输入                    | 将当前在场、非主角的 player-safe impression card 注入 Pass B             | 已完成 |
| Renderer system 过大                  | 合并 `system`、`protocol` 和 `style-rules` 的重复内容                    | 已完成 |
| `endWindow` 诱导伪菜单                | 认定为 Pass A 契约问题，在 packet validation 拒绝枚举式停点              | 已完成 |
| style lint 触发全文重写               | 接受当前成本                                                             | 不改   |

Renderer continuation system 的静态装配由约 46k 字符降到 19,381 字符，opening 为 21,715 字符。这个数字不含当前输入、Direction Packet、NPC render card 和历史正文。

## 验收指标

后续修改至少应采集以下指标：

- Pass A 第一回合调用数、峰值字符数和累计字符数；
- lookup 与 web 内容在 Pass A 峰值中的占比；
- Pass B system 字符数；
- lint 重试次数及每次改动范围；
- direct-reply 是否进入 prose continuity；
- 新游戏上下文是否含未初始化默认 state 的时间、地点、资金；
- Renderer 输入是否出现未揭示 true name、NP name 或后台-only fact；
- `endWindow` 是否含枚举选项或二选一问句。

第一阶段原目标为 Pass A 峰值降到 35k 至 45k 字符，Pass B 首写降到 22k 至 30k 字符。Renderer 静态 system 已达到目标，但完整首写和 Pass A 仍需用新的第一回合 trace 复测。数字不是新的硬契约，实际改动仍应以正确性、玩家可见信息边界和工具不变量为先。
