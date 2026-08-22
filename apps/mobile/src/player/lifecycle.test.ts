import { describe, expect, it } from "vitest";
import {
  PLAYER_BRIDGE_READY_TIMEOUT_MS,
  playerCommandForAppState,
  playerCommandForRouteExit
} from "./lifecycle";

describe("player lifecycle", () => {
  it("limita a espera pelo canal do player", () => {
    expect(PLAYER_BRIDGE_READY_TIMEOUT_MS).toBe(15_000);
  });

  it.each(["inactive", "background", "unknown"])(
    "pausa o áudio quando o app entra em %s",
    (state) => {
      expect(playerCommandForAppState(state)).toBe("pause");
    }
  );

  it("não retoma automaticamente quando o app volta a ficar ativo", () => {
    expect(playerCommandForAppState("active")).toBeNull();
  });

  it("descarta a sessão ao sair da rota da partitura", () => {
    expect(playerCommandForRouteExit()).toBe("dispose");
  });
});
