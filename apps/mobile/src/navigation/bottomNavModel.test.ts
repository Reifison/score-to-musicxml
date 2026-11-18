import { describe, expect, it } from "vitest";
import { activeBottomNavKey, activeRailUtilityKey, bottomNavItemsForRole, homeTilesForNavigationMode, railUtilityItems } from "./bottomNavModel";

describe("bottom navigation model", () => {
  it("keeps the admin compact navigation at five destinations and separates sign out", () => {
    const items = bottomNavItemsForRole("admin");

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.key)).toEqual(["home", "scores", "profile", "users", "logs"]);
    expect(items.some((item) => item.key === ("logout" as never))).toBe(false);
  });

  it("shows only personal destinations to regular users", () => {
    expect(bottomNavItemsForRole("user").map((item) => item.key)).toEqual(["home", "scores", "profile"]);
  });

  it("keeps score details on the library destination and leaves settings unselected", () => {
    expect(activeBottomNavKey("/score/score-1")).toBe("scores");
    expect(activeBottomNavKey("/scores?view=favorites")).toBe("scores");
    expect(activeBottomNavKey("/settings")).toBe("");
    expect(activeBottomNavKey("/trash")).toBe("");
  });

  it("keeps utilities in a stable rail-only order with real destinations", () => {
    expect(railUtilityItems().map(({ key, label, href }) => ({ key, label, href }))).toEqual([
      { key: "trash", label: "Lixeira", href: "/trash" },
      { key: "settings", label: "Ajustes", href: "/settings" }
    ]);
    expect(activeRailUtilityKey("/trash")).toBe("trash");
    expect(activeRailUtilityKey("/settings/account")).toBe("settings");
    expect(activeRailUtilityKey("/scores")).toBe("");
  });

  it("hides the matching home shortcuts only while the rail exposes them", () => {
    const tiles = ["scores", "favorites", "trash", "settings", "profile"].map((key) => ({ key }));

    expect(homeTilesForNavigationMode(tiles, "rail").map(({ key }) => key)).toEqual(["scores", "favorites", "profile"]);
    expect(homeTilesForNavigationMode(tiles, "bottom").map(({ key }) => key)).toEqual(["scores", "favorites", "trash", "settings", "profile"]);
  });
});
