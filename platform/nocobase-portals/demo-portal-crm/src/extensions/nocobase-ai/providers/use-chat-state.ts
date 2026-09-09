import { useCallback, useSyncExternalStore } from "react";
import type { Chat } from "@ai-sdk/react";
import type { AIChatMessage } from "./types";

const MESSAGES_THROTTLE_MS = 32;
const EMPTY_MESSAGES: AIChatMessage[] = [];
const IDLE_STATUS = "ready" as const;

export type AIChatSnapshotStatus =
  | "submitted"
  | "streaming"
  | "ready"
  | "error";

export type AIChatSnapshot = {
  messages: AIChatMessage[];
  status: AIChatSnapshotStatus;
  error?: Error;
};

const noopUnsubscribe = () => {};

/**
 * Reactive snapshot of a `Chat` object's messages, status, and error.
 *
 * Mirrors what `@ai-sdk/react`'s `useChat({ chat, experimental_throttle: 32 })`
 * exposed, but reads only the three fields the chat surface consumes and
 * tolerates a missing chat (returns empty messages / idle status / no error).
 */
export function useChatState(
  chat?: Chat<AIChatMessage> | null
): AIChatSnapshot {
  const subscribeToMessages = useCallback(
    (onChange: () => void) =>
      chat
        ? chat["~registerMessagesCallback"](onChange, MESSAGES_THROTTLE_MS)
        : noopUnsubscribe,
    [chat]
  );
  const subscribeToStatus = useCallback(
    (onChange: () => void) =>
      chat ? chat["~registerStatusCallback"](onChange) : noopUnsubscribe,
    [chat]
  );
  const subscribeToError = useCallback(
    (onChange: () => void) =>
      chat ? chat["~registerErrorCallback"](onChange) : noopUnsubscribe,
    [chat]
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    () => chat?.messages ?? EMPTY_MESSAGES,
    () => chat?.messages ?? EMPTY_MESSAGES
  );
  const status = useSyncExternalStore(
    subscribeToStatus,
    () => chat?.status ?? IDLE_STATUS,
    () => chat?.status ?? IDLE_STATUS
  );
  const error = useSyncExternalStore(
    subscribeToError,
    () => chat?.error,
    () => chat?.error
  );

  return { messages, status, error };
}
