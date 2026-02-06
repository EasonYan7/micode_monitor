# MiCode ACP Migration TODO

- [x] Fork/clone CodexMonitor codebase into current workspace
- [x] Create migration branch `codex/micode-acp-migration`
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
