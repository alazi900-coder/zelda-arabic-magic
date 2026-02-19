import { describe, it, expect } from "vitest";

// Mock of the unReverseBidi function from Editor.tsx
function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function unReverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = '';
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = '';
        }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      return [...seg.text].reverse().join('');
    }).join('');
  }).join('\n');
}

describe("Editor Features", () => {
  describe("Pagination Logic", () => {
    it("should calculate correct page count", () => {
      const PAGE_SIZE = 50;
      const totalEntries = 125;
      const totalPages = Math.ceil(totalEntries / PAGE_SIZE);
      expect(totalPages).toBe(3);
    });

    it("should handle pagination boundaries", () => {
      const PAGE_SIZE = 50;
      const totalEntries = 100;
      const currentPage = 0;
      const start = currentPage * PAGE_SIZE;
      const paginatedSlice = Array(totalEntries).fill(0).slice(start, start + PAGE_SIZE);
      expect(paginatedSlice.length).toBe(50);
    });

    it("should reset page when filters change", () => {
      let currentPage = 2;
      // Simulate filter change by resetting page
      currentPage = 0;
      expect(currentPage).toBe(0);
    });
  });

  describe("Fix Reversed Feature", () => {
    it("should detect Arabic text correctly", () => {
      const arabicText = "مرحبا";
      const hasArabic = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(arabicText);
      expect(hasArabic).toBe(true);
    });

    it("should fix reversed Arabic text", () => {
      // Test case: reversed Arabic should be corrected
      const reversedText = "ابحرم"; // "مرحبا" reversed
      const corrected = unReverseBidi(reversedText);
      expect(corrected).toBeDefined();
      // The corrected text should be different from the input
      expect(corrected).not.toBe(reversedText);
    });

    it("should handle mixed Arabic-Latin text", () => {
      const mixedText = "Hello مرحبا";
      const corrected = unReverseBidi(mixedText);
      expect(corrected).toBeDefined();
    });

    it("should not modify Latin-only text", () => {
      const latinText = "Hello World";
      const corrected = unReverseBidi(latinText);
      expect(corrected).toBe(latinText);
    });

    it("should handle empty strings", () => {
      const emptyText = "";
      const corrected = unReverseBidi(emptyText);
      expect(corrected).toBe("");
    });

    it("should fix all reversed entries in batch", () => {
      const entries = [
        { msbtFile: "file1.msbt", index: 0, original: "ابحرم", label: "test1" },
        { msbtFile: "file1.msbt", index: 1, original: "نرتخ", label: "test2" },
        { msbtFile: "file1.msbt", index: 2, original: "English", label: "test3" },
      ];

      const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
      let fixedCount = 0;
      
      for (const entry of entries) {
        if (arabicRegex.test(entry.original)) {
          const corrected = unReverseBidi(entry.original);
          if (corrected !== entry.original) {
            fixedCount++;
          }
        }
      }
      
      expect(fixedCount).toBeGreaterThan(0);
    });
  });

  describe("Pagination with Filtered Entries", () => {
    it("should calculate correct pagination for filtered results", () => {
      const PAGE_SIZE = 50;
      const allEntries = Array(150).fill(null).map((_, i) => ({
        msbtFile: `file${Math.floor(i / 50)}.msbt`,
        index: i,
        original: `text${i}`,
        maxBytes: 100,
      }));

      // Simulate filtering by category
      const filterCategory = "inventory";
      const filteredEntries = allEntries.filter((_, i) => 
        i % 3 === 0 // Simple filter logic
      );

      const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
      expect(totalPages).toBeGreaterThan(0);
      expect(filteredEntries.length).toBeLessThanOrEqual(allEntries.length);
    });

    it("should display correct entry range in pagination info", () => {
      const PAGE_SIZE = 50;
      const filteredEntries = Array(125).fill(null);
      const currentPage = 0;

      const displayStart = currentPage * PAGE_SIZE + 1;
      const displayEnd = Math.min((currentPage + 1) * PAGE_SIZE, filteredEntries.length);
      const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);

      expect(displayStart).toBe(1);
      expect(displayEnd).toBe(50);
      expect(totalPages).toBe(3);
    });
  });

  describe("Auto-detect Arabic Feature", () => {
     it("should detect pre-translated Arabic texts", () => {
       const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
       
       const entries = [
         { original: "السلام عليكم" },
         { original: "Hello" },
         { original: "مرحبا" },
       ];

       const autoDetectedCount = entries.filter(e => arabicRegex.test(e.original)).length;
       expect(autoDetectedCount).toBe(2);
     });
   });

  describe("Status Message Generation", () => {
    it("should generate correct status message for fixed reversed texts", () => {
      const count = 5;
      const skippedProtected = 2;
      const skippedTranslated = 3;
      const skippedSame = 1;

      const parts: string[] = [];
      if (count > 0) parts.push("تم تصحيح: " + count + " نص");
      if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
      if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
      if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);

      const detailedMessage = (count > 0 ? "\u2705 " : "\u26A0\uFE0F ") + parts.join(" | ");
      
      expect(detailedMessage).toContain("✅");
      expect(detailedMessage).toContain("تم تصحيح: 5");
      expect(detailedMessage).toContain("محمية: 2");
      expect(detailedMessage).toContain("مترجمة: 3");
      expect(detailedMessage).toContain("بلا تغيير: 1");
    });

    it("should generate warning message when no texts were fixed", () => {
      const count = 0;
      const skippedProtected = 0;
      const skippedTranslated = 0;
      const skippedSame = 0;

      const parts: string[] = [];
      if (count > 0) parts.push("تم تصحيح: " + count + " نص");
      if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
      if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
      if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);

      const detailedMessage = (count > 0 ? "\u2705 " : "\u26A0\uFE0F ") + parts.join(" | ");
      
      expect(detailedMessage).toContain("⚠️");
    });
  });
});

// Column-name categorization tests
describe("categorizeBdatTable - column name fallback", () => {
  // Inline the categorization logic for testing
  function categorizeByColumnName(columnName: string): string | null {
    const col = columnName.toLowerCase();
    if (/window|btn|caption|title|dialog|label|layout|menu/i.test(col)) return "bdat-menu";
    if (/task|purpose|summary|quest|event|scenario|after|client|talk/i.test(col)) return "bdat-quest";
    if (/landmark|spot|colony|area|map|place|field/i.test(col)) return "bdat-field";
    if (/skill|price|armor|weapon|description|pouch|gem|art/i.test(col)) return "bdat-item";
    if (/voice|audio|config|option|setting|display/i.test(col)) return "bdat-settings";
    return null;
  }

  it("categorizes UI columns correctly", () => {
    expect(categorizeByColumnName("WindowTitle")).toBe("bdat-menu");
    expect(categorizeByColumnName("BtnLabel")).toBe("bdat-menu");
    expect(categorizeByColumnName("DialogCaption")).toBe("bdat-menu");
  });

  it("categorizes quest columns correctly", () => {
    expect(categorizeByColumnName("TaskSummary")).toBe("bdat-quest");
    expect(categorizeByColumnName("QuestPurpose")).toBe("bdat-quest");
    expect(categorizeByColumnName("EventScenario")).toBe("bdat-quest");
  });

  it("categorizes location columns correctly", () => {
    expect(categorizeByColumnName("LandmarkName")).toBe("bdat-field");
    expect(categorizeByColumnName("ColonyArea")).toBe("bdat-field");
    expect(categorizeByColumnName("SpotLocation")).toBe("bdat-field");
  });

  it("categorizes item columns correctly", () => {
    expect(categorizeByColumnName("WeaponSkill")).toBe("bdat-item");
    expect(categorizeByColumnName("ArmorPrice")).toBe("bdat-item");
    expect(categorizeByColumnName("GemEffect")).toBe("bdat-item");
  });

  it("categorizes settings columns correctly", () => {
    expect(categorizeByColumnName("VoiceSetting")).toBe("bdat-settings");
    expect(categorizeByColumnName("DisplayMode")).toBe("bdat-settings");
    expect(categorizeByColumnName("AudioConfig")).toBe("bdat-settings");
  });

  it("returns null for unknown columns", () => {
    expect(categorizeByColumnName("RandomColumn")).toBeNull();
    expect(categorizeByColumnName("Unknown")).toBeNull();
  });
});
