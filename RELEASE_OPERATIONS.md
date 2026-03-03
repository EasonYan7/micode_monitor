# Release Operations (Windows Updater)

This runbook is the required flow for GUI release and updater publication.

## Scope

- Publish Windows installers to GitHub Release.
- Publish `latest.json` + signatures for Tauri updater.
- Keep release tag, app version, and updater metadata consistent.

## One-time setup

1. Ensure updater keypair exists locally:
   - Private key: `$USERPROFILE\\.tauri\\micode-monitor-updater.key`
   - Public key: `$USERPROFILE\\.tauri\\micode-monitor-updater.key.pub`
2. Configure GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY_B64`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. Ensure `src-tauri/tauri.conf.json` contains the current updater `pubkey`.
4. Ensure workflow exists on remote branch:
   - `.github/workflows/release-windows.yml`
5. Ensure release config exists on remote branch:
   - `src-tauri/tauri.windows.release.conf.json`

## Mandatory checks before tagging

1. Versions must match exactly:
   - `package.json` -> `version`
   - `src-tauri/tauri.conf.json` -> `version`
2. `release-windows.yml` is committed (not just local).
3. `tauri.windows.release.conf.json` is committed (not just local).
4. Working tree has no pending release-critical files.

## Release steps (strict)

1. Commit release changes.
2. Push branch to `origin/windows-main`:

```bash
git push origin HEAD:windows-main
```

3. Create and push tag that matches app version:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. Verify GitHub Actions workflow `Release Windows` succeeded.

## Post-release validation (must pass)

On `Releases -> vX.Y.Z`, assets must include:

1. `latest.json`
2. `MiCode.Monitor_X.Y.Z_x64-setup.exe`
3. `MiCode.Monitor_X.Y.Z_x64-setup.exe.sig`
4. `MiCode.Monitor_X.Y.Z_x64_en-US.msi`
5. (optional) msi `.sig`

`latest.json` must reference the same version `X.Y.Z`.

## Common failure patterns

1. Tag pushed but no release workflow run:
   - Tag points to commit before workflow file existed.
2. `--config ... tauri.windows.release.conf.json` not found:
   - File exists locally but was not committed/pushed.
3. Release tag is `vX.Y.Z` but assets are `0.7.40`:
   - App version files not bumped before tagging.
4. Updater check succeeds but install fails:
   - Pubkey/private key mismatch or stale secret values.

## Key rotation policy

If private key is exposed, rotate immediately:

1. Generate new keypair with `--force`.
2. Update GitHub secrets.
3. Update `pubkey` in `src-tauri/tauri.conf.json`.
4. Release a new version tag.
