---
title: "一万行计划没让偏差归零，二十七行契约划出了停手线"
slug: heterogeneous-agent-audit
language: zh-CN
description: "把评审报告扩成 10,866 行计划，仍有 13 份在现场改道；真正划出「agent 自己改」与「停下问人」边界的，是那份 27 行执行契约。"
tags:
  - agent
  - 工程实践
---

# 一万行计划没让偏差归零，二十七行契约划出了停手线

「`sync_fail()` 的失败分支永远以退出码 0 结束。」这是 plan-01 现场读到的同步脚本。告警只走标准输出，谁拿退出码判成败，谁就把同步失败记成成功。这篇划的正是这条线：哪些偏差让 agent 自己改完，哪些必须停下问人。

2026-11-03 深夜到 11-04 凌晨，我让非交互 agent 对自己那套系统做了一轮无人值守改造。16 份计划串行跑完。执行从 23:13:51 到 01:35:10，总耗时 2 小时 21 分。账本 ledger.jsonl 记了 34 行。里面是 1 条 pre-backup、16 条 start、16 条 end，退出码全是 0，末尾 1 条 all-done。

```json
{"ts":"2026-11-03T23:15:10+08:00","event":"start","plan":"plan-01"}
{"ts":"2026-11-03T23:20:53+08:00","event":"end","plan":"plan-01","exit":0}
```

账本本身没有问题。每次 start 与 end 各追加一行 JSON，带时间戳和退出码。跑完用一段 Python 统计启动数与非零退出数就够了：

```python
import json
rows = [json.loads(l) for l in open("ledger.jsonl")]
start = sum(1 for r in rows if r["event"] == "start")
bad = sum(1 for r in rows if r["event"] == "end" and r.get("exit") != 0)
print(f"plans={start} nonzero_exit={bad}")
```

问题在于 16 个 exit 0 只说明验证跑过、证据留了。结果分布是 DONE 13 份、DONE-WITH-CHECKPOINT 2 份、BLOCKED-WITH-CHECKPOINT 1 份。16 份 summary 里有 13 份写了「与计划的偏差」。只有 plan-05、plan-07、plan-15 三份是零偏差。

## 同族自审会顺着你的假设走，异族评审只认写下来的现状

让同族模型审查你的 agent 配置，多半只能换回一句「这套设计很扎实」。它和你共用同一批上下文，你的隐含前提会直接变成它的默认前提。

异族评审换的是模型族：Gemini 系负责评审，GLM 系跑被审系统，DeepSeek 系负责落地执行。三个模型族互不熟悉对方的写法，于是「它居然这么理解」本身就是诊断信号。推断：跨模型族的理解差异能照出配置里的模糊地带。依据是不同模型族对未声明前提的默认补全方向不同。

但我默认三个模型族比两个能多抓出配置漏洞，这条没做过对照。若两个模型族就够用，本节「评审、被审、执行三族分立」的结论就不成立，落地执行直接复用评审模型族即可。

评审报告 199 行，分 6 个板块，末尾专设「不建议动的部分」，直接点名哪些属于过度设计。请求里塞了这份输出契约：

```yaml
# 评审请求的输出契约（节选）
output:
  - 系统级诊断：哪些设计应坚持，哪些是过度设计或脆弱点
  - top_5: 问题 → 根因 → 具体改法（落到 config/skill/cron/流程层）→ 收益 → 风险
  - 专项: 稳定性 / 记忆体系 / owner 效率
  - pushback: 明确列出"不该动"的设计及理由
constraints:
  - 直接、具体、可执行；反对意见必须说
  - 简体中文；不写客套与空泛扩展
```

报告给的是方向。像「改为单源编译」这种判断，非交互 agent 拿在手里没法直接动工。

## 我给的是五十五倍篇幅，以为偏差会归零

评审建议被我扩成 16 份自包含计划，每份要求 9 个字段，清单如下：

```text
1. 目标与验收标准（可验证的 DONE WHEN）
2. 影响面清单：每个新建/修改/删除文件的绝对路径 + 当前状态
3. 前置检查：动手前必须跑的只读命令
4. 备份步骤：具体命令与目标目录
5. 分步执行：每步给出具体内容/代码块/diff，关键脚本给完整可运行代码
6. 验证步骤：每项检查的命令与预期输出
7. 回滚方案：具体命令
8. 门禁级别 + OWNER-CHECKPOINT 标记
9. 失败隔离：哪步失败应中止，哪步失败可跳过并记录
```

首批 14 份共 10,866 行（2715 + 3487 + 2418 + 2246）。单份平均 776 行，相对 199 行的报告放大了 55 倍。当时推迟的两条建议，后来补成 plan-15 与 plan-16，各 46 行。

我当时的判断：计划写到这个粒度，agent 就能在现场照单全收，偏差归零。这个判断错在假定静态计划能覆盖动态现场，漏掉了计划自带脚本的缺陷，也漏掉了改造前快照会在执行中途过期。

推断：计划写得越细，越能提早暴露计划与真实环境的冲突。依据是计划写死了绝对路径与前置检查命令，环境不对就在动手前报错。

## 十三份偏差报告里的现场，比计划更像真实系统

偏差集中在三类：路径不对、计划自带的脚本不可用、改造前快照已过期。

plan-01 改的是判定方式。执行者放弃按退出码判定，改成启动时快照日志行数，只检查本次新增行里有没有 `FAIL(`。理由与开头那句同源：sync_fail() 永远 exit 0，退出码全绿不代表链路是通的。

plan-02 的计划自带反推脚本同样不能用。`discover_all_host_skills()` 把顶层分类目录（apple、github…）和叶子技能名混在同一个集合里。`Path.rglob` 遍历不跟随符号链接，~/.agents/skills 下的 90 个可用技能全部漏掉。它还会把 56 个已归档的失效名字算成「可用技能」。

执行者现场改成两层遍历，并用 hermes skills list --enabled-only 的快照做断言。同一份计划还有两处修正。整文件覆盖会删掉 reconcile 的两层委派，也会删掉 drift-check 的 5 项检查，属于净回归。它的做法是新增一个专注写入器，在 reconcile 里加一层。

全程 3 次硬停：1 次真冲突拦截（plan-07），2 次批量迁移待批。

plan-07 要给每份来源材料算 SHA256 去重，而且照着旧目录编写。目标仓库契约明文规定「内容哈希已于 2026-10-13 全仓退役，Git 即字节一致性层」，禁止重复算哈希；它要改的角色目录，同晚稍早的重构里已经消失。执行者列了 5 条带文件行号的冲突证据，附 3 个可选方案及代价，然后停手。人只需回一个字母。

两次迁移硬停都只出清单、不动数据。领域合并产出 81 个文件移动项，跨 74 个文件，整理出 132 处链接改写清单；目录瘦身给出 30 篇入口索引候选。

还有一份计划要给 1067 篇文档做目录瘦身，门槛是「正文短于 400 字 + 零入链 + 超过 120 天未改」。前置检查实测最短正文 479 字符，三条规则全零命中，计划在动手前被自己的前置检查证伪，当场中止。

## 二十七行契约划的是一条线，不是一个流程

执行者能在现场修补脚本又不越界，靠的是那份 27 行执行契约。它把不可逆操作用 6 条 Red 禁令钉死，把可逆改动收进「备份 → 修改 → 验证 → 举证」的 Yellow 纪律。原文如下：

```markdown
# Execution Contract — Hard Constraints (read first, non-negotiable)

You are an autonomous executor applying ONE approved improvement plan to a production personal AI-agent system. Follow the plan exactly; if reality contradicts the plan (file missing, already applied, path differs), record the discrepancy in your summary, apply the plan's intent conservatively, and never improvise destructive alternatives.

## Absolute prohibitions (Red — stop and report instead)

1. NEVER modify anything under `~/.hermes/hermes-agent/` (hermes core source). Fixes land only in config/scripts/skills.
2. NEVER restart the gateway, touch systemd, kill hermes/gateway processes, or run `hermes update`.
3. NEVER touch credentials, API keys, tokens, or `.env` files (read-only reference is fine).
4. NEVER publish externally, send messages to any channel, or post on behalf of the owner. (Writing local files and running local verification only.)
5. NEVER force-push, rewrite git history, or delete session data / memory databases / git history.
6. NEVER delete or overwrite a file without backing it up first.

## Required discipline (Yellow — backup → edit → verify → proof)

- Before ANY edit: copy the original to `~/claw/tasks/2026-11-03/gemini-improvement-execution/backups/<plan-name>/` preserving relative paths.
- Git-as-sync repos: `~/repos/nana-research` may be committed+pushed (first `git pull --ff-only`, then commit with a clear message, then push; never `reset --hard` a dirty tree). `~/repos/thoughtscape` (ob-flow): edit the working tree ONLY, never commit/push (the [ops] repo auto-sync cron commits).
- Other repos: no commits.
- After each edit: run the plan's verification command. After ob-flow edits: ensure `.harness` checks pass locally (or the 2h sync will wedge — check `python3 .harness/harness.py` per the plan).
- OWNER-CHECKPOINT steps: prepare the list/diff/draft, write it to `~/claw/tasks/2026-11-03/gemini-improvement-execution/owner-checkpoints/<plan-name>.md`, then STOP that plan's remaining gated steps. Non-gated steps may continue.

## Output requirements

- Work log: append what you did to `~/claw/tasks/2026-11-03/gemini-improvement-execution/run-logs/<plan-name>.summary.md` (created/modified/deleted files with paths, verification command outputs, rollback paths).
- Final reply: short report — DONE / DONE-WITH-CHECKPOINT / BLOCKED(reason) / SKIPPED(reason), plus the 3 most important facts.
- If a step fails twice with the same approach: stop that approach, record it, continue only if the plan's failure-isolation section allows.
- Use absolute paths. No interactive input. Idempotent steps preferred.
```

禁令之外，救命的是一段冲突规则。现实与计划冲突时，先记录偏差，再按计划意图保守落地，绝不即兴发明破坏性替代方案。

这条规则直接给出边界判据。计划意图没变、不碰 Red 禁令、本地验证能过，就让 agent 备份后自己改完。plan-01 和 plan-02 都走这条路。计划意图与仓库契约冲突（如 plan-07）时，只写证据清单。命中 OWNER-CHECKPOINT 的批量迁移也一样。然后停手，等人回话。

这套重型流程不保证改造成功。它只保证每次改动都有备份、验证和回滚路径，跑完照样出现硬停与前置否决。留下的 13 份偏差报告还得人工逐份审阅，四轮咨询加事后审阅的成本都不低。

推断：这套重型改造流程只在改系统基础设施时才划算。依据是咨询与审阅的成本不低，只有改一次能用几个月的底座才回本，改单个定时任务纯属亏本。

---

- **上文**：本文是「一张发给 Agent 的工牌」系列入口篇，从无人值守改造的第一道防线写起。
- **下文**：当同步脚本永远以退出码 0 结束时，如何防止定时任务静默停摆，见「失败在无人知晓处」系列。
- **旁支**：为什么靠纯文本账本与文件维持连续性，而不靠模型上下文记事，见「记忆不在上下文里」系列。
