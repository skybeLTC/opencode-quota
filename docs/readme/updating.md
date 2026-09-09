[← Back to README](../../README.md)

# Updating safely

## Local-only ownership

這個 downstream build 的 `update` 是 informational-only。Deployment owner 是 `local-ai`，managed
plugin path 是 `{env:HOME}/local-ai/opencode-satellites/opencode-quota`。

Command 只顯示 local identity 與 ownership；不會解析 npm、不會 network fetch，也不會修改 config、
package cache、credentials 或 migration state。

## Inspect identity

```bash
opencode-quota update
```

`--dry-run` 與 `--yes` 為 compatibility flags，但同樣不會產生 mutation：

```bash
opencode-quota update --dry-run
opencode-quota update --yes
```

需要更新 runtime 時，請在 `local-ai` management repo review source、建立 commit，並從 clean
committed HEAD 重新 build；不要使用 npm 或遠端 package 取代 managed path。

## 不會發生的事

`update` 不會：

- 安裝、更新或解析 npm package。
- 讀取、列印、複製、刪除 credentials。
- 寫入 OpenCode config 或 quota sidecar。
- 刪除或重建 package cache。
- 做 v2 cache、display setting 或 plugin path migration。

舊版 upstream updater implementation 可留在 source tree 作為 inactive reference，但 CLI 不會呼叫它。

## Exit code

- `0`：identity inspection 完成，或 accepted compatibility flags 完成。
- `1`：參數不合法，或 `init` 被 local-only deployment guard 拒絕。

`opencode-quota init` 永遠 fail-closed；請參考 [local-ai downstream 使用說明](local-only.md)。

## Manual provider and credential work

`opencode-quota status` 只提供診斷資訊。Provider 設定、credentials 與 migration 必須由 owning
`local-ai` repo 或使用者明確授權的 config 管理流程處理；不要把 credential value 貼到 command
output、issue 或 support message。Provider-specific guidance 請看
[Troubleshooting](troubleshooting.md) 與 [Providers](providers.md)。
