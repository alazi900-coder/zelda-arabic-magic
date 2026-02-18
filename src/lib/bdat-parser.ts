/**
 * BDAT Binary Parser for Xenoblade Chronicles 3
 * 
 * Parses "Modern" BDAT format (XC3) based on bdat-rs specifications.
 * Supports hashed column/table names (Murmur3) and all 14 value types.
 */

// ============= Types =============

export enum BdatValueType {
  Unknown = 0,
  UnsignedByte = 1,
  UnsignedShort = 2,
  UnsignedInt = 3,
  SignedByte = 4,
  SignedShort = 5,
  SignedInt = 6,
  String = 7,
  Float = 8,
  Percent = 9,
  HashRef = 10,
  DebugString = 11,
  Unknown12 = 12,
  MessageId = 13,
}

/** Size in bytes for each value type */
const VALUE_TYPE_SIZE: Record<number, number> = {
  [BdatValueType.Unknown]: 0,
  [BdatValueType.UnsignedByte]: 1,
  [BdatValueType.UnsignedShort]: 2,
  [BdatValueType.UnsignedInt]: 4,
  [BdatValueType.SignedByte]: 1,
  [BdatValueType.SignedShort]: 2,
  [BdatValueType.SignedInt]: 4,
  [BdatValueType.String]: 4,
  [BdatValueType.Float]: 4,
  [BdatValueType.Percent]: 1,
  [BdatValueType.HashRef]: 4,
  [BdatValueType.DebugString]: 4,
  [BdatValueType.Unknown12]: 1,
  [BdatValueType.MessageId]: 2,
};

export interface BdatColumn {
  valueType: BdatValueType;
  nameOffset: number;   // offset into table's string table (or hash)
  name: string;         // resolved name (unhashed or raw)
  offset: number;       // byte offset within a row for this column's data
}

export interface BdatRow {
  id: number;
  values: Record<string, unknown>;
}

export interface BdatTable {
  name: string;
  nameHash: number | null;
  columns: BdatColumn[];
  rows: BdatRow[];
  baseId: number;
  // Internal data for writer
  _raw: {
    tableOffset: number;
    tableData: Uint8Array;
    columnCount: number;
    rowCount: number;
    rowLength: number;
    columnDefsOffset: number;
    hashTableOffset: number;
    rowDataOffset: number;
    stringTableOffset: number;
    stringTableLength: number;
    hashedNames: boolean;
    baseId: number;
  };
}

export interface BdatFile {
  tables: BdatTable[];
  version: number;
  fileSize: number;
  _raw: Uint8Array;  // original file bytes for writer
}

// ============= String Table Reading =============

function readNullTerminatedString(data: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  let i = offset;
  while (i < data.length && data[i] !== 0) {
    bytes.push(data[i]);
    i++;
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

// ============= Parser =============

function parseTableHeader(data: Uint8Array, tableOffset: number): BdatTable['_raw'] & { valid: boolean } {
  const view = new DataView(data.buffer, data.byteOffset + tableOffset);
  
  // Check magic "BDAT"
  const magic = String.fromCharCode(data[tableOffset], data[tableOffset + 1], data[tableOffset + 2], data[tableOffset + 3]);
  if (magic !== 'BDAT') {
    return { valid: false } as any;
  }

  // Table header layout (modern/XC3):
  // 0x00: Magic "BDAT" (4)
  // 0x04: Version u16 (2) — typically 0x3004
  // 0x06: padding (2)
  // 0x08: Column count u16 (2)
  // 0x0A: padding (2)
  // 0x0C: Row count u16 (2)
  // 0x0E: padding (2)
  // 0x10: Base ID u16 (2)
  // 0x12: padding (2)
  // 0x14: Unknown u32 (4) — always 0
  // 0x18: Column defs offset u16 (2)
  // 0x1A: Hash table offset u16 (2)
  // 0x1C: Row data offset u16 (2)
  // 0x1E: Row length u16 (2)
  // 0x20: String table offset u32 (4)
  // 0x24: String table length u32 (4)

  const columnCount = view.getUint16(0x08, true);
  const rowCount = view.getUint16(0x0C, true);
  const baseId = view.getUint16(0x10, true);
  const columnDefsOffset = view.getUint16(0x18, true);
  const hashTableOffset = view.getUint16(0x1A, true);
  const rowDataOffset = view.getUint16(0x1C, true);
  const rowLength = view.getUint16(0x1E, true);
  const stringTableOffset = view.getUint32(0x20, true);
  const stringTableLength = view.getUint32(0x24, true);

  // Calculate table size
  const tableSize = stringTableOffset + stringTableLength;
  const tableData = data.slice(tableOffset, tableOffset + tableSize);

  // Check if names are hashed: first byte of string table is a flag
  const hashedNames = stringTableLength > 0 ? tableData[stringTableOffset] === 0 : true;

  return {
    valid: true,
    tableOffset,
    tableData,
    columnCount,
    rowCount,
    rowLength,
    columnDefsOffset,
    hashTableOffset,
    rowDataOffset,
    stringTableOffset,
    stringTableLength,
    hashedNames,
    baseId,
  };
}

function parseColumns(tableData: Uint8Array, raw: BdatTable['_raw'], unhashFn: (hash: number) => string): BdatColumn[] {
  const columns: BdatColumn[] = [];
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  
  let currentOffset = 0; // track byte offset within each row

  for (let i = 0; i < raw.columnCount; i++) {
    const defOffset = raw.columnDefsOffset + i * 3;
    const valueType: BdatValueType = tableData[defOffset];
    const nameRef = view.getUint16(defOffset + 1, true);

    let name: string;
    if (raw.hashedNames) {
      // nameRef is index into a hash table at stringTableOffset
      // Each hash entry is 4 bytes (u32 murmur3 hash)
      // The hash is stored after the flag byte
      const hashOffset = raw.stringTableOffset + 1 + nameRef * 4;
      if (hashOffset + 4 <= tableData.length) {
        const hash = view.getUint32(hashOffset, true);
        name = unhashFn(hash);
      } else {
        name = `col_${i}`;
      }
    } else {
      // nameRef is offset into string table (after flag byte)
      const strOffset = raw.stringTableOffset + 1 + nameRef;
      name = readNullTerminatedString(tableData, strOffset);
      if (!name) name = `col_${i}`;
    }

    const size = VALUE_TYPE_SIZE[valueType] || 0;
    columns.push({ valueType, nameOffset: nameRef, name, offset: currentOffset });
    currentOffset += size;
  }

  return columns;
}

function parseRows(tableData: Uint8Array, raw: BdatTable['_raw'], columns: BdatColumn[]): BdatRow[] {
  const rows: BdatRow[] = [];
  const view = new DataView(tableData.buffer, tableData.byteOffset);

  for (let r = 0; r < raw.rowCount; r++) {
    const rowOffset = raw.rowDataOffset + r * raw.rowLength;
    const values: Record<string, unknown> = {};

    for (const col of columns) {
      const cellOffset = rowOffset + col.offset;
      if (cellOffset >= tableData.length) continue;

      switch (col.valueType) {
        case BdatValueType.UnsignedByte:
        case BdatValueType.Percent:
        case BdatValueType.Unknown12:
          values[col.name] = tableData[cellOffset];
          break;
        case BdatValueType.UnsignedShort:
        case BdatValueType.MessageId:
          values[col.name] = view.getUint16(cellOffset, true);
          break;
        case BdatValueType.UnsignedInt:
        case BdatValueType.HashRef:
          values[col.name] = view.getUint32(cellOffset, true);
          break;
        case BdatValueType.SignedByte:
          values[col.name] = view.getInt8(cellOffset);
          break;
        case BdatValueType.SignedShort:
          values[col.name] = view.getInt16(cellOffset, true);
          break;
        case BdatValueType.SignedInt:
          values[col.name] = view.getInt32(cellOffset, true);
          break;
        case BdatValueType.Float:
          values[col.name] = view.getFloat32(cellOffset, true);
          break;
        case BdatValueType.String:
        case BdatValueType.DebugString: {
          const strOffset = view.getUint32(cellOffset, true);
          if (strOffset > 0 && raw.stringTableOffset + strOffset < tableData.length) {
            values[col.name] = readNullTerminatedString(tableData, raw.stringTableOffset + strOffset);
          } else {
            values[col.name] = '';
          }
          break;
        }
        default:
          values[col.name] = null;
      }
    }

    rows.push({ id: raw.baseId + r, values });
  }

  return rows;
}

function getTableName(tableData: Uint8Array, raw: BdatTable['_raw'], tableIndex: number, unhashFn: (hash: number) => string): { name: string; hash: number | null } {
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  
  if (raw.hashedNames && raw.stringTableLength > 0) {
    // Table name hash is the first entry in the hash table (before column hashes)
    // Actually, the table name is typically at a fixed position
    // In XC3 modern format, table name is hashed and stored at string table offset + 1
    const hashOffset = raw.stringTableOffset + 1;
    if (hashOffset + 4 <= tableData.length) {
      const hash = view.getUint32(hashOffset, true);
      return { name: unhashFn(hash), hash };
    }
  } else if (raw.stringTableLength > 1) {
    // Table name is the first null-terminated string after the flag byte
    const name = readNullTerminatedString(tableData, raw.stringTableOffset + 1);
    if (name) return { name, hash: null };
  }
  
  return { name: `table_${tableIndex}`, hash: null };
}

/**
 * Parse a BDAT binary file and extract all tables with their data.
 */
export function parseBdatFile(data: Uint8Array, unhashFn?: (hash: number) => string): BdatFile {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  // File header
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== 'BDAT') {
    throw new Error(`Invalid BDAT file: expected magic "BDAT", got "${magic}"`);
  }

  const version = view.getUint32(4, true);
  const tableCount = view.getUint32(8, true);
  const fileSize = view.getUint32(12, true);

  const defaultUnhash = unhashFn || ((h: number) => `0x${h.toString(16).padStart(8, '0')}`);

  const tables: BdatTable[] = [];

  // Table offsets start at byte 16
  for (let t = 0; t < tableCount; t++) {
    const tableOffset = view.getUint32(16 + t * 4, true);
    
    const rawInfo = parseTableHeader(data, tableOffset);
    if (!rawInfo.valid) continue;

    const raw: BdatTable['_raw'] = {
      tableOffset: rawInfo.tableOffset,
      tableData: rawInfo.tableData,
      columnCount: rawInfo.columnCount,
      rowCount: rawInfo.rowCount,
      rowLength: rawInfo.rowLength,
      columnDefsOffset: rawInfo.columnDefsOffset,
      hashTableOffset: rawInfo.hashTableOffset,
      rowDataOffset: rawInfo.rowDataOffset,
      stringTableOffset: rawInfo.stringTableOffset,
      stringTableLength: rawInfo.stringTableLength,
      hashedNames: rawInfo.hashedNames,
      baseId: rawInfo.baseId,
    };

    const columns = parseColumns(rawInfo.tableData, raw, defaultUnhash);
    const rows = parseRows(rawInfo.tableData, raw, columns);
    const { name, hash } = getTableName(rawInfo.tableData, raw, t, defaultUnhash);

    tables.push({
      name,
      nameHash: hash,
      columns,
      rows,
      baseId: rawInfo.baseId,
      _raw: raw,
    });
  }

  return { tables, version, fileSize, _raw: data };
}

/**
 * Extract all translatable string entries from a parsed BDAT file.
 * Returns entries in the format compatible with the editor.
 */
export function extractBdatStrings(bdatFile: BdatFile, fileName: string): {
  key: string;
  original: string;
  tableName: string;
  rowIndex: number;
  columnName: string;
}[] {
  const entries: { key: string; original: string; tableName: string; rowIndex: number; columnName: string }[] = [];

  for (const table of bdatFile.tables) {
    const stringColumns = table.columns.filter(
      c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString
    );

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      for (const col of stringColumns) {
        const val = row.values[col.name];
        if (typeof val === 'string' && val.trim().length > 0) {
          // Skip pure numeric/hex strings
          if (/^[0-9a-fA-Fx<>]+$/.test(val.trim())) continue;
          
          const key = `bdat-bin:${fileName}:${table.name}:${r}:${col.name}`;
          entries.push({
            key,
            original: val,
            tableName: table.name,
            rowIndex: r,
            columnName: col.name,
          });
        }
      }
    }
  }

  return entries;
}
