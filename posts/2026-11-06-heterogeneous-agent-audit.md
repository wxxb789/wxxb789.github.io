---
title: "一万行计划没教会 agent 停手，契约教会了"
slug: heterogeneous-agent-audit
language: zh-CN
description: "评审意见不到两百行，我把它扩成了上万行的计划；十几份执行报告里，超过四分之三写了偏差。那一夜靠的是 27 行契约里的一条冲突规则：现实和计划对不上就记偏差、保守落地，越界就停手等人。"
tags:
  - agent
  - 工程实践
---

# 一万行计划没教会 agent 停手，契约教会了

凌晨一点半，执行账本 `ledger.jsonl` 的最后一行写下了 `all-done`，每条结束记录都是 `exit 0`。我接着翻开第二份计划的执行报告：计划自带的脚本在现场漏掉了近百个可用技能，执行者自己改了写法。

那天深夜到次日凌晨，我仗着「三族分立」加一份上万行的计划，才敢让 agent 半夜改配置、修脚本，这一把我赌错了方向。无人值守要的是一条 agent 自己就能判断「停不停」的线，而那一夜这条线不是计划给的。

## 当时的判断：以为把计划写死就能不出偏差

这轮改造按「三族分立」分工：Gemini 系做评审，GLM 系跑被审的系统，DeepSeek 系负责落地执行。这么分，是因为不同模型族对没写明的前提，默认补全的方向不同，跨族的理解差异能照出配置里含糊的地方。这一点没做过对照：我默认三族比两族多抓漏洞，如果两族就够，这一节「三族分立」的判断就不成立。

异族模型交出的评审报告不到两百行，末尾还单列了一节「不建议动的部分」，说明哪些地方不该碰。可评审报告给的终归是方向判断，非交互 agent 拿到「改为单源编译」这类意见没法直接动手。我当时认定无人值守的变数全来自「没写清楚」，只要把每一步操作都拆碎写死，现场就没有自由裁量的余地。

于是我把评审建议拆成十几份自包含的计划，每一份都写满了目标路径、替换代码和验证命令，合起来上万行。

## 那一夜的三份执行报告

那晚非交互 agent 串行跑完全部计划，到凌晨一点半才停。16 份执行报告落盘后，我逐份核对运行摘要，有 13 份专门写了「与计划的偏差」。偏差集中在三类：路径不对、计划自带的脚本不能用、改造前的快照已经过期。计划写得细也有一个作用：它写死了绝对路径和前置检查命令，环境不对就会在动手前报错，所以计划越细，和真实环境的冲突多半暴露得越早。

先看第一份计划。执行者一动手就去查目标同步脚本 `git-sync-common.sh`，计划要求在上面挂一个按退出码判定成败的监控钩子，执行者读完脚本源码，没有照做。它在报告里记下原话："sync_fail() in git-sync-common.sh always exit 0 (stdout is the alert, by design). An exit-code-only hook would record every failure as OK."目标同步脚本的 `sync_fail()` 失败分支永远返回 `exit 0`，告警只走标准输出，而按退出码判定的钩子只认[Bash 手册里「0 即成功」的退出状态约定](https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html)，照计划做会把每次同步失败都记成成功。执行者放弃了退出码方案，改成启动时先快照日志行数，只查本次新增的日志行里有没有 `FAIL(`。

跑第二份计划时，计划自带的反推脚本 `discover_all_host_skills()` 把顶层分类目录（`apple`、`github` 等）和叶子技能名混进了同一个集合，而 `Path.rglob` 展开 `**` 时默认不跟随符号链接，见 [Python 文档里 `rglob` 的 `recurse_symlinks` 参数](https://docs.python.org/3/library/pathlib.html#pathlib.Path.rglob)。结果 `~/.agents/skills` 下的近百个可用技能全部漏掉，一批已归档的失效名字反倒算成了可用。执行者往下核对，又查出两处净回归：按计划做整文件覆盖，会删掉 `reconcile` 的两层委派和 `drift-check` 的几项检查。它把技能扫描改成两层遍历，用 `hermes skills list --enabled-only` 的快照做断言；整文件覆盖也不做了，改成新增一个专门的写入器，在 `reconcile` 上加一层。

到了第七份计划，计划要求给每份来源材料算内容哈希来去重。执行者检查目标仓库时发现，仓库契约里明文写着：「内容哈希已于 2026-10-13 全仓退役，Git 即字节一致性层」，不许再重复算哈希。另外，那份计划是照着旧目录写的，它要改的角色目录在稍早的重构里已经没了。执行者停了手，在报告里列出几条带文件行号的冲突证据，附上几套可选方案和各自的代价，把选择留给我，早上醒来只需回一个字母。

## 兜住现场的是 27 行执行契约

天亮后复盘日志，我才看明白：计划写得再厚，碰上过期的目录快照和永远返回零的同步脚本，照样会失真。现场没出事，靠的是我塞在每次调用最前面的 27 行执行契约。这份契约里有 6 条 Red 禁令，外加「备份 → 修改 → 验证 → 举证」的 Yellow 纪律。其中最关键的是一条冲突规则：现实和计划冲突时，先记录偏差，再按计划意图保守落地，不即兴发明破坏性的替代方案。

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

前两份计划里，执行者发现计划自带的脚本不对，都是先记下偏差，再按计划意图换安全的写法落地，走的就是这条规则。改动一旦超出保守落地的范围，硬停条款会挡住后续步骤。昨晚一共 3 次硬停：一次是第七份计划那次真冲突，另外两次碰上领域合并和目录瘦身，执行者都只交了待批清单，一个文件也没动。

## 判据：什么让它自己改，什么时候停手

改动前能备份、改动后能本地验证、出错有回滚路径，并且不违背仓库已有的规则，就让 agent 自己改。现场的路径或脚本细节和计划对不上，只要计划意图明确，它也能按 Yellow 纪律一边记偏差一边修完。反过来，碰上不可逆的动作、和仓库已有的契约冲突，或者涉及批量数据迁移，就硬停，越界就停手。

落到自动化流程里，就是调用前塞进硬契约和冲突规则，运行中留下追加式账本和验证摘要。

追加式账本按 [JSON Lines 格式规范](https://jsonlines.org/)一行记一条 JSON。它从备份开始，一对一对记下启动和结束，最后一行是 `all-done`，能看清整晚跑过哪些计划、停在哪一步。不过账本里的 `exit 0` 只说明进程没崩，碰上永远返回零的同步脚本，假成功照样漏过去。所以账本之外还要有备份路径和验证输出，早上先扫账本，再读偏差摘要。

## 边界：这套流程不便宜，改单个定时任务不值

它只保证每次改动都有备份、验证和回滚路径，跑完照样会有硬停和前置否决。就算执行过程没出事，天亮后那些写满现场细节的偏差报告还得人逐份读完。前期几轮咨询和事后审阅偏差的成本都不低，没法设好定时任务就撒手不管。

所以这套重型流程多半只在改系统基础设施时才划算：咨询和审阅的成本摆在那里，只有改一次能用几个月的底座才回本。如果手头只是改单个 cron 定时任务，或者修一处孤立的小脚本，上这套流程不值，直接人工改完、跑通验证就够了。要让 agent 在深夜批量改动生产底座，才值得用契约、冲突规则和账本替它划出这条停手的线。

---

- **上文**：本文是「一张发给 Agent 的工牌」系列入口篇，从无人值守改造的第一道防线写起。
- **下文**：[修完一周后，越界从文件挪到了字段](/notes/agent-wrote-outside-its-surface/)，同一系列的下一篇：契约立住之后，执行者的越界怎么从写错文件变成多改字段。
- **旁支**：[账本只能证明有人申报过](/notes/ledger-only-proves-a-claim/)，本文账本里的 `exit 0` 为什么证明不了活干完了，以及怎样把产物指纹写进同一条记录。
