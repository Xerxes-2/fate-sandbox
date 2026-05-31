# 平行线 Subagent 速查

主 GM 在 major beat end、长时间跳过、或某阵营应当独立行动时，可以调用 `parallel-line` subagent。

## 调用输入

只给窄输入，不给完整主状态：

```json
{
  "lineId": "lancer-church",
  "timeWindow": { "start": "2004-01-30T07:00:00.000Z", "end": "2004-01-30T09:00:00.000Z" },
  "currentArc": "开局",
  "currentBeat": "柳洞寺侦察收尾",
  "allowedScope": ["外围侦察", "教会汇报", "未来监视钩子"],
  "forbiddenEscalations": ["触发山门战斗", "佐佐木小次郎正式现界", "美狄亚正面战"],
  "knownFacts": ["该阵营实际已知事实"],
  "privateFacts": ["该阵营自己的秘密"],
  "actorGoals": ["本窗口目标"],
  "previousLineState": "上一轮该线状态摘要",
  "playerSideSummary": "只给该阵营可能相关的玩家侧摘要"
}
```

## 落地流程

1. 读取 subagent 输出 JSON。
2. 只把审核通过的幕后事实写入 `record_offscreen_event`。
3. `visibility` 只能用 `secret` 或 `foreshadowed`。
4. 玩家可见内容必须重新转写成痕迹 / 传闻 / 梦境 / 异常行动；不要原样展示 `privateSummary`。

## Lancer / Church 示例

- `lineId`: `lancer-church`
- `allowedScope`: 库丘林外围侦察、向言峰汇报、教会监督者命令、未来监视钩子
- `forbiddenEscalations`: 主动杀入玩家当前场景、提前爆发决战、泄露巴泽特完整真相
- 常见 hooks: 夜间柳洞寺外围监视、教会晚灯、蓝色枪兵气息一闪、言峰对某地点兴趣上升
