[← Back to README](../../README.md)

# Manual install

這個 downstream build 不使用 public npm installer。Runtime deployment 由 `local-ai` 管理；
`opencode-quota init` 會 fail-closed，且不會寫檔、安裝或 migration。

```bash
opencode-quota init
```

上面的 command 只會顯示管理邊界。若要確認 exact path，請先看
[local-ai downstream 使用說明](local-only.md)。

## Choose where to install

- **Global:** works in every project. Files usually live in `~/.config/opencode`.
- **Project:** works only in the current repo or worktree.
- **Custom:** if `OPENCODE_CONFIG_DIR` is set, use that directory.

Use `.jsonc` files if you want comments. Use `.json` files if another tool requires strict JSON.

## 1. Add the main plugin

Add the local OpenCode Quota package directory to `opencode.jsonc` or `opencode.json`. This is
required for both TUI and Web:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["{env:HOME}/local-ai/opencode-satellites/opencode-quota"],
}
```

Keep any existing plugins and settings.

## 2. Add the TUI plugin

Skip this step if you use Web only.

Add the same local package directory to `tui.jsonc` or `tui.json`. This enables TUI slash commands,
the sidebar, toasts, and the compact line:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["{env:HOME}/local-ai/opencode-satellites/opencode-quota"],
}
```

Keep any existing TUI plugins and settings.

## 3. Add quota settings

Create `opencode-quota/quota-toast.jsonc` beside the OpenCode config for your chosen scope:

```jsonc
{
  // Find providers from OpenCode configuration and authentication.
  "enabledProviders": "auto",

  // Show slash-command results with normal TUI messages.
  "tuiCommandDisplay": "inline",

  // Show the detailed Quota panel in the TUI sidebar.
  "tuiSidebarPanel": {
    "enabled": true,
  },

  // Keep the other automatic TUI displays off.
  "enableToast": false,
  "tuiCompactStatus": {
    "enabled": false,
  },

  // Show bundled maintainer notices on TUI Home.
  "maintainerAnnouncements": {
    "enabled": true,
    "home": true,
  },
}
```

Use `quota-toast.json` instead if you need strict JSON. Remove the comments and trailing commas.

Restart OpenCode, then run:

```text
/quota
/quota_status
```

`/quota_status` shows the exact files OpenCode Quota loaded.

## Change what appears in the TUI

Put these settings in `quota-toast.jsonc`, not `tui.jsonc`.

| You want                    | Setting                                  |
| --------------------------- | ---------------------------------------- |
| Sidebar panel               | `tuiSidebarPanel.enabled: true`          |
| Popup quota notifications   | `enableToast: true`                      |
| Compact quota line          | `tuiCompactStatus.enabled: true`         |
| Quota bar under the prompt  | `tuiPromptBar.enabled: true`             |
| Slash results with messages | `tuiCommandDisplay: "inline"`            |
| Slash results in a popup    | `tuiCommandDisplay: "dialog"`            |
| Manual slash commands only  | Disable sidebar, toast, and compact line |

Web slash commands always appear with messages. TUI popup dialogs and automatic TUI displays are not available in Web.

See [Configuration](configuration.md) for more examples and every setting.

## Update safely

`update` 只顯示 identity 與 deployment owner，不會更新任何檔案或 package：

```bash
opencode-quota update
```

要更新 local runtime，請回到 `local-ai` management repo，完成 source review、commit 與 clean
build；不要從 npm 或遠端 source 安裝。See [Updating safely](updating.md) for the complete local-only
workflow.
