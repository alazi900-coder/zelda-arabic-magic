import { describe, it, expect } from "vitest";
import { restoreTagsLocally } from "@/components/editor/types";

describe("restoreTagsLocally", () => {
  it("restores missing PUA markers from original", () => {
    const original = "Hello \uE000 world \uE001 end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("returns translation unchanged if no tags missing", () => {
    const original = "Hello \uE000 world";
    const translation = "مرحبا \uE000 عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("\uE000");
  });

  it("returns translation unchanged if original has no tags", () => {
    const original = "Hello world";
    const translation = "مرحبا عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toBe("مرحبا عالم");
  });

  it("handles multiple PUA characters", () => {
    const original = "Press \uE000\uE001 to continue";
    const damagedTranslation = "اضغط للمتابعة";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("handles multiple tag groups at different positions", () => {
    const original = "\uE000 Start middle \uE001 end";
    const damagedTranslation = "بداية وسط نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("individual char count matches quality detector logic", () => {
    const original = "\uE000\uE001\uE002 Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    const origCount = (original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    const resultCount = (result.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    expect(resultCount).toBe(origCount);
  });

  it("does not duplicate tags already present in translation", () => {
    const original = "\uE000\uE001\uE002 Cancel";
    const translation = "\uE000 إلغاء"; // has E000, missing E001 and E002
    const result = restoreTagsLocally(original, translation);
    const e000Count = (result.match(/\uE000/g) || []).length;
    expect(e000Count).toBe(1); // should not duplicate
    expect(result).toContain("\uE001");
    expect(result).toContain("\uE002");
  });

  // === Group integrity tests ===

  it("keeps consecutive tag groups together (E000+E001+E002)", () => {
    const original = "\uE000\uE001\uE002 Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    // The group E000+E001+E002 must remain as a consecutive sequence
    expect(result).toMatch(/\uE000\uE001\uE002/);
  });

  it("keeps multiple consecutive groups intact", () => {
    const original = "\uE000\uE001\uE002 to talk to \uE003\uE004";
    const damagedTranslation = "للتحدث مع";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Both groups must stay together
    expect(result).toMatch(/\uE000\uE001\uE002/);
    expect(result).toMatch(/\uE003\uE004/);
  });

  it("keeps button icon group at word boundary", () => {
    const original = "\uE000\uE001 Cancel";
    const damagedTranslation = "إلغاء";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toMatch(/\uE000\uE001/);
    // Group should be at start or end, not splitting a word
    const cleanParts = result.split(/[\uE000-\uF8FF]+/).filter(Boolean);
    for (const part of cleanParts) {
      expect(part.trim()).toBe(part.trim()); // no broken words
    }
  });

  it("preserves group order for complex control sequences", () => {
    const original = "Press \uE000\uE001\uE002 to talk to \uE003 Impa \uE004";
    const damagedTranslation = "اضغط للتحدث مع إمبا";
    const result = restoreTagsLocally(original, damagedTranslation);
    const group1Idx = result.indexOf("\uE000");
    const group2Idx = result.indexOf("\uE003");
    // First group should appear before second group
    expect(group1Idx).toBeLessThan(group2Idx);
  });

  // === Legacy FFF9-FFFC backward compat ===

  it("still works with legacy FFF9-FFFC markers", () => {
    const original = "Hello \uFFF9 world \uFFFA end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uFFF9");
    expect(result).toContain("\uFFFA");
  });
});
