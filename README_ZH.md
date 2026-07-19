# fate-sandbox

[English README](README.md)

基于 pi coding agent 的本地型月世界观互动叙事 runtime。

## Worldlines

开局可选 20 条世界线 preset（`/skill:start-game` 会引导选择）：

- **Fate 圣杯战争系**：FSN 冬木（第五次）、Fate/Zero（第四次）、hollow ataraxia（五战半年后）、strange Fake 斯诺菲尔德、Apocrypha 大圣杯战争、EXTRA / EXTRA CCC、Prototype 蒼銀のフラグメンツ（第一次东京）/ Prototype OVA（第二次东京）、Samurai Remnant（江户盈月之仪）、type Redline（帝都圣杯奇谭）
- **Fate 非战争系**：二世事件簿（时钟塔）、魔法少女伊莉雅（职阶卡回收）、Fate/Labyrinth（大圣杯迷宫）
- **非 Fate 型月**：月姬（原作/重制两版）、空之境界、魔法使之夜
- **特殊模式**：幻想嘉年华（全明星喜剧）
- **自定义**：年代、城市、战争规模由开局问答确认

所有世界线都是沙盒：只提供世界结构与原作设定底盘，不锁原作剧情；玩家身份、原作主线是否发生由开局确认。

## Requirements

- Node.js >= 24
- pnpm 11.3.0
- pi coding agent

## Quick Start

### Linux / macOS

```bash
pnpm install
./start.sh
```

### Windows PowerShell

```powershell
pnpm install
.\start.ps1
```

如果 PowerShell 执行策略拦截脚本，可在当前窗口临时放开：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start.ps1
```

进入 pi 界面后，先确认模型/API 已经配置好；如果没登录，先按自己的 pi 环境执行 `/login` 或配置 provider。

然后在输入框里输入：

```txt
/skill:start-game
```

或直接用自然语言说“开始游戏”。推荐用 `/skill:start-game`，它会按项目的开局流程初始化。

常用 UI 命令：

```txt
/status     查看当前时间、地点、目标、威胁和资源
/inventory  查看当前玩家可见资金与物品
/compact    手动压缩聊天上下文（项目已接管为 Fate 压缩策略，自动压缩同样生效）
/reroll    重新渲染最后一条正文：保留结算事实，只替换可见小说文本
/fuck [N]   快速回退到倒数第 N 次输入（默认 1）：中断生成、删除废弃分支、原输入回填输入框
```

`/reroll` 是“正文不满意重写”：只重跑双 pass 的渲染段，不重新结算、
不推进时间、不改游戏状态；它只能作用于当前最后一条正文。

`/fuck` 是“坏输入急救”：刚发出去就后悔时用它回到输入前一刻，游戏状态会自动回滚到回退点快照。被废弃的分支会从 session 文件中物理删除，不可恢复；如果想保留分支对比不同走向，请用 pi 自带的 `/tree`。

`/status` 和 `/inventory` 是 UI 面板，不是剧情动作；它们用于命令行里查看自己当前知道/持有的东西。

看到右下角类似 `0.0%` 和一个方块时，那通常是 pi 的上下文/状态 UI，不是下载进度条。首次启动如果没有 API/model 配置，界面可能看起来像“卡住”，但实际是在等你输入命令或配置模型渠道。

## New to Fate?

可以玩。推荐选择“新手模式”：普通人或穿越者视角进入异常，让玩家角色和玩家本人一起理解魔术世界。

第一次玩不建议直接选择复杂 FSF 多阵营中心或从者开局。更稳的开局是：

```txt
2004 年冬木市，你是不了解魔术的普通学生或临时来客。某天放学后，你在旧仓库附近看见了不该存在的光。
```

GM 应该只解释影响下一步行动的最小术语，不会要求玩家先懂 Fate 设定。

## 模型说明

本项目强依赖模型的工具调用纪律。它不是普通 prompt 角色卡：移动、过夜、花钱、受伤、揭示真名、推进 scene beat 等状态变化都应该通过工具落地。

推荐使用能稳定 tool calling、愿意根据工具错误重试的模型。模型可以犯参数错，工具会拒绝坏状态并给出可用选项；但如果模型经常跳过工具直接续写，体验会退化成普通聊天卡，状态和剧情会开始分家。

已重点测试：GPT-5.5。也测试过 Opus 4.5、DeepSeek V4 Pro。项目子代理默认使用 DeepSeek V4 Pro，可自行调整。

### 双模型：结算与渲染分开

每一轮分两段跑：结算轮（工具调用、规则裁决）和渲染轮（玩家可见正文）。两轮可以用不同模型：

```bash
FATE_RENDER_MODEL=provider/model-id ./start.sh
```

例如 `FATE_RENDER_MODEL=anthropic/claude-opus-4-5`。未设置时，渲染轮复用结算轮的当前模型；格式错误或模型未注册时会告警并回退。结算轮和渲染轮可以分别选择工具调用更稳定、正文表现更合适的模型。

2026-06-12 的本地盲评覆盖 5 个模型和 2 个 turn，每个 turn 每模型生成 3 轮，每个模型共 6 个样本。脚本见 `scripts/render-bench.ts`。样本量较小，结果只反映当前测试覆盖：

- 结算使用 GPT-5.5、渲染使用 Gemini 3.1 Pro 时，六个样本均分 4.3/5，其中三个为 5 分，且没有触发 lint，输出长度也较稳定。已知问题是结尾可能把伪菜单写进台词，`pseudo-menu-in-dialogue` 规则会拦截这种输出。
- Claude Opus 4.5 的六个样本均完成渲染，均分 3.2，标准差为 0.47，是本次测试中波动最小的模型。
- DeepSeek V4 Pro 在本次测试中速度和缓存表现最好，单轮成本低约一个数量级。但它的盲评得分最低，六个裸渲染样本也都触发了否定反转句式 lint。

双 pass 拆分后，两侧模型都可以先使用 `minimal` 推理档。工具序列和 packet schema 承担了结算侧的部分推理，渲染侧则从 packet 读取已完成的裁决。这通常能减少 token 用量和首 token 延迟。如果 heavy 轮的 packet 质量下降，可只提高结算侧的推理档。

渲染轮还有几个可选设置：

- `FATE_RENDER_TEMPERATURE=0.9` 只作用于渲染和重写调用，结算轮不受影响。默认不传此参数，因为部分模型不支持它，并会导致渲染回退为机械摘要。
- digest writer（前情提要写手）在推理模型上自动使用 `minimal` 档。压缩摘要通常不需要更高推理档。
- `FATE_RENDER_CACHE=long|none` 控制渲染轮的 prompt cache 保留时间，默认为 `short`（Anthropic 5 分钟 TTL，命中后免费续期）。实测 Claude OAuth 渠道不支持 1 小时 TTL；`long` 档会支付 2 倍写入费用，却不会延长保留时间。使用 API key 且渠道支持时再开启。

### 自定义正文 lint 规则

渲染轮结束后会跑一层正则 lint，拦截泄密、Markdown、AI 腔开场白、空泛氛围词、报告句等。默认规则在：

```txt
engine/audit/lint-rules.ts
```

默认规则对应的提示词说明在：

```txt
prompts/render/style-blacklist.md
prompts/render/output-contract.md
```

如果只是玩家本地想加自己的禁词/禁句，不要改源码，建这个文件即可（`prompts/user/` 已被 gitignore）：

```txt
prompts/user/prose-lint.json
```

示例：

```json
{
  "rules": [
    { "id": "local-cliche", "scope": "anywhere", "pattern": "月光如水" },
    { "id": "no-opening-ah", "scope": "opening", "pattern": "^啊" }
  ]
}
```

字段说明：

- `id`：小写字母开头，只用小写字母、数字、`-`、`_`。
- `scope`：`opening`（首个非空行）、`ending`（结尾窗口）、`anywhere`（全文）、`per-line`（逐行）。
- `pattern`：JavaScript 正则字符串；运行时自动加 `g`/`u` flag。

规则命中后渲染器会重写一次；重写后仍命中会在 UI 里告警。未揭示真名/宝具泄密是内置 block 规则，不能用本地配置关闭。

## Local State

首次运行会在项目内创建隔离配置目录：

```txt
.pi/agent/
```

如果没有可用认证，请按 pi 的正常流程登录或配置 provider。

## Tester Notes

- 游玩存档在 `sessions/`。
- `runtime/` 存放运行时状态和 debug export，不是发布内容。
- `.pi/agent/auth.json` 包含本地认证信息，不要分享。
- 后台导演与 showrunner 审计由引擎直接 fork `pi -p` 子进程（ADR 0005 / 0007），不依赖任何子代理框架；其 session 落在 gitignored 的 `.pi/agent/` 树下。

## License

GPL-3.0-or-later. See `LICENSE`. **GPL 仅覆盖代码**（引擎、扩展、工具、提示词框架）。

`world-data/` 目录不适用 GPL：其中是基于 Fate / TYPE-MOON 作品整理的同人设定数据，版权归 TYPE-MOON 及各自权利方所有，仅供非商业同人用途，详见 `world-data/NOTICE.md`。这是同人实验项目。

## Package

```bash
pnpm run pack:release
```

输出在：

```txt
dist/
```

发布包不包含 `node_modules/`、`sessions/`、`runtime/`、`.pi/agent/`、`.pi/npm/`、`prompts/user/`、`docs/` 和 `*.test.ts`。
