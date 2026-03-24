import { GlowPill } from "@/components/UI/GlowPill";
import type { UseSocketReturn } from "@/hooks/useSocket";

type ConnectionStatusProps = Pick<UseSocketReturn, "connected" | "error">;

/**
 * Visual indicator for the Socket.io connection state.
 * Uses GlowPill to show healthy / warning / error status.
 */
export function ConnectionStatus({
  connected,
  error: connectionError,
}: ConnectionStatusProps) {
  if (connected) {
    return <GlowPill status="healthy" label="Connected" />;
  }

  if (connectionError) {
    return <GlowPill status="error" label="Disconnected" title={connectionError} />;
  }

  return <GlowPill status="info" label="Connecting…" />;
}
