import { useCallback, useState } from "react";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approvals.css";
import "./styles/composer.css";
import "./styles/diff.css";
import "./styles/debug.css";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { MainHeader } from "./components/MainHeader";
import { Messages } from "./components/Messages";
import { Approvals } from "./components/Approvals";
import { Composer } from "./components/Composer";
import { GitDiffPanel } from "./components/GitDiffPanel";
import { DebugPanel } from "./components/DebugPanel";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useThreads } from "./hooks/useThreads";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useGitStatus } from "./hooks/useGitStatus";
import { useModels } from "./hooks/useModels";
import type { DebugEntry } from "./types";

function App() {
  const [input, setInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);

  const addDebugEntry = useCallback((entry: DebugEntry) => {
    setDebugEntries((prev) => [...prev, entry].slice(-300));
  }, []);

  const handleCopyDebug = async () => {
    const text = debugEntries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload =
          entry.payload !== undefined
            ? typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)
            : "";
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  };

  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    connectWorkspace,
    markWorkspaceConnected,
  } = useWorkspaces({ onDebug: addDebugEntry });

  const gitStatus = useGitStatus(activeWorkspace);
  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
  } = useModels({ activeWorkspace, onDebug: addDebugEntry });

  const resolvedModel = selectedModel?.model ?? null;

  const {
    setActiveThreadId,
    activeThreadId,
    activeMessages,
    approvals,
    threadsByWorkspace,
    threadStatusById,
    removeThread,
    startThread,
    startThreadForWorkspace,
    sendUserMessage,
    handleApprovalDecision,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: selectedEffort,
  });

  useWindowDrag("titlebar");

  async function handleOpenProject() {
    const workspace = await addWorkspace();
    if (workspace) {
      setActiveThreadId(null, workspace.id);
    }
  }

  async function handleAddWorkspace() {
    const workspace = await addWorkspace();
    if (workspace) {
      setActiveThreadId(null, workspace.id);
    }
  }

  async function handleNewThread() {
    if (activeWorkspace && !activeWorkspace.connected) {
      await connectWorkspace(activeWorkspace);
    }
    await startThread();
  }

  async function handleSend() {
    if (!input.trim()) {
      return;
    }
    if (activeWorkspace && !activeWorkspace.connected) {
      await connectWorkspace(activeWorkspace);
    }
    await sendUserMessage(input);
    setInput("");
  }

  return (
    <div className="app">
      <div className="drag-strip" id="titlebar" />
      <Sidebar
        workspaces={workspaces}
        threadsByWorkspace={threadsByWorkspace}
        threadStatusById={threadStatusById}
        activeWorkspaceId={activeWorkspaceId}
        activeThreadId={activeThreadId}
        onAddWorkspace={handleAddWorkspace}
        onSelectWorkspace={setActiveWorkspaceId}
        onConnectWorkspace={connectWorkspace}
        onAddAgent={(workspace) => {
          setActiveWorkspaceId(workspace.id);
          (async () => {
            if (!workspace.connected) {
              await connectWorkspace(workspace);
            }
            await startThreadForWorkspace(workspace.id);
          })();
        }}
        onSelectThread={(workspaceId, threadId) => {
          setActiveWorkspaceId(workspaceId);
          setActiveThreadId(threadId, workspaceId);
        }}
        onDeleteThread={(workspaceId, threadId) => {
          removeThread(workspaceId, threadId);
        }}
      />

      <section className="main">
        {!activeWorkspace && (
          <Home
            onOpenProject={handleOpenProject}
            onAddWorkspace={handleAddWorkspace}
            onCloneRepository={() => {}}
          />
        )}

      {activeWorkspace && (
          <>
            <div className="main-topbar">
              <MainHeader
                workspace={activeWorkspace}
                branchName={gitStatus.branchName || "unknown"}
              />
            <div className="actions">
              <button className="secondary" onClick={handleNewThread}>
                New thread
              </button>
              <button
                className="ghost"
                onClick={() => setDebugOpen((prev) => !prev)}
              >
                Debug
              </button>
            </div>
          </div>

            <div className="content">
              <Messages messages={activeMessages} />
            </div>

            <div className="right-panel">
              <GitDiffPanel
                branchName={gitStatus.branchName || "unknown"}
                totalAdditions={gitStatus.totalAdditions}
                totalDeletions={gitStatus.totalDeletions}
                error={gitStatus.error}
                files={gitStatus.files}
              />
              <Approvals approvals={approvals} onDecision={handleApprovalDecision} />
            </div>

            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              reasoningOptions={reasoningOptions}
              selectedEffort={selectedEffort}
              onSelectEffort={setSelectedEffort}
            />
            <DebugPanel
              entries={debugEntries}
              isOpen={debugOpen}
              onToggle={() => setDebugOpen((prev) => !prev)}
              onClear={() => setDebugEntries([])}
              onCopy={handleCopyDebug}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default App;
