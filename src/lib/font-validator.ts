/**
 * Font Validator — Check if a TTF/OTF font supports Arabic Presentation Forms-B
 * 
 * Parses the TrueType cmap table to check for glyphs in the U+FE70–U+FEFF range,
 * which are required for pre-shaped Arabic text rendering in game engines.
 */

export interface FontValidationResult {
  valid: boolean;
  totalGlyphs: number;
  arabicPresentationFormsB: number;
  /** How many of the critical Arabic PF-B codepoints are covered (out of ~141) */
  coveragePercent: number;
  latinCoveragePercent: number;
  missingLatinRanges: string[];
  warnings: string[];
  details: string;
}

/** Key codepoints to sample from Arabic Presentation Forms-B (U+FE70–U+FEFF) */
const SAMPLE_CODEPOINTS = [
  0xFE70, // ARABIC FATHATAN ISOLATED
  0xFE76, // ARABIC FATHA ISOLATED
  0xFE8D, // ARABIC LETTER ALEF ISOLATED
  0xFE8E, // ARABIC LETTER ALEF FINAL
  0xFE91, // ARABIC LETTER BEH INITIAL
  0xFE92, // ARABIC LETTER BEH MEDIAL
  0xFE95, // ARABIC LETTER TEH ISOLATED
  0xFE97, // ARABIC LETTER TEH INITIAL
  0xFEA1, // ARABIC LETTER HAH INITIAL
  0xFEAD, // ARABIC LETTER REH ISOLATED
  0xFEB1, // ARABIC LETTER SEEN INITIAL
  0xFEB5, // ARABIC LETTER SHEEN INITIAL
  0xFEB9, // ARABIC LETTER SAD INITIAL
  0xFEC9, // ARABIC LETTER AIN INITIAL
  0xFED1, // ARABIC LETTER FEH INITIAL
  0xFED5, // ARABIC LETTER QAF INITIAL
  0xFED9, // ARABIC LETTER KAF INITIAL
  0xFEDD, // ARABIC LETTER LAM INITIAL
  0xFEE1, // ARABIC LETTER MEEM INITIAL
  0xFEE5, // ARABIC LETTER NOON INITIAL
  0xFEE9, // ARABIC LETTER HEH INITIAL
  0xFEED, // ARABIC LETTER WAW ISOLATED
  0xFEF1, // ARABIC LETTER YEH INITIAL
  0xFEF5, // ARABIC LIGATURE LAM WITH ALEF MADDA ISOLATED
];

/** Latin character ranges to check */
const LATIN_RANGES = [
  { start: 0x41, end: 0x5A, label: "A–Z (أحرف كبيرة)" },
  { start: 0x61, end: 0x7A, label: "a–z (أحرف صغيرة)" },
  { start: 0x30, end: 0x39, label: "0–9 (أرقام)" },
];

/** Check how many latin codepoints are covered */
function checkLatinCoverage(supported: Set<number>): { percent: number; missing: string[] } {
  const missing: string[] = [];
  let total = 0;
  let found = 0;
  for (const range of LATIN_RANGES) {
    let rangeMissing = 0;
    for (let c = range.start; c <= range.end; c++) {
      total++;
      if (supported.has(c)) found++;
      else rangeMissing++;
    }
    if (rangeMissing > 0) missing.push(`${range.label} (${rangeMissing} مفقود)`);
  }
  return { percent: Math.round((found / total) * 100), missing };
}

/**
 * Validate a font file (TTF/OTF) for Arabic Presentation Forms-B + Latin support.
 * Parses the cmap table directly from the binary data.
 */
export function validateFontForArabic(data: ArrayBuffer): FontValidationResult {
  const warnings: string[] = [];
  
  try {
    const view = new DataView(data);
    
    // Read offset table
    const sfVersion = view.getUint32(0);
    // 0x00010000 = TrueType, 0x4F54544F = 'OTTO' (CFF/OpenType)
    if (sfVersion === 0x4F54544F) {
      warnings.push("الخط بصيغة OpenType CFF — قد لا يعمل مع محرك اللعبة، يُفضل استخدام TrueType (.ttf)");
    }
    
    const numTables = view.getUint16(4);
    
    // Find cmap table
    let cmapOffset = -1;
    for (let i = 0; i < numTables; i++) {
      const tableOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(tableOffset),
        view.getUint8(tableOffset + 1),
        view.getUint8(tableOffset + 2),
        view.getUint8(tableOffset + 3)
      );
      if (tag === "cmap") {
        cmapOffset = view.getUint32(tableOffset + 8);
        break;
      }
    }
    
    if (cmapOffset === -1) {
      return {
        valid: false, totalGlyphs: 0, arabicPresentationFormsB: 0,
        coveragePercent: 0, latinCoveragePercent: 0, missingLatinRanges: [],
        warnings: ["لم يتم العثور على جدول cmap — الملف قد لا يكون خطاً صالحاً"],
        details: "ملف الخط لا يحتوي على جدول ترميز الحروف (cmap)"
      };
    }
    
    // Parse cmap table — find a Unicode subtable (platformID 0 or 3)
    const cmapNumSubtables = view.getUint16(cmapOffset + 2);
    
    // Collect all codepoints the font supports
    const supportedCodepoints = new Set<number>();
    let totalMappings = 0;
    
    for (let i = 0; i < cmapNumSubtables; i++) {
      const subtableEntry = cmapOffset + 4 + i * 8;
      const platformID = view.getUint16(subtableEntry);
      const encodingID = view.getUint16(subtableEntry + 2);
      const subtableOffset = cmapOffset + view.getUint32(subtableEntry + 4);
      
      // Unicode platform (0) or Windows Unicode BMP (3,1)
      if (platformID === 0 || (platformID === 3 && encodingID === 1)) {
        const format = view.getUint16(subtableOffset);
        
        if (format === 4) {
          totalMappings += parseFormat4(view, subtableOffset, supportedCodepoints);
        } else if (format === 12) {
          totalMappings += parseFormat12(view, subtableOffset, supportedCodepoints);
        }
      }
    }
    
    // --- Arabic PF-B check ---
    let arabicPfbCount = 0;
    for (let c = 0xFE70; c <= 0xFEFF; c++) {
      if (supportedCodepoints.has(c)) arabicPfbCount++;
    }
    const totalPfB = 141;
    const coveragePercent = Math.round((arabicPfbCount / totalPfB) * 100);
    const sampleHits = SAMPLE_CODEPOINTS.filter(cp => supportedCodepoints.has(cp)).length;
    const samplePercent = Math.round((sampleHits / SAMPLE_CODEPOINTS.length) * 100);

    // --- Latin check ---
    const { percent: latinCoveragePercent, missing: missingLatinRanges } = checkLatinCoverage(supportedCodepoints);

    if (latinCoveragePercent < 100) {
      const latinMsg = latinCoveragePercent === 0
        ? "⚠️ الخط لا يحتوي على أي حرف لاتيني (A-Z, a-z, 0-9) — النصوص الإنجليزية ستختفي من اللعبة!"
        : `⚠️ الخط يفتقر لبعض الحروف اللاتينية (${latinCoveragePercent}% تغطية) — قد تختفي بعض النصوص الإنجليزية`;
      warnings.push(latinMsg);
    }
    
    if (arabicPfbCount === 0) {
      warnings.push("الخط لا يدعم أشكال العرض العربية (Presentation Forms-B) إطلاقاً — النصوص العربية لن تظهر بشكل متصل في اللعبة");
      return {
        valid: false, totalGlyphs: totalMappings, arabicPresentationFormsB: 0,
        coveragePercent: 0, latinCoveragePercent, missingLatinRanges,
        warnings,
        details: `الخط يحتوي على ${totalMappings} حرف لكن لا يدعم مجال U+FE70–U+FEFF المطلوب للعربية المُشكَّلة`
      };
    }
    
    if (coveragePercent < 50) {
      warnings.push(`تغطية جزئية فقط (${coveragePercent}%) — بعض الحروف العربية قد لا تظهر بشكل صحيح`);
    }
    
    if (samplePercent < 80) {
      warnings.push("بعض الحروف الأساسية مفقودة — قد تظهر مربعات فارغة لبعض الأحرف");
    }
    
    return {
      valid: arabicPfbCount > 0 && latinCoveragePercent === 100,
      totalGlyphs: totalMappings,
      arabicPresentationFormsB: arabicPfbCount,
      coveragePercent,
      latinCoveragePercent,
      missingLatinRanges,
      warnings,
      details: coveragePercent >= 80 && latinCoveragePercent === 100
        ? `✅ الخط يدعم العربية (${coveragePercent}%) واللاتينية (${latinCoveragePercent}%) — متوافق تماماً`
        : coveragePercent >= 50 || latinCoveragePercent > 0
        ? `⚠️ الخط يدعم العربية (${coveragePercent}%) / اللاتينية (${latinCoveragePercent}%) — متوافق جزئياً`
        : `❌ الخط غير كافٍ — عربية: ${coveragePercent}%، لاتينية: ${latinCoveragePercent}%`
    };
    
  } catch (err) {
    return {
      valid: false, totalGlyphs: 0, arabicPresentationFormsB: 0,
      coveragePercent: 0, latinCoveragePercent: 0, missingLatinRanges: [],
      warnings: ["فشل في تحليل ملف الخط — تأكد أنه بصيغة TTF أو OTF صالحة"],
      details: `خطأ في التحليل: ${err instanceof Error ? err.message : "غير معروف"}`
    };
  }
}

/** Parse cmap format 4 (BMP) and collect all codepoints */
function parseFormat4(view: DataView, offset: number, result: Set<number>): number {
  let totalMappings = 0;
  try {
    const segCountX2 = view.getUint16(offset + 6);
    const segCount = segCountX2 / 2;

    const endCountBase = offset + 14;
    const startCountBase = endCountBase + segCountX2 + 2;
    const idDeltaBase = startCountBase + segCountX2;
    const idRangeOffsetBase = idDeltaBase + segCountX2;

    for (let i = 0; i < segCount; i++) {
      const endCode = view.getUint16(endCountBase + i * 2);
      const startCode = view.getUint16(startCountBase + i * 2);

      if (startCode === 0xFFFF) break;

      totalMappings += endCode - startCode + 1;

      const idRangeOffset = view.getUint16(idRangeOffsetBase + i * 2);
      const idDelta = view.getInt16(idDeltaBase + i * 2);

      for (let c = startCode; c <= endCode; c++) {
        let glyphId: number;
        if (idRangeOffset === 0) {
          glyphId = (c + idDelta) & 0xFFFF;
        } else {
          const glyphOffset = idRangeOffsetBase + i * 2 + idRangeOffset + (c - startCode) * 2;
          if (glyphOffset + 2 > view.byteLength) continue;
          glyphId = view.getUint16(glyphOffset);
          if (glyphId !== 0) glyphId = (glyphId + idDelta) & 0xFFFF;
        }
        if (glyphId !== 0) result.add(c);
      }
    }
  } catch {
    // Partial parse is fine
  }
  return totalMappings;
}

/** Parse cmap format 12 (full Unicode) and collect all codepoints */
function parseFormat12(view: DataView, offset: number, result: Set<number>): number {
  let totalMappings = 0;
  try {
    const numGroups = view.getUint32(offset + 12);
    const groupBase = offset + 16;

    for (let i = 0; i < numGroups; i++) {
      const groupOffset = groupBase + i * 12;
      const startCharCode = view.getUint32(groupOffset);
      const endCharCode = view.getUint32(groupOffset + 4);
      const startGlyphID = view.getUint32(groupOffset + 8);

      totalMappings += endCharCode - startCharCode + 1;

      for (let c = startCharCode; c <= endCharCode; c++) {
        const glyphId = startGlyphID + (c - startCharCode);
        if (glyphId !== 0) result.add(c);
      }
    }
  } catch {
    // Partial parse is fine
  }
  return totalMappings;
}
