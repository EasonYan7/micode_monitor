# App-Server Events Reference (MiCode `41b4962b0a7f5d73bb23d329ad9bb742545f6a2c`)

This document helps agents quickly answer:
- Which app-server events MiCodeMonitor supports right now.
- Which app-server requests MiCodeMonitor sends right now.
- Where to look in MiCodeMonitor to add support.
- Where to look in `../MiCode` to compare event lists and find emitters.

When updating this document:
1. Update the MiCode hash in the title using `git -C ../MiCode rev-parse HEAD`.
2. Compare MiCode events vs MiCodeMonitor routing.
3. Compare MiCode request methods vs MiCodeMonitor outgoing request methods.
4. Update supported and missing lists below.

## Where To Look In MiCodeMonitor

Primary app-server event source of truth (methods + typed parsing helpers):
- `src/utils/appServerEvents.ts`

Primary event router:
- `src/features/app/hooks/useAppServerEvents.ts`

Event handler composition:
- `src/features/threads/hooks/useThreadEventHandlers.ts`

Thread/turn/item handlers:
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadApprovalEvents.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`

State updates:
- `src/features/threads/hooks/useThreadsReducer.ts`

Item normalization / display shaping:
- `src/utils/threadItems.ts`

UI rendering of items:
- `src/features/messages/components/Messages.tsx`

Primary outgoing request layer:
- `src/services/tauri.ts`
- `src-tauri/src/shared/micode_core.rs`
- `src-tauri/src/micode/mod.rs`
- `src-tauri/src/bin/micode_monitor_daemon.rs`

## Supported Events (Current)

These are the app-server methods currently supported in
`src/utils/appServerEvents.ts` (`SUPPORTED_APP_SERVER_METHODS`) and routed in
`useAppServerEvents.ts`.

- `micode/connected`
- `*requestApproval` methods (matched via
  `isApprovalRequestMethod(method)`; suffix check)
- `item/tool/requestUserInput`
- `item/agentMessage/delta`
- `turn/started`
- `thread/started`
- `thread/name/updated`
- `micode/backgroundThread`
- `error`
- `turn/completed`
- `turn/plan/updated`
- `turn/diff/updated`
- `thread/tokenUsage/updated`
- `account/rateLimits/updated`
- `account/updated`
- `account/login/completed`
- `item/started`
- `item/completed`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/textDelta`
- `item/plan/delta`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/fileChange/outputDelta`
- `micode/event/skills_update_available` (handled via
  `isSkillsUpdateAvailableEvent(...)` in `useSkills.ts`)

## Conversation Compaction Signals (MiCode v2)

MiCode currently exposes two compaction signals:

- Preferred: `item/started` + `item/completed` with `item.type = "contextCompaction"` (`ThreadItem::ContextCompaction`).
- Deprecated: `thread/compacted` (`ContextCompactedNotification`).

MiCodeMonitor status:

- It routes `item/started` and `item/completed`, so the preferred signal reaches the frontend event layer.
- It renders/stores `contextCompaction` items via the normal item lifecycle.
- It no longer routes deprecated `thread/compacted`.

## Missing Events (MiCode v2 Notifications)

Compared against MiCode app-server protocol v2 notifications, the following
events are currently not routed:

- `rawResponseItem/completed`
- `item/mcpToolCall/progress`
- `mcpServer/oauthLogin/completed`
- `deprecationNotice`
- `configWarning`
- `windows/worldWritableWarning`

## Supported Requests (MiCodeMonitor -> App-Server, v2)

These are v2 request methods MiCodeMonitor currently sends to MiCode app-server:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/list`
- `thread/archive`
- `thread/compact/start`
- `thread/name/set`
- `turn/start`
- `turn/interrupt`
- `review/start`
- `model/list`
- `collaborationMode/list`
- `mcpServerStatus/list`
- `account/login/start`
- `account/login/cancel`
- `account/rateLimits/read`
- `account/read`
- `skills/list`
- `app/list`

## Missing Requests (MiCode v2 Request Methods)

Compared against MiCode v2 request methods, MiCodeMonitor currently does not send:

- `thread/unarchive`
- `thread/rollback`
- `thread/loaded/list`
- `thread/read`
- `skills/remote/read`
- `skills/remote/write`
- `skills/config/write`
- `mock/experimentalMethod`
- `mcpServer/oauth/login`
- `config/mcpServer/reload`
- `account/logout`
- `feedback/upload`
- `command/exec`
- `config/read`
- `config/value/write`
- `config/batchWrite`
- `configRequirements/read`
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`
- `item/tool/call`
- `account/chatgptAuthTokens/refresh`

## Where To Look In ../MiCode

Start here for the authoritative v2 notification list:
- `../MiCode/micode-rs/app-server-protocol/src/protocol/common.rs`

Useful follow-ups:
- Notification payload types:
  - `../MiCode/micode-rs/app-server-protocol/src/protocol/v2.rs`
- Emitters / wiring from core events to server notifications:
  - `../MiCode/micode-rs/app-server/src/bespoke_event_handling.rs`
- Human-readable protocol notes:
  - `../MiCode/micode-rs/app-server/README.md`

## Quick Comparison Workflow

Use this workflow to update the lists above:

1. Get the current MiCode hash:
   - `git -C ../MiCode rev-parse HEAD`
2. List MiCode v2 notification methods:
   - `rg -n \"=> \\\".*\\\" \\(v2::.*Notification\\)\" ../MiCode/micode-rs/app-server-protocol/src/protocol/common.rs`
3. List MiCodeMonitor routed methods:
   - `rg -n \"SUPPORTED_APP_SERVER_METHODS\" src/utils/appServerEvents.ts`
4. Update the Supported and Missing sections.

## Quick Request Comparison Workflow

Use this workflow to update request support lists:

1. Get the current MiCode hash:
   - `git -C ../MiCode rev-parse HEAD`
2. List MiCode request methods:
   - `rg -n \"=> \\\".*\\\" \\{\" ../MiCode/micode-rs/app-server-protocol/src/protocol/common.rs`
3. List MiCodeMonitor outgoing requests:
   - `rg -n \"send_request\\(\\\"\" src-tauri/src -g\"*.rs\"`
4. Update the Supported Requests and Missing Requests sections.

## Schema Drift Workflow (Best)

Use this when the method list is unchanged but behavior looks off.

1. Confirm the current MiCode hash:
   - `git -C ../MiCode rev-parse HEAD`
2. Inspect the authoritative notification structs:
   - `rg -n \"struct .*Notification\" ../MiCode/micode-rs/app-server-protocol/src/protocol/v2.rs`
3. For a specific method, jump to its struct definition:
   - Example: `rg -n \"struct TurnPlanUpdatedNotification|struct ThreadTokenUsageUpdatedNotification|struct AccountRateLimitsUpdatedNotification|struct ItemStartedNotification|struct ItemCompletedNotification\" ../MiCode/micode-rs/app-server-protocol/src/protocol/v2.rs`
4. Compare payload shapes to the router expectations:
   - Parser/source of truth: `src/utils/appServerEvents.ts`
   - Router: `src/features/app/hooks/useAppServerEvents.ts`
   - Turn/plan/token/rate-limit normalization: `src/features/threads/utils/threadNormalize.ts`
   - Item shaping for display: `src/utils/threadItems.ts`
5. Verify the ThreadItem schema (many UI issues start here):
   - `rg -n \"enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction\" ../MiCode/micode-rs/app-server-protocol/src/protocol/v2.rs`
6. Check for camelCase vs snake_case mismatches:
   - The protocol uses `#[serde(rename_all = \"camelCase\")]`, but fields are often declared in snake_case.
   - MiCodeMonitor generally defends against this by checking both forms (for example in `threadNormalize.ts` and `useAppServerEvents.ts`), while centralizing method/type parsing in `appServerEvents.ts`.
7. If a schema change is found, fix it at the edges first:
   - Prefer updating `src/utils/appServerEvents.ts`, `useAppServerEvents.ts`, and `threadNormalize.ts` rather than spreading conditionals into components.

## Notes

- Not all missing events must be surfaced in the conversation view; some may
  be better as toasts, settings warnings, or debug-only entries.
- For conversation view changes, prefer:
  - Add method/type support in `src/utils/appServerEvents.ts`
  - Route in `useAppServerEvents.ts`
  - Handle in `useThreadTurnEvents.ts` or `useThreadItemEvents.ts`
  - Update state in `useThreadsReducer.ts`
  - Render in `Messages.tsx`
- `turn/diff/updated` is routed in `useAppServerEvents.ts` but currently has no
  downstream handler wired in `useThreadEventHandlers.ts`.
