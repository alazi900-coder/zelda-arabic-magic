/**
 * BDAT Binary Patcher for Xenoblade Chronicles 3
 *
 * String Table Expansion Mode: rebuilds each table's string table to accommodate
 * translations that are LARGER than the original strings (critical for Arabic
 * Presentation Forms which use 3 bytes per char vs 1 byte for ASCII).
 *
 * How it works:
 * 1. For each table, collect ALL string offsets referenced by row data.
 * 2. Read original strings and replace with translations where available.
 * 3. Build a NEW string table (may be larger than original).
 * 4. Update string pointers in row data to point to new offsets.
 * 5. Update stringTableLength in the table header.
 * 6. Rebuild the full file with adjusted table sizes and offsets.
 *
 * Invariants preserved:
 * - Row count, column count, row length are NEVER changed.
 * - Column definitions and hash tables are byte-identical.
 * - String table flag byte and metadata strings (table/column names) are preserved.
 * - Only row-data string pointers are updated.
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
 * Read a null-terminated UTF-8 string from a buffer at the given offset.
 * Returns the string and the number of bytes consumed (including null terminator).
 */
function readNullTermStr(data: Uint8Array, offset: number): { str: string; byteLen: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  const bytes = data.slice(offset, end);
  return {
    str: new TextDecoder('utf-8').decode(bytes),
    byteLen: end - offset + 1, // +1 for null terminator
  };
}

// ============= Core patch function =============

/**
 * Patch a BDAT file by rebuilding string tables to accommodate larger translations.
 * The returned buffer may be LARGER than the original file.
 *
 * @param bdatFile  Parsed BDAT file (must have _raw with original bytes).
 * @param translations  Map of "tableName:rowIndex:colName" → translated string.
 */
export function patchBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>,
): PatchResult {
  const originalData = bdatFile._raw;
  const originalView = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);

  const tableCount = originalView.getUint32(8, true);
  const fileHeaderSize = 16 + tableCount * 4; // magic(4) + version(4) + count(4) + fileSize(4) + offsets

  const overflowErrors: OverflowError[] = [];
  let patchedCount = 0;
  let skippedCount = 0;

  // For each table, build a new table buffer (potentially with expanded string table)
  const newTableBuffers: Uint8Array[] = [];

  for (const table of bdatFile.tables) {
    const raw = table._raw;
    const origTableData = raw.tableData; // original bytes for this table

    const stringColumns = table.columns.filter(
      c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString || c.valueType === BdatValueType.MessageId,
    );

    // If no string columns or no translations match this table, keep original
    if (stringColumns.length === 0) {
      newTableBuffers.push(origTableData);
      continue;
    }

    // Check if any translations exist for this table
    const hasTranslations = [...translations.keys()].some(k => k.startsWith(table.name + ':'));
    if (!hasTranslations) {
      newTableBuffers.push(origTableData);
      continue;
    }

    const origView = new DataView(origTableData.buffer, origTableData.byteOffset, origTableData.byteLength);

    // ---- Step 1: Collect ALL unique string offsets from row data ----
    // Map: original strOff (relative to string table) → { original string bytes, translation bytes }
    interface StringEntry {
      origOffset: number; // original offset in string table
      origBytes: Uint8Array; // original string bytes (WITHOUT null terminator)
      newBytes: Uint8Array; // new string bytes (WITHOUT null terminator) — same as orig if no translation
      cells: { row: number; colIdx: number; cellOffset: number; isMessageId: boolean }[]; // all cells pointing to this string
    }

    const stringMap = new Map<number, StringEntry>(); // keyed by origOffset

    for (let r = 0; r < raw.rowCount; r++) {
      const rowOffset = raw.rowDataOffset + r * raw.rowLength;

      for (let ci = 0; ci < stringColumns.length; ci++) {
        const col = stringColumns[ci];
        const cellOffset = rowOffset + col.offset;
        const ptrSize = col.valueType === BdatValueType.MessageId ? 2 : 4;
        if (cellOffset + ptrSize > origTableData.length) continue;

        const strOff = col.valueType === BdatValueType.MessageId
          ? origView.getUint16(cellOffset, true)
          : origView.getUint32(cellOffset, true);
        if (strOff === 0) continue;

        const absStrOffset = raw.stringTableOffset + strOff;
        if (absStrOffset >= origTableData.length) continue;

        // Read original string
        let entry = stringMap.get(strOff);
        if (!entry) {
          const { str } = readNullTermStr(origTableData, absStrOffset);
          const origBytes = encoder.encode(str);
          entry = {
            origOffset: strOff,
            origBytes,
            newBytes: origBytes, // default: keep original
            cells: [],
          };
          stringMap.set(strOff, entry);
        }

        entry.cells.push({ row: r, colIdx: ci, cellOffset, isMessageId: col.valueType === BdatValueType.MessageId });

        // Check if this cell has a translation
        const mapKey = `${table.name}:${r}:${col.name}`;
        const translation = translations.get(mapKey);
        if (translation !== undefined) {
          const transBytes = encoder.encode(translation);
          entry.newBytes = transBytes;
          patchedCount++;
        }
      }
    }

    // ---- Step 2: Build new string table ----
    // Preserve everything before the row-data strings (flag byte, table name, column names, hashes)
    // The string table starts with metadata (flag byte, names/hashes).
    // Row data string offsets are always > 0 (offset 0 means null/empty).

    // Find the minimum string offset referenced by row data
    const allOrigOffsets = [...stringMap.keys()].sort((a, b) => a - b);

    // Copy the string table prefix (metadata) unchanged
    // The metadata portion is everything from stringTableOffset to the first referenced string
    const metadataEnd = allOrigOffsets.length > 0
      ? Math.min(...allOrigOffsets)
      : raw.stringTableLength;

    // Build new string entries
    const newStringEntries: { origOffset: number; newOffset: number; newBytes: Uint8Array }[] = [];
    let currentNewOffset = metadataEnd; // start after metadata

    for (const origOff of allOrigOffsets) {
      const entry = stringMap.get(origOff)!;
      newStringEntries.push({
        origOffset: origOff,
        newOffset: currentNewOffset,
        newBytes: entry.newBytes,
      });
      currentNewOffset += entry.newBytes.length + 1; // +1 for null terminator
    }

    const newStringTableLength = currentNewOffset;

    // ---- Step 3: Build new table buffer ----
    // Everything before string table stays the same
    const preStringLength = raw.stringTableOffset;
    const newTableSize = preStringLength + newStringTableLength;
    const newTableData = new Uint8Array(newTableSize);

    // Copy everything before string table (header, column defs, hash table, row data)
    newTableData.set(origTableData.subarray(0, preStringLength));

    // Copy string table metadata (flag byte, names, etc.)
    const origMetadata = origTableData.subarray(raw.stringTableOffset, raw.stringTableOffset + metadataEnd);
    newTableData.set(origMetadata, raw.stringTableOffset);

    // Write new strings
    for (const entry of newStringEntries) {
      const absOff = raw.stringTableOffset + entry.newOffset;
      newTableData.set(entry.newBytes, absOff);
      newTableData[absOff + entry.newBytes.length] = 0; // null terminator
    }

    // ---- Step 4: Update string pointers in row data ----
    const newTableView = new DataView(newTableData.buffer, newTableData.byteOffset, newTableData.byteLength);

    // Build offset mapping: origOffset → newOffset
    const offsetMap = new Map<number, number>();
    for (const entry of newStringEntries) {
      offsetMap.set(entry.origOffset, entry.newOffset);
    }

    // Update all cell pointers
    for (const [origOff, entry] of stringMap) {
      const newOff = offsetMap.get(origOff);
      if (newOff === undefined) continue;
      for (const cell of entry.cells) {
        if (cell.isMessageId) {
          newTableView.setUint16(cell.cellOffset, newOff, true);
        } else {
          newTableView.setUint32(cell.cellOffset, newOff, true);
        }
      }
    }

    // ---- Step 5: Update stringTableLength in table header ----
    if (raw.isU32Layout) {
      newTableView.setUint32(0x2C, newStringTableLength, true);
    } else {
      newTableView.setUint32(0x24, newStringTableLength, true);
    }

    newTableBuffers.push(newTableData);
  }

  // ---- Step 6: Rebuild the full file ----
  // Calculate new table offsets
  const newTableOffsets: number[] = [];
  let currentFileOffset = fileHeaderSize;
  for (const buf of newTableBuffers) {
    newTableOffsets.push(currentFileOffset);
    currentFileOffset += buf.length;
  }
  const newFileSize = currentFileOffset;

  // Build the new file
  const result = new Uint8Array(newFileSize);
  const resultView = new DataView(result.buffer);

  // Write file header
  result.set(originalData.subarray(0, 16)); // magic + version + tableCount + fileSize
  resultView.setUint32(12, newFileSize, true); // update file size

  // Write table offsets
  for (let t = 0; t < newTableOffsets.length; t++) {
    resultView.setUint32(16 + t * 4, newTableOffsets[t], true);
  }

  // Write table data
  for (let t = 0; t < newTableBuffers.length; t++) {
    result.set(newTableBuffers[t], newTableOffsets[t]);
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
