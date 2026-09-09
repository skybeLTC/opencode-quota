[← Back to README](../../README.md)

# Move from v3 to v4

v4 adds clearer quota results, guided custom-provider setup, and JSON export v2. This document is a
historical migration reference; the local-only downstream `update` command does not perform migration.

## Requirements

- OpenCode 1.4.3 or newer
- Node.js 22 or newer

## Before you update

1. Close OpenCode.
2. Back up the OpenCode config files you use:
   - `opencode.json` or `opencode.jsonc`
   - `tui.json` or `tui.jsonc`
   - `opencode-quota/quota-toast.json` or `quota-toast.jsonc`
3. If another app reads `opencode-quota show --json` or `quota-export.json`, review [JSON export v2](external-integration.md#json-basics).
4. Keep provider credentials in OpenCode authentication, global config, or environment variables—not project quota settings.

## Update boundary in this downstream

The local-only build does not install from npm or automatically migrate an upstream installation.
`update` is informational-only:

```bash
opencode-quota update
```

Review and apply any config or cache migration manually in the owning `local-ai` repository.
Restart OpenCode, then run `/quota` and `/quota_status`.

## What may need your attention

### Custom providers

v4 replaces the old `customSources` setting with `quotaProviders`. The old setting is not read or converted automatically.

Use the guided command to add each custom provider:

```bash
opencode-quota provider add
```

It previews the exact global config change and asks before writing. See the [Provider setup guide](providers.md#custom-providers) for full details.

### Gemini CLI in v4.1

Existing `google-gemini-cli` configurations continue to work unchanged in v4.1. The integration is deprecated for new installs and is planned for removal in v5.0.0. OpenCode Quota does not migrate your configuration or authentication and does not silently switch providers.

Google's official Antigravity CLI replaces the individual Gemini CLI experience. Google AI Studio or Vertex AI are the supported choices for third-party access. Within OpenCode Quota, `google-agy` is the suggested successor for quota reporting, but OpenCode Quota's Google integrations are independent and are not endorsed by Google.

If you choose `google-agy`, configure and verify it separately before removing your existing Gemini CLI setup. See [Gemini CLI in the provider guide](providers.md#gemini-cli).

### Apps that read quota JSON

v4 JSON uses schema `version: 2`. It clearly labels quota, usage, spend, budget, balance, and partial failures.

Update any app or script that reads the JSON before depending on v4 output. See [External integration](external-integration.md).

### Alibaba and Qwen custom limits

Built-in limits continue to work. If you changed Alibaba or Qwen limits, add those changes through `quotaProviders`. See [Custom providers](configuration.md#custom-providers).

## Check the update

After restarting OpenCode:

1. Run `/quota` and confirm your providers and values appear.
2. Run `/quota_status` and check for setup or authentication errors.
3. If enabled, check the TUI sidebar, toast, and compact line.
4. If you added a custom provider, confirm its row appears. One failed provider should not hide successful providers.

## Roll back an upstream npm installation to v3

The following steps apply only to an upstream npm installation. They do not describe the local-ai managed deployment.

1. Close OpenCode.
2. Restore the config backup you made before updating.
3. Pin both the server and TUI plugin entries to v3, for example `@slkiser/opencode-quota@3`.
4. Remove v4 `quotaProviders` entries because v3 does not understand them.
5. Restart OpenCode and run `/quota`.

For this local-only downstream, keep `{env:HOME}/local-ai/opencode-satellites/opencode-quota` as the plugin spec; do not replace it with an npm v3 package. Rollback is managed by `local-ai`: use its deployment workflow to select the desired revision, rebuild it, and verify the resulting local deployment. This repository's `opencode-quota update` command is informational-only and does not perform rollback or migration.

An upstream v3 installation does not read v4 cache or custom-provider state. OpenCode Quota can recreate those files if you return to an upstream v4 installation.
