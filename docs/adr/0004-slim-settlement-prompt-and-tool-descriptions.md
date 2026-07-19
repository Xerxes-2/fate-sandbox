# Slim the settlement prompt stack and tool descriptions instead of trimming dynamically

非 GPT 模型在结算回合中速度较慢，且思维链偏长。结算 prompt 主干当时约有 42558 个字符，工具 description 也大量使用「必须调用的场景」和「严禁的行为」长清单。模型容易在调用工具前复述这些清单。

本次改动采用静态精简：停用结算 preset 中只与渲染有关的 `social-guide`，压缩七个 settlement prompt 文件，并将 19 个工具 description 收为「一行用途 + 使用边界 + 禁区」。结算 prompt 主干从 42558 个字符降到 16768 个，减少约 60.6%；工具 description 从 14931 个字符降到 9965 个，减少约 33.3%。改动没有改变工具行为或 schema 字段集；`packet-contract.test.ts` 与各工具 schema 测试锁定这些契约。当时的 470 项测试以及 typecheck、lint、format 检查均通过。

输入相关的动态 prompt 裁剪会改变缓存前缀，使每回合重新计费系统提示，因此没有采用。实现期间曾试做 `isLikelyMetaTurn` 和 `chooseSettlementPromptProfile`，随后整体回退。该次改动保持固定静态注入；`buildSlotMessages` 的 pre-history、pre-response 和 final-contract 顺序不变，对应版本的 `injection.test.ts` 以 `injected.length === 11` 锁定当时结构。

可机械验证的规则应由 engine ledger、schema 和测试承担。Prompt 只保留模型执行当前任务所需的说明，不通过重复清单承担正确性。
