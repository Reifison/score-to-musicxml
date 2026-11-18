import { describe, expect, it } from "vitest";
import { IOS_PLAYER_AUDIO_SESSION_SCRIPT } from "./iosAudioSession";

function runScript(navigator: object) {
  return new Function("navigator", IOS_PLAYER_AUDIO_SESSION_SCRIPT)(navigator);
}

describe("iOS player audio category", () => {
  it("requests playback when the WebKit audio session API is present", () => {
    const session = { type: "auto" };
    expect(() => runScript({ audioSession: session })).not.toThrow();
    expect(session.type).toBe("playback");
  });

  it("leaves older or unavailable implementations usable", () => {
    expect(() => runScript({})).not.toThrow();
    const restricted = Object.defineProperty({}, "type", { get: () => "auto", set: () => { throw new Error("Unavailable"); } });
    expect(() => runScript({ audioSession: restricted })).not.toThrow();
  });
});
