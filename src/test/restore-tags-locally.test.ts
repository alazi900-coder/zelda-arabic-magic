import { describe, it, expect } from "vitest";
import { restoreTagsLocally } from "@/components/editor/types";

describe("restoreTagsLocally", () => {
  it("restores missing control characters from original", () => {
    const original = "Hello \uFFF9\uFFFA world \uFFFB end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Should contain each individual tag
    expect(result).toContain("\uFFF9");
    expect(result).toContain("\uFFFA");
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
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("handles multiple tag groups at different positions", () => {
    const original = "\uFFF9Start\uFFFA middle \uFFFB end";
    const damagedTranslation = "بداية وسط نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uFFF9");
    expect(result).toContain("\uFFFA");
    expect(result).toContain("\uFFFB");
  });

  it("individual char count matches quality detector logic", () => {
    const original = "\uFFF9\uE000\uE001\uFFFA Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Quality detector counts: /[\uFFF9-\uFFFC\uE000-\uF8FF]/g
    const origCount = (original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    const resultCount = (result.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    expect(resultCount).toBe(origCount);
  });

  it("does not duplicate tags already present in translation", () => {
    const original = "\uFFF9\uE000\uFFFA Cancel";
    const translation = "\uFFF9 إلغاء"; // has FFF9, missing E000 and FFFA
    const result = restoreTagsLocally(original, translation);
    const fff9Count = (result.match(/\uFFF9/g) || []).length;
    expect(fff9Count).toBe(1); // should not duplicate
    expect(result).toContain("\uE000");
    expect(result).toContain("\uFFFA");
  });
});
