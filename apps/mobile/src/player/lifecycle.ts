export type PlayerLifecycleCommand = "pause" | "dispose";

// The native host must receive bridge.ready immediately after the player page
// boots. Keep a bounded wait so a stale/misconfigured web deployment cannot
// leave the score detail screen showing an endless loading indicator.
export const PLAYER_BRIDGE_READY_TIMEOUT_MS = 15_000;

export function playerCommandForAppState(state: string): PlayerLifecycleCommand | null {
  return state === "active" ? null : "pause";
}

export function playerCommandForRouteExit(): PlayerLifecycleCommand {
  return "dispose";
}
