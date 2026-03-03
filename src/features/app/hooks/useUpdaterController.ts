import { useCallback, useRef } from "react";
import { useAgentSoundNotifications } from "../../notifications/hooks/useAgentSoundNotifications";
import { useAgentSystemNotifications } from "../../notifications/hooks/useAgentSystemNotifications";
import { useWindowFocusState } from "../../layout/hooks/useWindowFocusState";
import { playNotificationSound } from "../../../utils/notificationSounds";
import { sendNotification } from "../../../services/tauri";
import type { DebugEntry } from "../../../types";
import { useUpdater } from "../../update/hooks/useUpdater";
import { useTauriEvent } from "./useTauriEvent";
import { subscribeUpdaterCheck } from "../../../services/events";

type Params = {
  notificationSoundsEnabled: boolean;
  systemNotificationsEnabled: boolean;
  getWorkspaceName?: (workspaceId: string) => string | undefined;
  onThreadNotificationSent?: (workspaceId: string, threadId: string) => void;
  onDebug: (entry: DebugEntry) => void;
  successSoundUrl: string;
  errorSoundUrl: string;
};

export function useUpdaterController({
  notificationSoundsEnabled,
  systemNotificationsEnabled,
  getWorkspaceName,
  onThreadNotificationSent,
  onDebug,
  successSoundUrl,
  errorSoundUrl,
}: Params) {
  const { state: updaterState, startUpdate, dismiss: dismissUpdate, checkForUpdates } =
    useUpdater({ onDebug });
  const isWindowFocused = useWindowFocusState();
  const nextTestSoundIsError = useRef(false);

  useAgentSoundNotifications({
    enabled: notificationSoundsEnabled,
    isWindowFocused,
    onDebug,
  });

  useAgentSystemNotifications({
    enabled: systemNotificationsEnabled,
    isWindowFocused,
    getWorkspaceName,
    onThreadNotificationSent,
    onDebug,
  });

  const handleTestNotificationSound = useCallback(() => {
    const useError = nextTestSoundIsError.current;
    nextTestSoundIsError.current = !useError;
    const type = useError ? "error" : "success";
    const url = useError ? errorSoundUrl : successSoundUrl;
    playNotificationSound(url, type, onDebug);
  }, [errorSoundUrl, onDebug, successSoundUrl]);

  const handleTestSystemNotification = useCallback(() => {
    if (!systemNotificationsEnabled) {
      return;
    }
    void sendNotification(
      "Test Notification",
      "This is a test notification from Agent Monitor.",
    ).catch((error) => {
      onDebug({
        id: `${Date.now()}-client-notification-test-error`,
        timestamp: Date.now(),
        source: "error",
        label: "notification/test-error",
        payload: error instanceof Error ? error.message : String(error),
      });
    });
  }, [onDebug, systemNotificationsEnabled]);

  useTauriEvent(subscribeUpdaterCheck, () => {
    void checkForUpdates({ announceNoUpdate: true });
  });

  return {
    updaterState,
    startUpdate,
    dismissUpdate,
    handleTestNotificationSound,
    handleTestSystemNotification,
  };
}
