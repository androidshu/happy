# Happy NONCODE 与回信异常问题摘要

时间：2026-09-06

## 结论

这次不是 Happy 后端会话死亡，而是两类问题叠加：

1. `apollo-git-flow` 的 NONCODE 判定规则写得太宽，导致“编译脚本里有逻辑”被误判成需要 BUGFIX/FEATURE 和 `issue_id`。
2. Happy 会话仍在执行并持续产生事件，但手机侧通知/显示链路出现 `InvalidCredentials`，所以用户看起来像“发完消息收不到回信”。

## NONCODE 规则问题

实际需求：

- 只改编译、构建、打包、CI 脚本，属于 NONCODE。
- 脚本里即使有条件、循环、流程控制，也仍是脚本改动，不等于正式产品源码功能逻辑。
- 只有修改正式交付源码的功能逻辑时，才要求 BUGFIX/FEATURE 和 `issue_id`。
- 正式交付源码范围包括 `native/`、`sdk-*` 中非 Demo、非测试实现，以及 core 交付源码。
- 混合改动只要包含正式交付源码功能逻辑，就不能因为同时改脚本而归为 NONCODE。

已在 Windows 侧 Apollo-AI 本地改过：

- `D:\Apollo\Apollo-AI\u3player-skills\apollo-git-flow\SKILL.md`

当前状态：该 skill 修正仍是本地 dirty diff，未提交未推送，因此不能算完成交付。

## Happy 会话状态

相关会话：

- session id: `cmtp3n66ohldqzc0urst3clks`
- pid: `54028`
- path: `D:\Apollo\u3player_win-research`
- branch: `feature/windows-shared-build/20260905`
- daemon: active

关键时间线：

- 2026-09-06 15:13:47：用户发送 NONCODE 纠正消息，Happy 日志和 Codex JSONL 均记录收到。
- 2026-09-06 15:14:12：会话回复“编译脚本应按 NONCODE”，并说明要修 skill。
- 2026-09-06 15:15:22：执行了 `apollo-git-flow/SKILL.md` 修改。
- 2026-09-06 15:15:53：回复已修正规则并通过 skill 校验。
- 2026-09-06 15:23:03：Happy 日志出现 `sendSessionNotification failed (kind=done) reason=InvalidCredentials`。
- 2026-09-06 15:23:59：CodexAppServer 仍有 reasoning/item 事件，说明后端仍在跑。

判断：

- 消息接收链路正常。
- Codex 后端执行链路正常。
- 手机推送/显示链路异常，直接证据是 `InvalidCredentials`。
- 不能把它说成会话已死或任务没执行。

## 额外风险

Windows 侧还看到一条残留远端 Mac 验证进程链：

- `powershell.exe` pid `96876`
- `python.exe` pid `55468`
- `ssh.exe` pid `75792`

它从 2026-09-06 15:10 左右启动，日志停在 `start mac_ide`。这可能拖住原会话继续收尾。若要恢复该任务，先决定是否终止这条残留验证链，再继续提交/push Apollo-AI 的 skill 修正。

## 后续建议

1. 先提交并推送 `apollo-git-flow` 的 NONCODE 规则修正，避免新会话继续犯同一类错误。
2. 单独修 Happy 的 `InvalidCredentials` 通知凭据问题；修复前不要把“收不到回信”归因到 Codex 后端卡死。
3. 对残留远端 Mac 验证进程做一次明确处理：终止或继续观察，不要让它悬挂在旧任务里。
