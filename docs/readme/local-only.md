[← 回到 README](../../README.md)

# local-ai downstream 使用說明

這個 checkout 是 `local-ai` 管理的 downstream build，不是獨立的 npm deployment。Runtime 只從
`{env:HOME}/local-ai/opencode-satellites/opencode-quota` 載入本地 package directory；不要用 npm、
`npx` 或遠端 package 取代它。

## Runtime identity

使用者可見的 build identity 格式為：

```text
4.9.0-sky.g<恰好 10 碼的小寫 Git SHA>
```

這個值由 clean committed HEAD 的 release tag 與 full Git SHA 產生。tracked `package.json.version`
仍維持 upstream 的 `4.8.2`，不作為 downstream display identity 或 cache compatibility identity。

## Plugin registration

在 OpenCode 的 config 檔中保留原有 plugin，並使用下列 local spec：

```jsonc
{
  "plugin": ["{env:HOME}/local-ai/opencode-satellites/opencode-quota"],
}
```

需要 TUI surface 時，在 TUI config 使用相同 spec。Server 與 TUI 必須分開驗證；不要改動 OpenCode
core loader 或建立 npm/tarball installation。

## CLI ownership

- `opencode-quota show` 與 `opencode-quota status`：讀取本地 runtime data。
- `opencode-quota provider add`：在明確授權下編輯 provider 設定。
- `opencode-quota update`：只顯示 local identity、deployment owner 與 managed path，永不執行
  network、npm、config、package-cache 或 migration mutation。
- `opencode-quota init`：固定 fail-closed；deployment 由 `local-ai` 管理，不會寫檔或安裝 package。

## Cache boundary

Quota provider cache schema 為 v3。persisted identity 使用 stable
`cacheCompatibilityVersion: 1`、provider id 與 cache key；display SHA 改變不會造成不必要的 cache
invalidate。舊 v2 cache 不自動 migration，會安全地 miss 並重新取得資料。

## Maintenance boundary

這個 repo 的第三顆 downstream semantic commit 只處理 local runtime/deployment identity。不要在此
修改 upstream release workflow、建立 GitHub Release、push tag、publish npm，或把 formal
`local-ai` config/cache 納入同一個 commit。
