import { Type } from "typebox";

/** commit_turn 的顶层 time 裁决入口 schema。 */
export function timePolicySchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    kind: Type.String({
      description:
        "允许: elapsed / travel。等待、休息、睡眠、守夜、治疗、调查等非移动耗时用 elapsed；玩家在叙事中改变地点用 travel",
    }),
    elapsedMinutes: Type.Optional(
      Type.Unknown({ description: "kind=elapsed/travel 必填；大于 0 的整数" }),
    ),
    location: Type.Optional(locationSchema()),
    reason: Type.String({ description: "本轮耗时或移动的原因" }),
  });
}

function locationSchema(): ReturnType<typeof Type.Object> {
  return Type.Object({
    region: Type.String(),
    site: Type.String(),
    detail: Type.String(),
    boundary: Type.String({
      description: "地点边界类型，允许: normal / bounded-field / reality-marble / otherworld",
    }),
  });
}
