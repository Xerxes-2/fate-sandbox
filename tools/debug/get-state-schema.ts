import { CURRENT_STATE_SCHEMA_VERSION, allowedPatchPaths } from "../../engine/core/state";
import { textResult, type ToolResult } from "../runtime/tool-result";

export function getStateSchemaTool(): ToolResult {
  const schema = {
    版本: CURRENT_STATE_SCHEMA_VERSION,
    字段: {
      金钱: "number — 日元余额，不能为负",
      当前位置: "string — 如 冬木市·深山镇·卫宫邸",
      身体状态: "number — 0-100, 100=健康, 0=死亡",
      时间: {
        开局时间: "ISO date string — 游戏内开局时间锚点",
        当前时间: "ISO date string — 当前游戏内时间",
        当天休息分钟: "number — 当天累计休息/恢复时间，由时间系统维护",
        当天高压分钟: "number — 当天累计高压行动时间，由时间系统维护",
        当天低压分钟: "number — 当天累计低压行动时间，由时间系统维护",
        显示时间: "string — 人类可读游戏时间，含星期，如 2004年01月30日 星期五 16:00；导出快照派生字段",
        日期: "string — 游戏时区日期；导出快照派生字段",
        星期: "string — 游戏时区星期；导出快照派生字段",
        时刻: "string — 游戏时区 HH:mm；导出快照派生字段",
      },
      疲劳: "number — 0-100, 行动负荷与注意力下降",
      魔力负担: "number — 0-100, 魔术/供魔/神秘接触成本",
      危险度: "number — 0-5, 当前场景危险等级",
    },
    受保护路径: allowedPatchPaths(),
    仅允许: "patch_state 只能修改受保护路径；风险/耗时/疲劳/魔力负担优先用 resolve_consequence 结算",
  };
  return textResult(JSON.stringify(schema, null, 2));
}
