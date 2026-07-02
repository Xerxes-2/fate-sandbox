# Preset Expert Onboarding — 前沿攻坚 brief

写给一位同时精通 **SillyTavern 预设 / TypeScript / agent 工程** 的同侪 reviewer。

你不是来"调提示词"的临时工，是来攻边界的。本文不解释已解决的东西（那会浪费你时间），只交付三样：**设计意图 → 未决张力 → 评测台**。翻译表在附录，扫一眼省你逆向时间即可。

全仓库读写权限。产出走 PR 或建议文档，结论用 `render-bench` 背书。

---

## 0. 一句话定位

这是一个 Fate/stay-night 跑团引擎，跑在 pi agent 上。核心赌注：**「Prompt 不是防线」**（见 `AGENTS.md` 宪章段）——能机械验证的纪律一律下沉为 TypeScript schema / 账本 / lint，prompt 只负责机器证明不了的东西（笔触、声音、节奏、临场判断）。

所以你来之前先内化一件事：**如果一条规则能写成正则或 invariant，它就不该活在 prompt 里**。你看到 prompt 里还有这种东西 = 你找到了一个下沉机会（这正是我们想要你贡献的）。

## 1. 架构骨架（30 秒）

两段式 turn：

```
玩家输入
  → [Settlement pass] GM 作为"结算器"：跑领域工具改 state，
     最后 submit_direction_packet（结构化、language-neutral、防火墙过滤秘密）
  → [Render pass] 洁净室渲染器：只吃 packet，产出中文第二人称散文
     → 机械 lint（style + 未揭示秘密扫描）不过则重试一次 → 仍泄密则遮蔽
```

- 结算器**不写散文**，渲染器**看不到 state / 工具 / 秘密真名**，只看到 packet。
- packet 的字段分 `binding`（必须到达成品场景）/ `free`（建议）/ `player-safe`（已过秘密防火墙）。
- 关键文件：`agents/gm-direction.md`（packet 契约）、`agents/gm-render.md`（渲染协议）、`agents/system-render.md`（渲染器身份）、`agents/gm-style-rules.md`（23KB 笔触圣经）、`extensions/two-pass-render/`（接线）、`engine/audit/lint-rules.ts`（机械 lint，审计与渲染复用同一份）。

## 2. 阅读路径（不要读整个 repo）

1. `AGENTS.md` 宪章段：Prompt 不是防线 / public-secrets-knowledge 三层 / 真名防线 / 硬切优先。
2. `agents/gm-direction.md` + `agents/gm-render.md`：吃透 direction↔render 的职责切分（下面 §3 的主战场就在这条缝）。
3. 跑一遍 `docs/render-bench/`：看现有渲染水准的盲样对比，建立 baseline 体感。
4. `docs/system-potential-backlog.md`：18 项里大部分已 `[x]`，**只看 `[ ]` 的和每节末尾「后续 / 进阶（未做）」**——那是已知未挖的矿。

读完上面四步你就有完整作战图了。剩下按需钻 `engine/core/*`。

---

## 3. 未决张力（你的主战场）

按"值得攻"排序。每条都给了战线两端（prompt 侧 / code 侧），灰区正是你三料背景的价值点。

### T1 — direction↔render 的职责边界是否最优【最高价值】

这是整个系统最大的灰区。`gm-direction.md` 规定结算器把 NPC 行为压成 `npcStances[].move`（一句话的"主动行为"），`gm-render.md` 再把它展开成有声音的场景。问题：

- **哪些决策该在 direction（可被审计/账本约束），哪些该留给 render 自由发挥？** 现在 `move` 是结算器写死的，渲染器只许"演出不许改写"。这条线划在这里对吗？放太多到 direction → 渲染僵硬；放太多到 render → 失去机械可验证性，违反第一性原则。
- `npcStances` / `npcOmissions` 的"在场重要 NPC 必须二选一覆盖"是 tool 硬执法的。这个 coverage 模型会不会逼出"为了填字段而填"的假 move？（`gm-direction.md` 自己列了一堆 Bad 例子在防这个——说明这是活的痛点。）
- packet 是 language-neutral 的，中文 canon 走 `canonFacts`。这层"英文意图 → 中文成品"的翻译损耗有多大？酒馆预设里 prefill / 深度注入是直接喂目标语言的，我们故意没这么做——你判断这个 trade-off 值不值。

**交付形态**：对几个真实 turn 的 packet→成品做拆解，指出哪些质感损失发生在 direction 过度规约、哪些发生在 render 自由度不足，给出移动这条线的实验。

### T2 — `gm-style-rules.md` 23KB 的下沉率

这是最大的静态 prompt block。backlog #1 进阶里已经点名一个例子：**"同一意象簇 3 轮内不得重复"可以机械化**——对最近 3 轮正文做意象关键词计数，超限就在下一轮 pre-response 动态注入"本轮禁用意象：X、Y"，把静态黑名单变成带违规上下文的动态注入。

问题给你：这 23KB 里**还有多少是"能机械检测 / 能动态注入"的，多少是"只能靠模型理解的真·风格"**？前者该下沉到 `lint-rules.ts` 或动态注入；后者留着但要精简。你做一次"可机械化 / 不可机械化"的二分标注，就是一份高价值产出。

### T3 — 真名防线 / secrets 在 render 侧的 prompt 冗余

秘密泄漏已经是**三重防御**：packet 防火墙（结算器侧过滤）+ render lint 扫描真名串 + 账本（`secrets.revealState`）。那么 render 侧 prompt 里关于"别说真名"的文字还需要多少？prompt 和 code 在这里是否有冗余执法（违反"Prompt 不是防线"——既然 code 兜底了，prompt 不该再当防线，最多当"提示语气"）。判断：哪些 prompt 句子是 code 已经保证的，可以删。

### T4 — backlog 明确未做项（可直接认领）

- **#14 heavy 轮并行渲染选优**（`[ ]`）：Max Mode 歪用——对 `eventWeight: heavy` 的 turn 并行采样多份渲染 + judge 选优（灵感来自 SWE-Bench +10-20%）。需要 pi-subagents result-intercom 桥。这是 agent 工程 + 渲染质量的交叉点，正中你的三料。
- **#7 canon 研究缓存**（`[ ]`）：casting 子代理的研究结果缓存，未开始。
- **#19 actor id opaque 化 + name→id resolver**（`[ ]`）：关掉 firewall key 的侧信道，同时是"换主角"的地基。偏 TS/schema 活。
- 各节末尾的「后续 / 进阶（未做）」：如 #6 的"brief 按当前 location 自动关联注入 2-3 条旧记忆"、#13 的 arc-summary 层（>32 轮摘要滑出后的长程记忆）、#17 的 audit 统计 pressureType 连续重复率。

### T5 — 双 pass 的延迟/成本与 UX

backlog #12 自己记了：双 pass 延迟靠"结算器上下文缩水"对冲，等待期用 `setWorkingMessage`/`setStatus`/`setWidget` 流式显示结算状态行。你判断这个对冲够不够、render 模型选型（`FATE_RENDER_MODEL`）有没有更优解。

---

## 4. 评测台（你的背书工具，也欢迎你扩它）

**不要用"更沉浸"这种不可证伪的话提议。** 我们有现成 A/B harness：

- `scripts/render-bench.ts`（`pnpm` 脚本入口见 `package.json`）：多模型 × 多轮 × 盲样渲染对比。
- `docs/render-bench/<timestamp>/turn-NN/`：每个 turn 有 `baseline.md`、各模型 `round-N.md`、`blind/sample-NN.md` + `key.json`（盲评对照）。
- `docs/spike-two-pass/`：双 pass 的早期实测样本（turn-52/55/57 的 input/baseline/rendered）。
- `scripts/audit-session.ts`（`pnpm audit:session`）：对真实 session 跑叙事纪律回归——时间推进覆盖率、无代价连续段、output 契约机械子集、**未揭示秘密泄漏**。你的 prompt 改动可以用它做回归，证明没把纪律改坏。

作为 agent 专家，欢迎你**扩 harness**：加评测维度（NPC 声音区分度、意象重复率、节奏曲线）、加 judge 模型、改盲样集。把"提示词玄学"变成 CI 能跑的数字，是这个项目最欢迎的贡献形态。

---

## 5. 工作纪律（提交前必过）

`AGENTS.md` 「提交」段：四项检查（typecheck / lint / test / knip 死代码），一个 commit 一件事，commit message 英文 imperative。改 prompt 也要：如果你的改动让某条 prompt 规则变成可机械检测的，**优先开 issue/PR 把它下沉到 `lint-rules.ts` 并补测试**，而不是停在改 prompt 文字。

---

## 附录 A — SillyTavern → fsn 概念映射

| ST 概念                  | fsn 对应                                                                                | 备注                                         |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| System prompt / 角色卡   | `agents/system-*.md` + `agents/gm-*.md` 分模块                                          | 按 pass 分组（settlement/render/both）       |
| Jailbreak / prefill      | 两段式 render（洁净室渲染器）                                                           | 我们用结构隔离代替越狱，不喂 prefill         |
| World Info / Lorebook    | `data/*.json`（characters/servants/locations/timelines/world）+ engine 按 presence 注入 | 注入是 engine 算的，不是关键词触发           |
| Regex 后处理             | `engine/audit/lint-rules.ts`（纯函数 + 测试）                                           | 审计与渲染复用同一份                         |
| Author's Note / 深度注入 | engine 装配的 turn context（mechanical_state / turn_reminder / direction_contract）     | 见 backlog #11 的 KV-cache 注入顺序          |
| 变量 / MVU 状态栏        | `engine/core/state.ts` 的 public/secrets 分层 + 领域工具                                | 工具是领域事件，不是状态栏（AGENTS.md 戒律） |
| 楼层记忆 / 摘要          | `prose-digest-store.ts` 双层滑窗 + packet 机械摘要（#13）                               | >32 轮仍会丢，arc-summary 层未做             |
| 抽卡 / 骰子              | `engine/core/seeded-rng.ts`（确定性，rewind 安全）                                      |                                              |

附录 B（按需）：`docs/adr/` 有 6 篇 ADR 记录关键架构决策（双 pass、public/secret 拆分、engine 账本执法、slim settlement、spawn seam、pending-harvest guard）——你质疑某个设计前先看对应 ADR，可能已经辩论过。

---

_维护：本文是活文档。你上手后发现 brief 哪里过时或哪条张力已不成立，直接改它。_
