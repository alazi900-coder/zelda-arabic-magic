/**
 * WIFNT (LAFT) Font Parser for Xenoblade Chronicles 3
 * 
 * The font is a BC1 (DXT1) compressed texture atlas:
 * - Texture size: 2800×171 pixels
 * - Grid: 50 columns × 3 rows = 150 characters
 * - Each character cell: 56×57 pixels
 * - Characters: ASCII + Western European + special symbols
 */

export interface WifntInfo {
  fileSize: number;
  magic: string;
  valid: boolean;
  // Texture atlas info
  textureWidth: number;
  textureHeight: number;
  gridCols: number;
  gridRows: number;
  cellWidth: number;
  cellHeight: number;
  glyphCount: number;
  // Header data
  headerSize: number;
  textureDataOffset: number;
  textureDataSize: number;
  // Raw header bytes for inspection
  headerHex: string;
}

// Known WIFNT atlas constants for XC3
const ATLAS_WIDTH = 2800;
const ATLAS_HEIGHT = 171;
const GRID_COLS = 50;
const GRID_ROWS = 3;
const CELL_WIDTH = 56;
const CELL_HEIGHT = 57;
const GLYPH_COUNT = GRID_COLS * GRID_ROWS; // 150

/**
 * Calculate BC1/DXT1 compressed data size for given dimensions
 */
function bc1DataSize(width: number, height: number): number {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  return blocksX * blocksY * 8; // 8 bytes per 4x4 block in BC1
}

/**
 * Analyze a WIFNT file and extract structure information
 */
export function analyzeWifnt(data: ArrayBuffer): WifntInfo {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  
  // Read magic bytes
  const magic = data.byteLength >= 4
    ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
    : "????";

  const valid = magic === "LAFT" || magic === "TFAL";

  // Extract first 64 bytes as hex for inspection
  const headerBytes = Math.min(64, data.byteLength);
  const headerHex = Array.from(bytes.slice(0, headerBytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");

  // Calculate expected texture data size
  const expectedTextureSize = bc1DataSize(ATLAS_WIDTH, ATLAS_HEIGHT);
  
  // Try to find where texture data starts by looking at file size
  // textureDataOffset = fileSize - expectedTextureSize (approximately)
  const textureDataOffset = data.byteLength - expectedTextureSize;
  const headerSize = Math.max(0, textureDataOffset);

  return {
    fileSize: data.byteLength,
    magic,
    valid,
    textureWidth: ATLAS_WIDTH,
    textureHeight: ATLAS_HEIGHT,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    cellWidth: CELL_WIDTH,
    cellHeight: CELL_HEIGHT,
    glyphCount: GLYPH_COUNT,
    headerSize,
    textureDataOffset: Math.max(0, textureDataOffset),
    textureDataSize: expectedTextureSize,
    headerHex,
  };
}

/**
 * Decode BC1 (DXT1) compressed texture data to RGBA pixels
 */
export function decodeDXT1(
  compressedData: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const output = new Uint8Array(width * height * 4);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockIndex = (by * blocksX + bx) * 8;
      if (blockIndex + 8 > compressedData.length) break;

      // Read two 16-bit colors (RGB565)
      const c0 = compressedData[blockIndex] | (compressedData[blockIndex + 1] << 8);
      const c1 = compressedData[blockIndex + 2] | (compressedData[blockIndex + 3] << 8);

      // Decode RGB565 to RGB888
      const colors: [number, number, number, number][] = [
        rgb565ToRGBA(c0),
        rgb565ToRGBA(c1),
        [0, 0, 0, 255],
        [0, 0, 0, 255],
      ];

      if (c0 > c1) {
        // 4-color mode (opaque)
        colors[2] = [
          Math.round((2 * colors[0][0] + colors[1][0]) / 3),
          Math.round((2 * colors[0][1] + colors[1][1]) / 3),
          Math.round((2 * colors[0][2] + colors[1][2]) / 3),
          255,
        ];
        colors[3] = [
          Math.round((colors[0][0] + 2 * colors[1][0]) / 3),
          Math.round((colors[0][1] + 2 * colors[1][1]) / 3),
          Math.round((colors[0][2] + 2 * colors[1][2]) / 3),
          255,
        ];
      } else {
        // 3-color + transparent mode
        colors[2] = [
          Math.round((colors[0][0] + colors[1][0]) / 2),
          Math.round((colors[0][1] + colors[1][1]) / 2),
          Math.round((colors[0][2] + colors[1][2]) / 2),
          255,
        ];
        colors[3] = [0, 0, 0, 0]; // Transparent
      }

      // Read 4 bytes of 2-bit lookup indices
      const indices = compressedData[blockIndex + 4]
        | (compressedData[blockIndex + 5] << 8)
        | (compressedData[blockIndex + 6] << 16)
        | (compressedData[blockIndex + 7] << 24);

      // Write 4×4 pixel block
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= width || y >= height) continue;

          const bitIndex = (py * 4 + px) * 2;
          const colorIndex = (indices >>> bitIndex) & 0x3;
          const color = colors[colorIndex];

          const outIndex = (y * width + x) * 4;
          output[outIndex] = color[0];
          output[outIndex + 1] = color[1];
          output[outIndex + 2] = color[2];
          output[outIndex + 3] = color[3];
        }
      }
    }
  }

  return output;
}

function rgb565ToRGBA(c: number): [number, number, number, number] {
  const r = ((c >> 11) & 0x1F) * 255 / 31;
  const g = ((c >> 5) & 0x3F) * 255 / 63;
  const b = (c & 0x1F) * 255 / 31;
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

/**
 * Extract the texture data from a WIFNT file and decode it to an ImageData-compatible RGBA array
 */
export function decodeWifntTexture(
  fileData: ArrayBuffer,
  info: WifntInfo
): Uint8ClampedArray | null {
  try {
    const compressed = new Uint8Array(
      fileData,
      info.textureDataOffset,
      Math.min(info.textureDataSize, fileData.byteLength - info.textureDataOffset)
    );
    const rgba = decodeDXT1(compressed, info.textureWidth, info.textureHeight);
    return new Uint8ClampedArray(rgba.buffer);
  } catch {
    return null;
  }
}

/**
 * Render the full texture atlas to a canvas and return it
 */
export function renderAtlasToCanvas(
  fileData: ArrayBuffer,
  info: WifntInfo
): HTMLCanvasElement | null {
  const pixels = decodeWifntTexture(fileData, info);
  if (!pixels) return null;

  const canvas = document.createElement("canvas");
  canvas.width = info.textureWidth;
  canvas.height = info.textureHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = new ImageData(new Uint8ClampedArray(pixels), info.textureWidth, info.textureHeight);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Extract a single glyph from the atlas as a canvas
 */
export function extractGlyph(
  atlasCanvas: HTMLCanvasElement,
  info: WifntInfo,
  index: number
): HTMLCanvasElement | null {
  if (index < 0 || index >= info.glyphCount) return null;

  const col = index % info.gridCols;
  const row = Math.floor(index / info.gridCols);
  const x = col * info.cellWidth;
  const y = row * info.cellHeight;

  const canvas = document.createElement("canvas");
  canvas.width = info.cellWidth;
  canvas.height = info.cellHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    atlasCanvas,
    x, y, info.cellWidth, info.cellHeight,
    0, 0, info.cellWidth, info.cellHeight
  );
  return canvas;
}
