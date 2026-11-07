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
| `WRITING.md` | 写作契约，模型写稿前必读 |
| `publish.config.yaml` | 站点配置（title / origin / exclude） |
| `.publish-set.json` | 发布集，`review` 生成，需提交 |

`WRITING.md` / `AGENTS.md` 自身带 `publish: false`，不进站点。新增说明类文件同样处理。

## 成稿流水线

1. **归集事实**：素材来自 owner 对话、`~/claw/tasks/<date>/<task>/` 下的 run-log / ledger / 报告、ob-flow 笔记。先把数字、时间、命令、事件先后整理成事实清单，每个数字标出处；冲突照实写冲突，不替 owner 择一。
2. **写稿**：事实清单 + `WRITING.md` 全文一起给模型，一次出稿。发散由模型在内部完成（自己比 3 个以上角度，只交最好那版）；owner 要挑角度时才走 `MODE: DIVERGE`。
3. **核对**：逐条数字回源比对；跑 `WRITING.md` 第 8 节自检；`markdownlint-cli2` 过一遍。新视角必须能追到 `推断：` 标记。
4. **构建**：commit → `node ~/repos/anc/bin/anc.mjs build --content ~/repos/blog --out ~/repos/blog/dist` → 读 `content-report.json`（`dropped` 里只该有配置文件和 `publish: false` 的说明文件）。
5. **发布**：owner 已授权直接推。`git push origin main` 触发 GitHub Pages 部署，用 `gh run watch` 看结论，部署后回读线上页面确认标题与正文。

## 模型

**成稿最终输出固定用 `gemini-4-argon`，经 `pi` 调用**。pi 只带 prompt，不带工具定义与会话上下文，指令遵循比走完整 agent 更稳。

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
pi -p --no-tools --no-skills --model ghc-proxy-chat/gemini-4-argon \
  --thinking high @prompt.md > draft.md
```

- pi / omp 由 mise 安装（`mise which pi`），shims 目录不在默认 PATH，调用前导出或用绝对路径。
- 长 prompt 走 `@file`，单次约 150KB 可用，超长要分段；大附件在 omp 会被截断，那是兜底不是首选。
- 后台跑，等完成通知或 `process_manage wait`，不要前台 sleep 轮询。
- 兜底：`hermes chat --oneshot --query-file <p> -m gemini-4-argon --provider local-chat -t clarify --reasoning high -Q`。

## 发布门禁

- `git push` 会触发 GitHub Pages 部署，属于公开发布。当前 owner 已授权本仓库直接推送；换成别的站点或加新内容域前，仍先问。
- 不提交 `.env`、不 force-push、不改写历史。
- 预览构建与 release 构建不是一回事：`build` 是预览，`build --release` 需要已提交且未变的 `.publish-set.json`。CI 走 release 路径。
