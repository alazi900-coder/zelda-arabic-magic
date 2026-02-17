import { describe, it, expect } from "vitest";
import { restoreTagsLocally } from "@/components/editor/types";

describe("restoreTagsLocally", () => {
  it("restores missing control characters from original", () => {
    const original = "Hello \uFFF9\uFFFA world \uFFFB end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Should contain the tags
    expect(result).toContain("\uFFF9\uFFFA");
    expect(result).toContain("\uFFFB");
  });

  it("returns translation unchanged if no tags missing", () => {
    const original = "Hello \uFFF9 world";
    const translation = "مرحبا \uFFF9 عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("\uFFF9");
  });

  it("returns translation unchanged if original has no tags", () => {
    const original = "Hello world";
    const translation = "مرحبا عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toBe("مرحبا عالم");
  });

  it("handles PUA characters (E000-F8FF)", () => {
    const original = "Press \uE000\uE001 to continue";
    const damagedTranslation = "اضغط للمتابعة";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000\uE001");
  });

  it("handles multiple tag groups at different positions", () => {
    const original = "\uFFF9Start\uFFFA middle \uFFFB end";
    const damagedTranslation = "بداية وسط نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uFFF9");
    expect(result).toContain("\uFFFA");
    expect(result).toContain("\uFFFB");
  });
});
