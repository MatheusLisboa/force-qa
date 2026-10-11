import { describe, expect, it, vi } from "vitest";
import { createConnectionTracker, deriveConnectionState } from "./connection";

describe("deriveConnectionState", () => {
  it("offline tem prioridade", () => {
    expect(deriveConnectionState(false, 0)).toBe("offline");
    expect(deriveConnectionState(false, 3)).toBe("offline");
  });
  it("canal com falha vira reconnecting", () => {
    expect(deriveConnectionState(true, 1)).toBe("reconnecting");
  });
  it("sem falhas fica online", () => {
    expect(deriveConnectionState(true, 0)).toBe("online");
  });
});

describe("createConnectionTracker", () => {
  it("notifica só quando o estado muda", () => {
    const tracker = createConnectionTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);
    expect(listener).toHaveBeenLastCalledWith("online");

    tracker.setChannelHealthy("a", false);
    tracker.setChannelHealthy("b", false);
    expect(listener).toHaveBeenLastCalledWith("reconnecting");
    expect(listener).toHaveBeenCalledTimes(2);

    tracker.setChannelHealthy("a", true);
    expect(tracker.get()).toBe("reconnecting");
    tracker.setChannelHealthy("b", true);
    expect(tracker.get()).toBe("online");
  });

  it("forget remove canais encerrados", () => {
    const tracker = createConnectionTracker();
    tracker.setChannelHealthy("a", false);
    tracker.forget("a");
    expect(tracker.get()).toBe("online");
  });

  it("offline do navegador sobrepõe os canais", () => {
    const tracker = createConnectionTracker();
    tracker.setBrowserOnline(false);
    expect(tracker.get()).toBe("offline");
    tracker.setBrowserOnline(true);
    expect(tracker.get()).toBe("online");
  });
});
