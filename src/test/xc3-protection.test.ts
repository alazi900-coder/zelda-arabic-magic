import { describe, it, expect } from "vitest";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("XC3 Tag Protection", () => {
  it("should protect PUA icons and restore them after translation", () => {
    const text = "Press \uE000 to confirm";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("Press TAG_0 to confirm");
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("\uE000");
    const restored = restoreTags("اضغط TAG_0 للتأكيد", tags);
    expect(restored).toBe("اضغط \uE000 للتأكيد");
  });

  it("should treat consecutive PUA sequences as atomic blocks", () => {
    const text = "Use \uE000\uE001\uE002 here";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("Use TAG_0 here");
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("\uE000\uE001\uE002");
  });

  it("should protect [Format:Value] tags", () => {
    const text = "[Color:Red]danger[Color:White]";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("TAG_0dangerTAG_1");
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("[Color:Red]");
    expect(tags[1].original).toBe("[Color:White]");
  });

  it("should protect {variable} placeholders", () => {
    const text = "Hello {player_name}, you have {item_count} items";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toContain("TAG_0");
    expect(cleanText).toContain("TAG_1");
    expect(tags).toHaveLength(2);
    const restored = restoreTags("مرحبا TAG_0 لديك TAG_1 عناصر", tags);
    expect(restored).toContain("{player_name}");
    expect(restored).toContain("{item_count}");
  });

  it("should detect missing tags in translation via restoreTagsLocally", () => {
    const original = "\uE000 Press to start \uE001";
    const translation = "اضغط للبدء";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("\uE000");
    expect(fixed).toContain("\uE001");
  });

  it("should not modify translation when all tags present", () => {
    const original = "\uE000 text \uE001";
    const translation = "\uE000 نص \uE001";
    const result = restoreTagsLocally(original, translation);
    expect(result).toBe(translation);
  });

  it("should restore missing PUA icons at word boundaries", () => {
    const original = "Hello \uE000 world \uE001 end";
    const translation = "مرحبا عالم نهاية";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("\uE000");
    expect(fixed).toContain("\uE001");
  });

  it("should handle text with no tags", () => {
    const text = "Simple text without tags";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe(text);
    expect(tags).toHaveLength(0);
  });

  it("should protect Unicode special markers", () => {
    const text = "Text \uFFF9 with \uFFFA marker";
    const { cleanText, tags } = protectTags(text);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    expect(cleanText).not.toContain("\uFFF9");
    expect(cleanText).not.toContain("\uFFFA");
  });

  it("should handle mixed tag types", () => {
    const text = "\uE000 [Color:Red] {name} \uFFF9";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(4);
    const restored = restoreTags("TAG_0 TAG_1 TAG_2 TAG_3", tags);
    expect(restored).toContain("\uE000");
    expect(restored).toContain("[Color:Red]");
    expect(restored).toContain("{name}");
    expect(restored).toContain("\uFFF9");
  });
});
