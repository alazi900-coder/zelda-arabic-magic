/**
 * BDAT Binary Patcher for Xenoblade Chronicles 3
 *
 * Byte-Patch Mode: writes translated strings directly at their ORIGINAL offsets
 * in the String Table without changing any sizes, offsets, or record counts.
 *
 * Rules (strictly enforced):
 * 1. File size NEVER changes — buffer is an exact copy of the original.
 * 2. String-table pointers in Row Data are NEVER touched.
 * 3. Row count and column count are NEVER changed.
 * 4. Each string is written at its original offset inside the String Table.
 * 5. Remaining space is padded with 0x00.
 * 6. If UTF-8 byte length of translation > original allocation → SKIP + record error.
 * 7. Tag sequences (PUA / control chars) are preserved unchanged.
 */

import { BdatFile, BdatTable, BdatValueType } from './bdat-parser';

// ============= Public types =============

export interface OverflowError {
  /** Editor key (tableName:rowIndex:colName) */
  key: string;
  /** Original allocation in bytes (including null terminator) */
  originalBytes: number;
  /** UTF-8 byte length of the translation + null terminator */
  translationBytes: number;
}

export interface PatchResult {
  result: Uint8Array;
  overflowErrors: OverflowError[];
  /** Number of strings successfully patched */
  patchedCount: number;
  /** Number of strings skipped due to overflow */
  skippedCount: number;
}

// ============= Helpers =============

const encoder = new TextEncoder();

/**
 * Measure how many bytes the null-terminated string at `absOffset` occupies
 * inside `data` (inclusive of the null terminator).
 * Returns 1 for empty strings (just the null byte).
 */
function measureStringSlot(data: Uint8Array, absOffset: number): number {
  let i = absOffset;
  while (i < data.length && data[i] !== 0) i++;
  // +1 for the null terminator itself
  return i - absOffset + 1;
}

/**
 * Check whether `text` contains technical tag characters that must be preserved.
 * Tags live in PUA U+E000–U+E0FF and IAT controls U+FFF9–U+FFFC.
 */
function hasTags(text: string): boolean {
  return /[\uE000-\uE0FF\uFFF9-\uFFFC]/.test(text);
}

// ============= Core patch function =============

/**
 * Patch a BDAT file in-place by writing translated strings at their original
 * String Table offsets.  The returned buffer has the EXACT same size as the
 * original file.
 *
 * @param bdatFile  Parsed BDAT file (must have _raw with original bytes).
 * @param translations  Map of "tableName:rowIndex:colName" → translated string.
 */
export function patchBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>,
): PatchResult {
  // Step 1 — clone the original buffer byte-for-byte
  const result = bdatFile._raw.slice();

  const overflowErrors: OverflowError[] = [];
  let patchedCount = 0;
  let skippedCount = 0;

  for (const table of bdatFile.tables) {
    const raw = table._raw;
    // Absolute offset of this table's String Table inside the file
    const absStrTableStart = raw.tableOffset + raw.stringTableOffset;

    const stringColumns = table.columns.filter(
      c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString,
    );

    if (stringColumns.length === 0) continue;

    // We need a DataView over the full result buffer to read string pointers
    const tableView = new DataView(
      result.buffer,
      result.byteOffset + raw.tableOffset,
      raw.tableData.length,
    );

    for (let r = 0; r < raw.rowCount; r++) {
      const rowOffset = raw.rowDataOffset + r * raw.rowLength;

      for (const col of stringColumns) {
        const cellOffset = rowOffset + col.offset;
        if (cellOffset + 4 > raw.tableData.length) continue;

        // strOff is relative to the String Table start
        const strOff = tableView.getUint32(cellOffset, true);
        if (strOff === 0) continue;

        const mapKey = `${table.name}:${r}:${col.name}`;
        const translation = translations.get(mapKey);
        if (translation === undefined) continue;

        // Absolute position of this string in the result buffer
        const absStrOffset = absStrTableStart + strOff;
        if (absStrOffset >= result.length) continue;

        // Measure original slot (bytes including null terminator)
        const originalSlot = measureStringSlot(result, absStrOffset);

        // Skip strings that contain tag sequences to avoid corruption
        if (hasTags(translation)) {
          // Encode only the non-tag portion and check length — still enforce limit
          // But to be safe: if translation contains tags, skip patching entirely
          skippedCount++;
          continue;
        }

        // Encode translation to UTF-8
        const transBytes = encoder.encode(translation);
        // +1 for null terminator
        const needed = transBytes.length + 1;

        if (needed > originalSlot) {
          // OVERFLOW — record and skip
          overflowErrors.push({
            key: mapKey,
            originalBytes: originalSlot,
            translationBytes: needed,
          });
          skippedCount++;
          continue;
        }

        // Write translation bytes
        result.set(transBytes, absStrOffset);
        // Null terminator immediately after
        result[absStrOffset + transBytes.length] = 0;
        // Zero-pad the rest of the original slot
        result.fill(0, absStrOffset + transBytes.length + 1, absStrOffset + originalSlot);

        patchedCount++;
      }
    }
  }

  return { result, overflowErrors, patchedCount, skippedCount };
}

// ============= Legacy export (kept for tests that import rebuildBdatFile) =============

/**
 * @deprecated Use patchBdatFile instead. This thin wrapper calls patchBdatFile
 * and returns only the patched buffer for backward compatibility with old tests.
 */
export function rebuildBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>,
): Uint8Array {
  return patchBdatFile(bdatFile, translations).result;
}
