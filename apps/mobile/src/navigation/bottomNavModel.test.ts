import { describe, expect, it } from "vitest";
import { activeBottomNavKey, bottomNavItemsForRole } from "./bottomNavModel";

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
  });
});
