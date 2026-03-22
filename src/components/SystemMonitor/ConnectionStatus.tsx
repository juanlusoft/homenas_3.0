import { GlowPill } from "@/components/UI/GlowPill";
import type { UseSocketReturn } from "@/hooks/useSocket";

type ConnectionStatusProps = Pick<
  UseSocketReturn,
  "isConnected" | "connectionError" | "reconnectAttempts"
>;

/**
 * Visual indicator for the Socket.io connection state.
 * Uses GlowPill to show healthy / warning / error status
 * and displays reconnect attempt count when applicable.
 */
export function ConnectionStatus({
  isConnected,
  connectionError,
  reconnectAttempts,
}: ConnectionStatusProps) {
  if (isConnected) {
    return <GlowPill status="healthy" label="Connected" />;
  }

  if (reconnectAttempts > 0) {
    return (
      <GlowPill
        status="warning"
        label={`Reconnecting (${reconnectAttempts})`}
      />
    );
  }

  if (connectionError) {
    return <GlowPill status="error" label="Disconnected" title={connectionError} />;
  }

  return <GlowPill status="info" label="Connecting…" />;
}
