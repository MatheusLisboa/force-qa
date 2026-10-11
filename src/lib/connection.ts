export type ConnectionState = "online" | "reconnecting" | "offline";

/** Deriva o estado exibido a partir do navegador e dos canais realtime com falha. */
export function deriveConnectionState(browserOnline: boolean, unhealthyChannels: number): ConnectionState {
  if (!browserOnline) return "offline";
  return unhealthyChannels > 0 ? "reconnecting" : "online";
}

type Listener = (state: ConnectionState) => void;

/** Rastreia a saúde dos canais realtime e o status online/offline do navegador. */
export function createConnectionTracker(initialOnline = true) {
  const unhealthy = new Set<string>();
  const listeners = new Set<Listener>();
  let browserOnline = initialOnline;
  let state: ConnectionState = deriveConnectionState(browserOnline, 0);

  const recompute = () => {
    const next = deriveConnectionState(browserOnline, unhealthy.size);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };

  return {
    get: () => state,
    setBrowserOnline(online: boolean) {
      browserOnline = online;
      recompute();
    },
    setChannelHealthy(name: string, healthy: boolean) {
      if (healthy) unhealthy.delete(name);
      else unhealthy.add(name);
      recompute();
    },
    forget(name: string) {
      unhealthy.delete(name);
      recompute();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
