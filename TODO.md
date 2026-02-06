# MiCode ACP Migration TODO

- [x] Fork/clone MiCodeMonitor codebase into current workspace
- [x] Create migration branch `micode/micode-acp-migration`
- [x] Introduce neutral provider/agent settings and compatibility migration
- [x] Implement ACP transport (`micode --experimental-acp`) in backend
- [x] Implement thread/session persistence shim for ACP (`sessions.json`)
- [x] Add ACP->app-server event adapter to preserve frontend contract
- [x] Wire command compatibility layer (keep old invoke names)
- [x] Update frontend types/settings labels to MiCode/Agent naming
- [x] Add tests for ACP mapping and settings migration
- [x] Run available checks and fix regressions (`npm run typecheck`, targeted vitest)
- [ ] Final integration validation and documentation

## Notes
- Rust full `cargo check` is blocked locally by missing `cmake` (required by `whisper-rs` build script).
- Completed checks:
  - `npm run typecheck`
  - `npm test -- src/features/settings/components/SettingsView.test.tsx src/features/home/components/Home.test.tsx src/features/settings/hooks/useAppSettings.test.ts`
- New reliability fix: auto-recreate ACP session and retry on `Session not found` during `turn/start`, and recreate session on `thread/resume`.
- ACP compatibility fix: keep required `mcpServers` in `session/new` and stabilize streaming item IDs per turn to avoid fragmented/missing UI replies.
- Build fix: align ACP update adapter turn index type with `message_index: u64` to restore successful Rust compile.
- UX parity fix: normalize ACP `turn/start` response to always include `result.turn.id` so frontend no longer shows false "Turn failed to start."
- Copy cleanup: replace user-facing "agent" prompts with "MiCode" in messaging/workspace entry points.
- Runtime fix: stop injecting `CODEX_HOME` into MiCode ACP process (use `MICODE_HOME` env key) to prevent prompt hangs in GUI.
- Runtime fix v2: do not inject any home env (`CODEX_HOME`/`MICODE_HOME`) for MiCode ACP by default; align runtime with terminal `micode`.
- Runtime safeguard: add 30s timeout for ACP session/prompt so UI cannot stay in Working indefinitely.
