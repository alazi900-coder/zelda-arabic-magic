/**
 * BDAT Binary Writer for Xenoblade Chronicles 3
 * 
 * Rebuilds BDAT binary files after modifying string values.
 * Strategy: Build a new string table with translated strings,
 * update all string offsets in row data, and recalculate sizes.
 */

import { BdatFile, BdatTable, BdatValueType } from './bdat-parser';

interface StringTranslation {
  tableName: string;
  rowIndex: number;
  columnName: string;
  translated: string;  // already processed (reshaped + reversed)
}

/**
 * Rebuild a BDAT file with translated strings injected.
 * 
 * @param bdatFile - The parsed BDAT file (from parseBdatFile)
 * @param translations - Map of "tableName:rowIndex:columnName" -> translated string
 * @returns New Uint8Array with the rebuilt BDAT file
 */
export function rebuildBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>
): Uint8Array {
  const originalData = bdatFile._raw;
  const originalView = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);
  
  // Rebuild each table separately, then assemble the file
  const rebuiltTables: { offset: number; data: Uint8Array }[] = [];
  
  // File header size: 16 + tableCount * 4
  const fileHeaderSize = 16 + bdatFile.tables.length * 4;

  let currentOffset = fileHeaderSize;

  for (const table of bdatFile.tables) {
    const rebuiltTable = rebuildTable(table, translations);
    rebuiltTables.push({ offset: currentOffset, data: rebuiltTable });
    currentOffset += rebuiltTable.length;
  }

  // Build the final file
  const totalSize = currentOffset;
  const result = new Uint8Array(totalSize);
  const resultView = new DataView(result.buffer);

  // Write file header
  // Magic "BDAT"
  result[0] = 0x42; result[1] = 0x44; result[2] = 0x41; result[3] = 0x54;
  // Version (copy from original)
  resultView.setUint32(4, bdatFile.version, true);
  // Table count
  resultView.setUint32(8, bdatFile.tables.length, true);
  // File size
  resultView.setUint32(12, totalSize, true);

  // Write table offsets
  for (let t = 0; t < rebuiltTables.length; t++) {
    resultView.setUint32(16 + t * 4, rebuiltTables[t].offset, true);
  }

  // Write table data
  for (const rt of rebuiltTables) {
    result.set(rt.data, rt.offset);
  }

  return result;
}

function rebuildTable(table: BdatTable, translations: Map<string, string>): Uint8Array {
  const raw = table._raw;
  const tableData = raw.tableData;
  const tableView = new DataView(tableData.buffer, tableData.byteOffset, tableData.byteLength);

  // Find string columns
  const stringColumns = table.columns.filter(
    c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString
  );

  // Build new string table
  const encoder = new TextEncoder();
  const stringEntries: { offset: number; bytes: Uint8Array }[] = [];
  
  // Map: old string offset -> new string offset
  const offsetMap = new Map<number, number>();
  
  // Collect all unique string offsets and their values
  // First, copy the flag byte and existing non-data strings (like column/table name hashes)
  const oldStringTable = tableData.slice(raw.stringTableOffset, raw.stringTableOffset + raw.stringTableLength);
  
  // Start new string table with the same flag byte + name hashes section
  // The name hashes/strings section is before any data strings
  // We need to preserve the entire label section and only replace data string content
  
  // Calculate where data strings start in the old string table
  // Data strings are referenced by row data, and their offsets are relative to stringTableOffset
  
  // Collect all string references from rows
  const stringRefs = new Map<number, string>(); // old offset -> current string value
  
  for (let r = 0; r < raw.rowCount; r++) {
    const rowOffset = raw.rowDataOffset + r * raw.rowLength;
    for (const col of stringColumns) {
      const cellOffset = rowOffset + col.offset;
      if (cellOffset + 4 > tableData.length) continue;
      const strOff = tableView.getUint32(cellOffset, true);
      if (strOff === 0) continue;
      
      // Check if there's a translation for this cell
      const key = `${table.name}:${r}:${col.name}`;
      const translation = translations.get(key);
      
      if (translation !== undefined) {
        stringRefs.set(strOff, translation);
      } else {
        // Keep original string
        const originalStr = readStringAt(tableData, raw.stringTableOffset + strOff);
        stringRefs.set(strOff, originalStr);
      }
    }
  }

  // Now build the new string table
  // Copy the header portion (flag + name hashes) as-is
  // Find the minimum data string offset to know where header ends
  const dataStringOffsets = Array.from(stringRefs.keys()).filter(o => o > 0).sort((a, b) => a - b);
  
  // The header portion is everything before the first data string
  let headerEndOffset: number;
  if (dataStringOffsets.length > 0) {
    headerEndOffset = dataStringOffsets[0];
  } else {
    // No data strings, copy entire string table
    headerEndOffset = raw.stringTableLength;
  }

  // Copy header portion
  const headerBytes = oldStringTable.slice(0, headerEndOffset);
  
  // Build data strings portion
  const dataStrings: Uint8Array[] = [];
  let currentDataOffset = headerEndOffset;

  // Sort offsets to maintain order
  for (const oldOff of dataStringOffsets) {
    const str = stringRefs.get(oldOff)!;
    offsetMap.set(oldOff, currentDataOffset);
    const strBytes = encoder.encode(str);
    const withNull = new Uint8Array(strBytes.length + 1);
    withNull.set(strBytes);
    withNull[strBytes.length] = 0;
    dataStrings.push(withNull);
    currentDataOffset += withNull.length;
  }

  // Assemble new string table
  let totalDataStringsSize = 0;
  for (const ds of dataStrings) totalDataStringsSize += ds.length;
  const newStringTableLength = headerEndOffset + totalDataStringsSize;
  const newStringTable = new Uint8Array(newStringTableLength);
  newStringTable.set(headerBytes);
  let writePos = headerEndOffset;
  for (const ds of dataStrings) {
    newStringTable.set(ds, writePos);
    writePos += ds.length;
  }

  // Build the new table
  // Everything before string table stays the same, except we update string offsets in row data
  const preStringData = new Uint8Array(raw.stringTableOffset);
  preStringData.set(tableData.slice(0, raw.stringTableOffset));

  // Update string offsets in row data
  const preStringView = new DataView(preStringData.buffer);
  for (let r = 0; r < raw.rowCount; r++) {
    const rowOffset = raw.rowDataOffset + r * raw.rowLength;
    for (const col of stringColumns) {
      const cellOffset = rowOffset + col.offset;
      if (cellOffset + 4 > preStringData.length) continue;
      const oldOff = tableView.getUint32(cellOffset, true);
      if (oldOff === 0) continue;
      const newOff = offsetMap.get(oldOff);
      if (newOff !== undefined) {
        preStringView.setUint32(cellOffset, newOff, true);
      }
    }
  }

  // Update string table offset and length in table header
  // 0x20: String Table Offset (u32)
  // 0x24: String Table Length (u32)
  preStringView.setUint32(0x20, raw.stringTableOffset, true); // offset stays same
  preStringView.setUint32(0x24, newStringTableLength, true);  // length may change

  // Assemble final table
  const newTableData = new Uint8Array(raw.stringTableOffset + newStringTableLength);
  newTableData.set(preStringData);
  newTableData.set(newStringTable, raw.stringTableOffset);

  return newTableData;
}

function readStringAt(data: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  let i = offset;
  while (i < data.length && data[i] !== 0) {
    bytes.push(data[i]);
    i++;
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}
