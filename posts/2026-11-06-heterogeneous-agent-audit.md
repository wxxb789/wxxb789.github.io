---
title: "一万行计划没教会 agent 停手，契约教会了"
slug: heterogeneous-agent-audit
language: zh-CN
description: "评审意见不到两百行，我把它扩成上万行的计划；十几份执行报告里超过四分之三写了偏差。兜住那一夜的是 27 行契约里的一条冲突规则：撞上现实就记偏差、保守落地，越界就停手等人。"
tags:
  - agent
  - 工程实践
---

# 一万行计划没教会 agent 停手，契约教会了

凌晨一点半，执行账本 `ledger.jsonl` 的最后一行落下了 `all-done`。每条结束记录都写着 `exit 0`，我随即翻开第二份计划的执行报告。

无人值守的关键，在于给 agent 一条它自己就能判断「停不停」的线。那份计划自带的脚本却在现场漏掉了近百个可用技能，执行者当场改了写法。

那天深夜到次日凌晨，我仗着「三族分立」加一份上万行的计划，才敢让 agent 半夜改配置、修脚本。我当时赌错了方向。

## 当时的判断：以为把计划写死就能让偏差归零

这轮改造采用「三族分立」架构：Gemini 系评审，GLM 系跑被审系统，DeepSeek 系负责落地执行。推断：跨模型族的理解差异能照出配置里的模糊地带，依据是不同模型族对未声明前提的默认补全方向不同。这里有处未验证假设：我默认三族比两族多抓漏洞且未做对照，若两族就够，这一节「三族分立」的判断就不成立。

异族模型交出了一份不到两百行的评审报告，末尾还专门设立了「不建议动的部分」来划定克制边界。可评审报告给的终归是方向判断，非交互 agent 拿到「改为单源编译」这类观点没法直接动手。我当时认定无人值守的变数全来自「没写清楚」，只要把每一步操作都掰碎写死，就能把现场的自由裁量空间压缩到零。

于是我把评审建议拆解成十几份自包含计划，每一份都写满了目标路径、替换代码和验证命令，合在一起足有上万行。

## 现场三幕：当上万行计划撞上真实环境

那晚非交互 agent 串行跑完全部计划，直到凌晨一点半才停下。16 份执行报告落盘后，我逐一核对运行摘要，发现竟有 13 份专门写下了「与计划的偏差」。偏差集中在三类问题：路径不对、计划自带的脚本不可用、改造前快照已过期。推断：计划越细越能提早暴露与真实环境的冲突，依据是计划写死绝对路径与前置检查命令，环境不对就在动手前报错。

第一幕出在第一份计划，执行者刚动手就去核查目标同步脚本 `git-sync-common.sh`。计划要求挂一个按退出码判定成败的监控钩子，执行者读完脚本源码却当场停住了。它在报告里记下原话："sync_fail() in git-sync-common.sh always exit 0 (stdout is the alert, by design). An exit-code-only hook would record every failure as OK."目标同步脚本的 `sync_fail()` 失败分支永远返回 `exit 0`，告警只走标准输出。照计划硬上会把每次同步失败都记成成功。执行者随即放弃退出码方案，改成在启动时快照日志行数，只查本次新增日志行里的 `FAIL(`。

跑第二份计划时，计划自带的反推脚本 `discover_all_host_skills()` 把顶层分类目录（`apple`、`github` 等）和叶子技能名混进同一集合，且 `Path.rglob` 不跟随符号链接。这直接导致 `~/.agents/skills` 下的近百个可用技能全部漏掉，还把一批已归档的失效名字算成可用。执行者继续往下核对时又抓出两处净回归：按计划做整文件覆盖会删掉 `reconcile` 的两层委派与 `drift-check` 的几项检查。它当即把技能扫描改成两层遍历，并用 `hermes skills list --enabled-only` 快照做断言。同时它放弃整文件覆盖，改成新增专注写入器并在 `reconcile` 上加一层。

到了第七份计划，计划要求给每份来源材料计算内容哈希做去重。执行者检查目标仓库时撞上了红线，因为仓库契约明文规定：「内容哈希已于 2026-10-13 全仓退役，Git 即字节一致性层」，禁止重复算哈希。更棘手的是那份计划照着旧目录编写，它要改的角色目录在稍早的重构里已经消失。执行者当场停手，在报告里列出了几条带文件行号的冲突证据。它随后附上几套可选方案及各自代价，把抉择留给我早上醒来只回一个字母。

## 真相：兜住底线的是 27 行执行契约

天亮后复盘日志我才看明白，计划写得再厚，碰上过期的目录快照与永远返回零的同步脚本照样会失真。真正让现场没翻车的，是我塞在每次调用最前面的 27 行执行契约。这份执行契约包含 6 条 Red 禁令，外加「备份 → 修改 → 验证 → 举证」的 Yellow 纪律。契约里最救命的是一条冲突规则：现实与计划冲突时先记录偏差，再按计划意图保守落地，绝不即兴发明破坏性替代方案。

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

那条规则救了现场。前两幕里的执行者正是受它约束，才会在发现计划自带脚本失真后先记下偏差，再按计划意图改用安全写法落地。一旦改动越过保守落地的边界，硬停条款就会锁死后续步骤。

昨晚一共 3 次硬停。除了第七份计划那次真冲突拦截，另外两次碰上领域合并与目录瘦身，执行者都只出待批清单，没动一个文件。

## 判据与动作：什么该让它改，怎样守住停手的线

什么时候让 agent 自己改、什么时候必须停手，有一条清晰的判据。只要改动前能备份、改动后能本地验证、出错有回滚路径，且不违背仓库既有规则，就可以让它自己改。即便现场路径或脚本细节与计划有出入，只要计划意图明确，它也能按 Yellow 纪律边记偏差边完成修补。反过来，凡是触及不可逆动作、撞上仓库既有契约，或者涉及批量数据迁移，就必须触发硬停。越界就必须停手。

要把这条判据落进自动化流程，只需在调用前塞入硬契约与冲突规则，并在运行中留下追加式账本与验证摘要。

追加式账本从备份开始，一对一对记下启动和结束，最后一行是 `all-done`，能看清整晚跑过哪些计划、停在哪一步。但账本里的 `exit 0` 只代表进程没崩溃，遇上永远返回零的同步脚本照样会漏掉假成功。所以账本之外还得要备份路径与验证输出，早上先扫账本，再读偏差摘要。

## 边界：这套流程不便宜，改单个定时任务不值

这套流程并不便宜。它只能保证每次改动都有备份、验证和回滚路径，跑完照样会出现硬停与前置否决。就算执行过程没有翻车，天亮后那些写满现场细节的偏差报告依然得由人逐份读完。前期几轮咨询与事后人工审阅偏差的成本都不低，没法当成设好定时任务就能甩手不管的永动机。

推断：这套重型流程只在改系统基础设施时才划算，依据是咨询与审阅成本不低，只有改一次能用几个月的底座才回本。如果你手头只是要改单个 cron 定时任务，或者修一处孤立的小脚本，上这套重型流程纯属浪费精力。那种单点改动直接人工改完、当场跑通验证就够了。只有当你真要让 agent 在深夜批量改动生产底座时，才值得用契约、冲突规则与账本替它划定这条停手的线。

---

- **上文**：本文是「一张发给 Agent 的工牌」系列入口篇，从无人值守改造的第一道防线写起。
- **下文**：当同步脚本永远以退出码 0 结束时，如何防止定时任务静默停摆，见「失败在无人知晓处」系列。
- **旁支**：为什么靠纯文本账本与文件维持连续性，而不靠模型上下文记事，见「记忆不在上下文里」系列。
