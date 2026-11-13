---
title: "Blog repo contract (instruction file, not a post)"
slug: blog-repo-contract
language: zh-CN
description: "本仓库的写作流水线、模型选择与发布门禁。"
tags:
  - 说明
publish: false
---

# ~/repos/blog — 仓库契约

公开站点 `undefined noise`（<https://wxxb789.github.io/>）的内容仓。远端 `wxxb789/wxxb789.github.io`，分支 `main`，GitHub Pages 由 workflow 构建。本文件只约束本仓库内的写稿与发布流程。

## 文件

| 路径 | 作用 |
|---|---|
| `posts/<YYYY-MM-DD>-<slug>.md` | 成稿。frontmatter：`title` `slug` `language: zh-CN` `description`（带引号）`tags`（YAML 列表） |
| `WRITING.md` | 单篇怎么写：表象、内核、句子、自检 |
| `BRIEF.md` | 系列与选题：写几篇、每篇写什么、素材够不够 |
| `publish.config.yaml` | 站点配置（title / origin / exclude） |
| `.publish-set.json` | 发布集，`review` 生成，需提交 |

`WRITING.md` / `AGENTS.md` 自身带 `publish: false`，不进站点。新增说明类文件同样处理。

## 成稿流水线

**执行者：Studio**（owner 2026-11-14；见 `~/claw/bots/studio/AGENTS.md`）。Zoe 负责上游（选题 → 事实清单）
与发布门禁（`git push` 前的核对 + 标题 3 选 1 交 owner）。产线正本：ob-flow `gtd/projects/content-brand/_index.md`。

1. **归集事实**：素材来自 owner 对话、`~/claw/tasks/<date>/<task>/` 下的 run-log / ledger / 报告、ob-flow 笔记。先把数字、时间、命令、事件先后整理成事实清单，每个数字标出处；冲突照实写冲突，不替 owner 择一。
2. **定系列与选题**：按 `BRIEF.md` 确认这一篇承担哪个决定、属于哪个系列、素材够不够、要不要拆篇。三问答不出就停，不写。
3. **写稿**：事实清单 + `BRIEF.md` + `WRITING.md` 全文一起给模型，一次出稿。标题先出 3 个候选（附承诺与兑现表），由 owner 选。
4. **核对**：逐条数字回源比对；跑 `WRITING.md` 第 6 节自检；`markdownlint-cli2` 过一遍。新视角必须能追到 `推断：` 标记。
5. **构建**：commit → `node ~/repos/anc/bin/anc.mjs build --content . --out dist` → 读 `content-report.json`（`dropped` 里只该有配置文件和 `publish: false` 的说明文件）。
6. **发布**：owner 已授权直接推。`git push origin main` 触发 GitHub Pages 部署，用 `gh run watch` 看结论，部署后回读线上页面确认标题与正文。

## 模型

**成稿用单模型三轮：`ghc-proxy-chat/gemini-4-carbon`**（owner 2026-11-12 定）。三轮 = 初稿 → 按逐条清单改 → 定点收紧，每轮都回源核事实。

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
~/claw/tools/pi-run.sh --model ghc-proxy-chat/gemini-4-carbon --thinking low -o draft-v1.md @prompts/40-draft.md
```

**三模型流水线（DeepSeek V4.1 flash / Gemini 4 argon / Gemini 4 carbon + DeepSeek 选版）只用于评审与查错，不用于出稿。** 实测（2026-11-12，同一篇 A 稿两轮对照）它能稳定抓到单模型看不见的四类错：删掉承重证据、数字自相矛盾、承诺式开头、编造材料里没有的出处；但成稿能力不稳——小节数与小句节奏仍不如单模型三轮，且评委自己会把违禁的承诺清单读成「结构感」。命令与产物：`~/claw/tools/blog-three-model.sh --prompt <p> --out <dir>`。

- **凡是要给人读的正文，一律低推理档**（`--thinking low`）：初稿、逐条改、定点收紧、多模型迭代，不分模型、不分轮次。低档交回的句子更顺；档次开高会把文字熬成均匀的算法腔。
- **审计不设档位约束**：事实核验、契约评审、选版判断、查无出处清单，用模型默认档即可（`blog-three-model.sh` 里 `JUDGE_THINKING` 默认空 = 不传 `--thinking`）。审计只出意见与判据，**不许直接生成或改写正文**——改稿必须由走 low 的那一轮做。
- 旧版本此处写的 `--thinking high` 与 skill `writing` 的「低推理档」规则冲突（owner 2026-11-12 把范围从「终稿」扩到「初稿与修订」），已作废。`WRITING.md` 本身没有推理档条款，别去那里找。
- 一律经 `~/claw/tools/pi-run.sh` 调用，**不要裸调 `pi`**：`--no-tools` 下会自己「想去查/去跑命令」的推理模型（实测 `deepseek-v4.1-flash`）可能只产出 thinking 块、没有 text 块，`pi` 打印 **0 字节并 exit 0**——是空回答，不是上游故障。wrapper 加 guard、重试一次、再落兜底模型，全空时退出码 3。细节见 skill `agent-harness-model-gateways` 第 15 条。
- pi / omp 由 mise 安装（`mise which pi`），shims 目录不在默认 PATH，调用前导出或用绝对路径。
- 长 prompt 走 `@file`，单次约 150KB 可用，超长要分段；大附件在 omp 会被截断，那是兜底不是首选。
- 后台跑，等完成通知或 `process_manage wait`，不要前台 sleep 轮询。
- 兜底：`hermes chat --oneshot --query-file <p> -m gemini-4-argon --provider local-chat -t clarify --reasoning low -Q`。

## 发布门禁

- `git push` 会触发 GitHub Pages 部署，属于公开发布。当前 owner 已授权本仓库直接推送；换成别的站点或加新内容域前，仍先问。
- 不提交 `.env`、不 force-push、不改写历史。
- 预览构建与 release 构建不是一回事：`build` 是预览，`build --release` 需要已提交且未变的 `.publish-set.json`。CI 走 release 路径。
