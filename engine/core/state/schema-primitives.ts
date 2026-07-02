import type { TSchema } from "typebox";

import { Type } from "typebox";

/**
 * State 树 schema 的公共原语（叶子模块，只依赖 typebox）。
 * 各领域的 *-schema.ts 状态片段与 state-schema.ts 组合根共用，
 * 保证「非空字符串 / ISO 时间 / 百分比」等约定全树一致。
 */
export const NON_EMPTY_STRING_SCHEMA = Type.String({ minLength: 1 });
export const NON_EMPTY_STRING_ARRAY_SCHEMA = Type.Array(NON_EMPTY_STRING_SCHEMA);
/** ISO 时间字段：结构上只要求非空字符串，格式校验与归一化在 parseStateSchema 后置 pass。 */
export const ISO_INSTANT_SCHEMA = Type.String({ minLength: 1 });
export const PERCENT_SCHEMA = Type.Integer({ minimum: 0, maximum: 100 });
export const NON_NEGATIVE_INTEGER_SCHEMA = Type.Integer({ minimum: 0 });

export function nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}
