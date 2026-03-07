// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartupEnvironmentGate } from "./StartupEnvironmentGate";
import type { AppSettings, StartupEnvironmentStatus } from "../../../types";
import {
  environmentCheckStartup,
  environmentGetCachedStatus,
  environmentInstallDependency,
  environmentRetryCheck,
  getAppSettings,
} from "../../../services/tauri";

vi.mock("../../../services/tauri", () => ({
  getAppSettings: vi.fn(),
  environmentCheckStartup: vi.fn(),
  environmentGetCachedStatus: vi.fn(),
  environmentInstallDependency: vi.fn(),
  environmentRetryCheck: vi.fn(),
}));

const getAppSettingsMock = vi.mocked(getAppSettings);
const environmentCheckStartupMock = vi.mocked(environmentCheckStartup);
const environmentGetCachedStatusMock = vi.mocked(environmentGetCachedStatus);
const environmentInstallDependencyMock = vi.mocked(environmentInstallDependency);
const environmentRetryCheckMock = vi.mocked(environmentRetryCheck);

function buildStatus(overrides: Partial<StartupEnvironmentStatus> = {}): StartupEnvironmentStatus {
  return {
    overallStatus: "ready",
    canProceed: true,
    blocking: false,
    checks: [
      {
        id: "node",
        label: "Node.js",
        required: true,
        status: "ready",
        detectedVersion: "v22.0.0",
        summary: "Node.js is available.",
        technicalDetails: null,
        recommendedAction: null,
        canAutoInstall: false,
      },
      {
        id: "micode",
        label: "MiCode CLI",
        required: true,
        status: "ready",
        detectedVersion: "1.0.0",
        summary: "MiCode CLI is available.",
        technicalDetails: null,
        recommendedAction: null,
        canAutoInstall: false,
      },
      {
        id: "appServer",
        label: "ACP app-server",
        required: true,
        status: "ready",
        detectedVersion: null,
        summary: "ACP app-server initialized.",
        technicalDetails: null,
        recommendedAction: null,
        canAutoInstall: false,
      },
      {
        id: "python",
        label: "Python",
        required: true,
        status: "ready",
        detectedVersion: "Python 3.12.0",
        summary: "Python is available.",
        technicalDetails: null,
        recommendedAction: null,
        canAutoInstall: false,
      },
    ],
    lastCheckedAt: Date.now(),
    micodeBin: null,
    micodeArgs: null,
    ...overrides,
  };
}

describe("StartupEnvironmentGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppSettingsMock.mockResolvedValue({
      language: "zh",
      agentBin: null,
      micodeBin: null,
      agentArgs: null,
      micodeArgs: null,
    } as AppSettings);
    environmentGetCachedStatusMock.mockResolvedValue(null);
    environmentRetryCheckMock.mockResolvedValue(buildStatus());
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders children after startup checks pass", async () => {
    environmentCheckStartupMock.mockResolvedValue(buildStatus());

    render(
      <StartupEnvironmentGate>
        <div>app ready</div>
      </StartupEnvironmentGate>,
    );

    await waitFor(
      () => {
        expect(screen.getByText("app ready")).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(environmentInstallDependencyMock).not.toHaveBeenCalled();
  });

  it("auto-installs a missing dependency before rendering children", async () => {
    environmentCheckStartupMock.mockResolvedValue(
      buildStatus({
        overallStatus: "manual_action_required",
        canProceed: false,
        blocking: true,
        checks: buildStatus().checks.map((check) =>
          check.id === "node"
            ? {
                ...check,
                status: "failed",
                detectedVersion: null,
                summary: "Node.js is missing.",
                recommendedAction: "Install Node.js.",
                canAutoInstall: true,
              }
            : check,
        ),
      }),
    );
    environmentInstallDependencyMock.mockResolvedValue(buildStatus());

    render(
      <StartupEnvironmentGate>
        <div>app ready</div>
      </StartupEnvironmentGate>,
    );

    await waitFor(() => {
      expect(environmentInstallDependencyMock).toHaveBeenCalledWith("node", null, null);
    });
    await waitFor(
      () => {
        expect(screen.getByText("app ready")).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it("shows optional development hints without blocking the app", async () => {
    environmentCheckStartupMock.mockResolvedValue(
      buildStatus({
        checks: [
          ...buildStatus().checks,
          {
            id: "msvcLinker",
            label: "MSVC linker",
            required: false,
            status: "failed",
            detectedVersion: null,
            summary: "link.exe is missing in this shell.",
            technicalDetails: "Run `where link` in PowerShell.",
            recommendedAction: "Install Visual Studio Build Tools 2022.",
            canAutoInstall: false,
          },
        ],
      }),
    );

    render(
      <StartupEnvironmentGate>
        <div>app ready</div>
      </StartupEnvironmentGate>,
    );

    await waitFor(
      () => {
        expect(screen.getByText("app ready")).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});
