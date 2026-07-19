# Preset reviewer onboarding

本文面向熟悉 SillyTavern preset、TypeScript 和 agent 系统的 reviewer，概述项目的设计意图、未决问题和评测工具。附录提供 SillyTavern 与本项目概念的对照。

Reviewer 可以读取和修改整个仓库。请通过 PR 或建议文档提交结论，并用 `render-bench` 或其它可复现结果说明依据。

---

## 0. 项目定位

这是一个运行在 pi agent 上的 Fate/stay night 跑团引擎。项目遵循 `AGENTS.md` 中的「Prompt 不是防线」原则：能机械验证的规则应落在 TypeScript schema、账本或 lint 中。Prompt 负责笔触、声音、节奏和临场判断等无法稳定机械验证的部分。

审查 prompt 时，请标出可以改为正则、schema 或 engine invariant 的规则，并说明适合的落点。

## 1. 架构概览

两段式 turn：

```
玩家输入
  → [Settlement pass] GM 作为"结算器"：跑领域工具改 state，
     最后 submit_direction_packet（结构化、language-neutral、防火墙过滤秘密）
  → [Render pass] 洁净室渲染器：只接收 packet，产出中文第二人称散文
     → 机械 lint（style + 未揭示秘密扫描）不过则重试一次 → 仍泄密则遮蔽
```

- 结算器**不写散文**，渲染器**看不到 state / 工具 / 秘密真名**，只看到 packet。
- packet 的字段分 `binding`（必须到达成品场景）/ `free`（建议）/ `player-safe`（已过秘密防火墙）。
- 关键文件：`prompts/settlement/direction-contract.md`（packet 契约）、`prompts/render/protocol.md`（渲染协议）、`prompts/render/system.md`（渲染器身份）、`prompts/render/style-rules.md`（23KB 笔触圣经）、`extensions/two-pass-render/`（接线）、`engine/audit/lint-rules.ts`（机械 lint，审计与渲染复用同一份）。

## 2. 建议阅读顺序

1. `AGENTS.md` 宪章段：Prompt 不是防线 / public-secrets-knowledge 三层 / 真名防线 / 硬切优先。
2. `prompts/settlement/direction-contract.md` + `prompts/render/protocol.md`：确认 direction 与 render 的职责切分，§3 的多数问题来自这条边界。
3. 跑一遍 `docs/render-bench/`：看现有渲染水准的盲样对比，建立 baseline 体感。
4. `docs/system-potential-backlog.md`：19 项里大部分已 `[x]`。优先阅读 `[ ]` 项和每节末尾的「后续 / 进阶（未做）」。

完成以上步骤后，再按具体问题查看 `engine/core/*`。

---

## 3. 未决问题

以下问题按预期影响排序，并分别列出 prompt 侧和 code 侧的约束。

### T1: direction 与 render 的职责边界

这是当前影响范围最大、验证最不充分的边界。`direction-contract.md` 规定结算器把 NPC 行为压成 `npcStances[].move`（一句话的"主动行为"），`render/protocol.md` 再把它展开成有声音的场景。问题：

- **哪些决策该在 direction（可被审计/账本约束），哪些该留给 render 自由发挥？** 现在 `move` 是结算器写死的，渲染器只许"演出不许改写"。这条线划在这里对吗？放太多到 direction → 渲染僵硬；放太多到 render → 失去机械可验证性，违反第一性原则。
- `npcStances` / `npcOmissions` 的"在场重要 NPC 必须二选一覆盖"是 tool 硬执法的。这个 coverage 模型会不会逼出"为了填字段而填"的假 move？（`direction-contract.md` 自己列了一堆 Bad 例子在防这个——说明这是活的痛点。）
- packet 是 language-neutral 的，中文 canon 走 `canonFacts`。这层"英文意图 → 中文成品"的翻译损耗有多大？酒馆预设里 prefill / 深度注入是直接喂目标语言的，我们故意没这么做——你判断这个 trade-off 值不值。

**建议输出**：拆解几个真实 turn 的 packet 和成品，分别标出 direction 过度规约与 render 自由度不足造成的问题，并设计调整边界的对照实验。

### T2 — `style-rules.md` 23KB 的下沉率

这是最大的静态 prompt block。backlog #1 进阶里已经点名一个例子：**"同一意象簇 3 轮内不得重复"可以机械化**——对最近 3 轮正文做意象关键词计数，超限就在下一轮 pre-response 动态注入"本轮禁用意象：X、Y"，把静态黑名单变成带违规上下文的动态注入。

请将这 23KB 规则分为「可机械检测或动态注入」与「只能由模型判断」两类。前者应下沉到 `lint-rules.ts` 或动态注入，后者保留在 prompt 中并精简重复内容。

### T3 — 真名防线 / secrets 在 render 侧的 prompt 冗余

秘密泄漏已经是**三重防御**：packet 防火墙（结算器侧过滤）+ render lint 扫描真名串 + 账本（`secrets.revealState`）。那么 render 侧 prompt 里关于"别说真名"的文字还需要多少？prompt 和 code 在这里是否有冗余执法（违反"Prompt 不是防线"。既然 code 已经保证该约束，prompt 不应再承担防线职责，最多提示写作语气）。判断：哪些 prompt 句子是 code 已经保证的，可以删。

### T4: backlog 中尚未完成的项目

- **#14 heavy 轮并行渲染选优**（`[ ]`）：对 `eventWeight: heavy` 的 turn 并行采样多份渲染，再由 judge 选择结果。该方案需要结果回传机制，并应先验证额外延迟和成本。
- **#7 canon 研究缓存**（`[ ]`）：casting 子代理的研究结果缓存，未开始。
- **#19 actor id opaque 化 + name-to-id resolver**（`[ ]`）：消除 firewall key 泄露真名的路径，并支持更换主角。主要涉及 TypeScript 和 schema。
- 各节末尾的「后续 / 进阶（未做）」：如 #6 的"brief 按当前 location 自动关联注入 2-3 条旧记忆"、#13 的 arc-summary 层（>32 轮摘要滑出后的长程记忆）、#17 的 audit 统计 pressureType 连续重复率。

### T5 — 双 pass 的延迟/成本与 UX

backlog #12 自己记了：双 pass 延迟靠"结算器上下文缩水"对冲，等待期用 `setWorkingMessage`/`setStatus`/`setWidget` 流式显示结算状态行。你判断这个对冲够不够、render 模型选型（`FATE_RENDER_MODEL`）有没有更优解。

---

## 4. 评测工具

不要只用「更沉浸」等无法复现的判断说明改动。仓库已有以下 A/B harness：

- `scripts/render-bench.ts`（用法见文件头，例如 `node scripts/render-bench.ts --turns 1 --rounds 3`）：多模型 × 多轮 × 盲样渲染对比。
- `docs/render-bench/<timestamp>/turn-NN/`：每个 turn 有 `baseline.md`、各模型 `round-N.md`、`blind/sample-NN.md` + `key.json`（盲评对照）。
- `docs/spikes/two-pass/`：双 pass 的早期实测样本（turn-52/55/57 的 input/baseline/rendered）。
- `scripts/audit-session.ts`（`pnpm audit:session`）：对真实 session 跑叙事纪律回归——时间推进覆盖率、无代价连续段、output 契约机械子集、**未揭示秘密泄漏**。你的 prompt 改动可以用它做回归，证明没把纪律改坏。

可以扩展 harness，加入 NPC 声音区分度、意象重复率或节奏曲线等指标，也可以调整 judge 模型和盲样集。新增指标应能在 CI 或本地脚本中复现。

---

## 5. 工作纪律（提交前必过）

`AGENTS.md` 「提交」段要求通过 typecheck、lint、format check 和 test。一个 commit 只处理一件事，commit message 使用英文祈使句。若 prompt 规则可以机械检测，应优先把它下沉到 `lint-rules.ts` 或其它合适的 engine 边界，并补测试。

---

## 附录 A — SillyTavern → fsn 概念映射

| ST 概念                  | fsn 对应                                                                                      | 备注                                         |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| System prompt / 角色卡   | `prompts/system-*.md` + `prompts/gm-*.md` 分模块                                              | 按 pass 分组（settlement/render/both）       |
| Jailbreak / prefill      | 两段式 render（洁净室渲染器）                                                                 | 我们用结构隔离代替越狱，不喂 prefill         |
| World Info / Lorebook    | `world-data/*.json`（characters/servants/locations/timelines/world）+ engine 按 presence 注入 | 注入是 engine 算的，不是关键词触发           |
| Regex 后处理             | `engine/audit/lint-rules.ts`（纯函数 + 测试）                                                 | 审计与渲染复用同一份                         |
| Author's Note / 深度注入 | engine 装配的 turn context（mechanical_state / turn_reminder / direction_contract）           | 见 backlog #11 的 KV-cache 注入顺序          |
| 变量 / MVU 状态栏        | `engine/core/state/state.ts` 的 public/secrets 分层 + 领域工具                                | 工具是领域事件，不是状态栏（AGENTS.md 戒律） |
| 楼层记忆 / 摘要          | `prose-digest-store.ts` 双层滑窗 + packet 机械摘要（#13）                                     | >32 轮仍会丢，arc-summary 层未做             |
| 抽卡 / 骰子              | `engine/core/utils/seeded-rng.ts`（确定性，rewind 安全）                                      |                                              |

附录 B（按需）：`docs/adr/` 记录双 pass、public/secret 拆分、engine 账本执法、slim settlement 和 spawn seam 等架构决策。审查相关设计前，请先查看对应 ADR 的证据与取舍。

---

_维护：本文是活文档。若内容过时或未决问题已经关闭，请直接更新。_
