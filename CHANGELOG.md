# CHANGELOG

## v0.1.0 (未发布)

- 升级 Pi 运行时依赖至 0.80.6；双 pass 正文改在 `agent_settled` 后追加，删除 25ms 轮询与 10 秒超时丢稿路径，同时保留 queued continuation 的多篇正文顺序。
- 新增 `/reroll` 正文重 roll 命令（`extensions/two-pass-render/`）：复用上一轮结算包，
  只重跑渲染段并替换最后一条 `fsn-prose`，不改变游戏状态。
- 新增 `/fuck [N]` 快速回退命令（`extensions/rewind/`）：中断当前生成、回到倒数第 N 条用户输入之前、从 session 文件物理删除废弃分支，原输入回填输入框便于修改重发；游戏状态由 session_tree 钩子自动从回退点快照重新水合。

- 架构：工具契约（name/description/parameters）与实现合并到同一文件：每个工具导出 `FsnToolDefinition`，`tools/registry.ts` 从 1087 行缩为 60 行注册清单；共享 entry schema 片段归位各工具文件（time policy 入 `time-policy-tool-schema.ts`）；`reset_state`/`lookup`/`patch_state`/`resolve_combat_exchange` 边界改收 `unknown` 并自行归一化，删除 `PatchOp`/`RawCombatExchangeInput` 死类型；registry 测试升级为全工具文件的 loose-schema 守卫 + registry 瘦身断言。
- 架构：`state.ts` 杂物抽屉拆解为纯类型词汇表（零函数）；store 生命周期迁入 `state-store.ts`，边界断言并入 `typebox-validation.ts`（Tool Input Normalization），session 胶水并入 `state-persistence.ts`，`advanceClock` 归位 `turn-time.ts`，参数修正剪枝归位 `servant.ts`，新增 `ids.ts`（ID 分配）与 `turn-log.ts`；删除死导出 `allowedPatchPaths`/`StatePatchPath`。
- 架构：领域事件函数纯化为 `(draft, event)` 形态；Game State Store 的写入收口到 Domain Event Tool Runner（clone → 执行 → 校验 → commit）。`updateState`/`transactState` 删除，事务回滚 hack 消失（失败 = 不提交）。顺带修复：`createId` 改为扫描 draft（消除同一提交内撞 ID 与测试间 ID 漂移）；过期参数修正剪枝移到时钟推进领域逻辑；领域测试不再需要 `resetState()` 仪式。

- 初始测试发布包。
- 提供 Fate/strange Fake 斯诺菲尔德沙盒；当前大量测试集中在绫香线。
- 包含项目隔离启动脚本、项目 subagents、FSN compaction command 与发布打包脚本。
