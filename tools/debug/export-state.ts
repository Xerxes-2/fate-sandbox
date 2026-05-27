import { writeDebugStateFile } from "../../engine/core/state";
import { textResult, type ToolResult } from "../runtime/tool-result";

export function exportStateTool(): ToolResult {
  return textResult(`已导出当前状态到 ${writeDebugStateFile()}`);
}
