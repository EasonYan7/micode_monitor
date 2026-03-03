# Windows Release and Auto-Update

This project now supports Tauri updater on Windows without a Windows code-signing certificate.

## One-time setup

1. Generate updater signing keys locally:

```powershell
npx tauri signer generate --ci -w "$env:USERPROFILE\.tauri\micode-monitor-updater.key" -p "<your-password>"
```

2. Keep these files safe:
- Private key: `$env:USERPROFILE\.tauri\micode-monitor-updater.key` (secret)
- Public key: `$env:USERPROFILE\.tauri\micode-monitor-updater.key.pub` (already committed into `src-tauri/tauri.conf.json`)

3. Add GitHub repo secrets:
- `TAURI_SIGNING_PRIVATE_KEY_B64`: base64 of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password used at key generation

Example to produce `TAURI_SIGNING_PRIVATE_KEY_B64` on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.tauri\micode-monitor-updater.key"))
```

## Release flow

1. Bump version in:
- `package.json`
- `src-tauri/tauri.conf.json`

2. Commit and push.

3. Create and push tag:

```powershell
git tag v0.7.41
git push origin v0.7.41
```

4. GitHub Action `Release Windows` will:
- Build Windows installers
- Build updater artifacts and signatures
- Generate `latest.json`
- Create/update GitHub Release and upload assets

## Update behavior for installed users

- App checks for updates on startup.
- If a new release is available, toast shows update action.
- App downloads, installs, and relaunches.

## Notes

- No Windows OV/EV code-signing certificate is required for functionality.
- Without Windows code-signing, users may still see SmartScreen/unknown publisher prompts.
