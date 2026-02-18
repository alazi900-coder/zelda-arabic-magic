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

  // === Group integrity tests ===

  it("keeps consecutive tag groups together (FFF9+E000+FFFA)", () => {
    const original = "\uFFF9\uE000\uFFFA Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    // The group FFF9+E000+FFFA must remain as a consecutive sequence
    expect(result).toMatch(/\uFFF9\uE000\uFFFA/);
  });

  it("keeps multiple consecutive groups intact", () => {
    const original = "\uFFF9\uE000\uE001\uFFFA to talk to \uFFFB\uE002\uFFFC";
    const damagedTranslation = "للتحدث مع";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Both groups must stay together
    expect(result).toMatch(/\uFFF9\uE000\uE001\uFFFA/);
    expect(result).toMatch(/\uFFFB\uE002\uFFFC/);
  });

  it("keeps button icon group (FFF9+E000+FFFA) at word boundary", () => {
    const original = "\uFFF9\uE000\uFFFA Cancel";
    const damagedTranslation = "إلغاء";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toMatch(/\uFFF9\uE000\uFFFA/);
    // Group should be at start or end, not splitting a word
    const cleanParts = result.split(/[\uFFF9-\uFFFC\uE000-\uF8FF]+/).filter(Boolean);
    for (const part of cleanParts) {
      expect(part.trim()).toBe(part.trim()); // no broken words
    }
  });

  it("preserves group order for complex control sequences", () => {
    const original = "Press \uFFF9\uE000\uE001\uFFFA to talk to \uFFFB Impa \uFFFC";
    const damagedTranslation = "اضغط للتحدث مع إمبا";
    const result = restoreTagsLocally(original, damagedTranslation);
    const group1Idx = result.indexOf("\uFFF9");
    const group2Idx = result.indexOf("\uFFFB");
    // First group should appear before second group
    expect(group1Idx).toBeLessThan(group2Idx);
  });
});
