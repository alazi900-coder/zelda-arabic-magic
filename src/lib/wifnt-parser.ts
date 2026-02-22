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
 * Calculate BC1/DXT1 compressed data size for given dimensions (linear)
 */
function bc1DataSize(width: number, height: number): number {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  return blocksX * blocksY * 8; // 8 bytes per 4x4 block in BC1
}

/**
 * Calculate the swizzled (block-linear) data size, which is padded to GOB/block boundaries
 */
function bc1SwizzledSize(width: number, height: number): number {
  const bpp = 8; // bytes per BC1 block
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const byteWidth = blocksX * bpp;
  const gobsX = Math.ceil(byteWidth / 64);
  const blockHeight = getBlockHeight(blocksY);
  const gobsY = Math.ceil(blocksY / (8 * blockHeight));
  return gobsX * gobsY * blockHeight * 512;
}

/** Round up to next power of 2 */
function pow2RoundUp(v: number): number {
  v--;
  v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
  return v + 1;
}

/** Determine block_height in GOBs for a given height (in BC1 block rows) */
function getBlockHeight(heightInBlocks: number): number {
  let bh = pow2RoundUp(Math.ceil(heightInBlocks / 8));
  if (bh > 16) bh = 16;
  if (bh < 1) bh = 1;
  return bh;
}

/**
 * Tegra X1 Block Linear → Linear deswizzle for BC1 data.
 * Operates on BC1 block coordinates (each "pixel" = 4x4 pixel block = 8 bytes).
 */
function deswizzleBlockLinear(
  swizzledData: Uint8Array,
  widthInBlocks: number,
  heightInBlocks: number
): Uint8Array {
  const bpp = 8; // bytes per BC1 block
  const byteWidth = widthInBlocks * bpp;
  const gobsX = Math.ceil(byteWidth / 64);
  const blockHeight = getBlockHeight(heightInBlocks);
  const linearSize = widthInBlocks * heightInBlocks * bpp;
  const linear = new Uint8Array(linearSize);

  for (let y = 0; y < heightInBlocks; y++) {
    for (let x = 0; x < widthInBlocks; x++) {
      const linearOffset = (y * widthInBlocks + x) * bpp;
      const swizzledOffset = getAddrBlockLinear(x, y, widthInBlocks, bpp, blockHeight, gobsX);
      if (swizzledOffset + bpp <= swizzledData.length) {
        linear.set(swizzledData.subarray(swizzledOffset, swizzledOffset + bpp), linearOffset);
      }
    }
  }
  return linear;
}

/**
 * Linear → Tegra X1 Block Linear reswizzle for BC1 data.
 */
function swizzleBlockLinear(
  linearData: Uint8Array,
  widthInBlocks: number,
  heightInBlocks: number
): Uint8Array {
  const bpp = 8;
  const byteWidth = widthInBlocks * bpp;
  const gobsX = Math.ceil(byteWidth / 64);
  const blockHeight = getBlockHeight(heightInBlocks);
  const gobsY = Math.ceil(heightInBlocks / (8 * blockHeight));
  const swizzledSize = gobsX * gobsY * blockHeight * 512;
  const swizzled = new Uint8Array(swizzledSize);

  for (let y = 0; y < heightInBlocks; y++) {
    for (let x = 0; x < widthInBlocks; x++) {
      const linearOffset = (y * widthInBlocks + x) * bpp;
      const swizzledOffset = getAddrBlockLinear(x, y, widthInBlocks, bpp, blockHeight, gobsX);
      if (linearOffset + bpp <= linearData.length && swizzledOffset + bpp <= swizzled.length) {
        swizzled.set(linearData.subarray(linearOffset, linearOffset + bpp), swizzledOffset);
      }
    }
  }
  return swizzled;
}

/**
 * Tegra X1 TRM block linear address calculation.
 * x, y are in "block" coordinates for BC1 (each block = 4x4 pixels).
 */
function getAddrBlockLinear(
  x: number, y: number,
  widthInBlocks: number, bpp: number,
  blockHeight: number, gobsX: number
): number {
  const xByte = x * bpp;
  const gobAddress =
    Math.floor(y / (8 * blockHeight)) * 512 * blockHeight * gobsX +
    Math.floor(xByte / 64) * 512 * blockHeight +
    Math.floor((y % (8 * blockHeight)) / 8) * 512;
  const xInGob = xByte % 64;
  const yInGob = y % 8;
  // GOB internal layout (Tegra X1 TRM)
  const inGobOffset =
    ((yInGob >> 1) << 7) | // bit4 of y → bit7
    ((xInGob >> 5) << 6) | // bit5 of x → bit6
    ((yInGob & 1) << 5) |  // bit0 of y → bit5
    (xInGob & 0x1F);       // bits 0-4 of x → bits 0-4
  return gobAddress + inGobOffset;
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

  // Calculate expected texture data size (swizzled, padded to block boundaries)
  const expectedTextureSize = bc1SwizzledSize(ATLAS_WIDTH, ATLAS_HEIGHT);
  
  // Try to find where texture data starts by looking at file size
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
    const swizzled = new Uint8Array(
      fileData,
      info.textureDataOffset,
      Math.min(info.textureDataSize, fileData.byteLength - info.textureDataOffset)
    );
    // Deswizzle from Tegra X1 block linear to linear BC1 data
    const blocksX = Math.ceil(info.textureWidth / 4);
    const blocksY = Math.ceil(info.textureHeight / 4);
    const linearBC1 = deswizzleBlockLinear(swizzled, blocksX, blocksY);
    const rgba = decodeDXT1(linearBC1, info.textureWidth, info.textureHeight);
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

/**
 * Encode RGBA pixels to BC1 (DXT1) compressed data
 */
export function encodeDXT1(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const output = new Uint8Array(blocksX * blocksY * 8);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Extract 4x4 block colors
      const blockColors: [number, number, number, number][] = [];
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x < width && y < height) {
            const i = (y * width + x) * 4;
            blockColors.push([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]);
          } else {
            blockColors.push([0, 0, 0, 0]);
          }
        }
      }

      // Find min/max colors (simple bounding box)
      let minR = 255, minG = 255, minB = 255;
      let maxR = 0, maxG = 0, maxB = 0;
      let hasTransparent = false;

      for (const [r, g, b, a] of blockColors) {
        if (a < 128) { hasTransparent = true; continue; }
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (g < minG) minG = g; if (g > maxG) maxG = g;
        if (b < minB) minB = b; if (b > maxB) maxB = b;
      }

      let c0 = rgbaToRGB565(maxR, maxG, maxB);
      let c1 = rgbaToRGB565(minR, minG, minB);

      // For transparent mode, ensure c0 <= c1
      if (hasTransparent) {
        if (c0 > c1) { const tmp = c0; c0 = c1; c1 = tmp; }
      } else {
        if (c0 < c1) { const tmp = c0; c0 = c1; c1 = tmp; }
        if (c0 === c1 && c0 < 0xFFFF) c0++;
      }

      const colors = [rgb565Decode(c0), rgb565Decode(c1), [0, 0, 0], [0, 0, 0]] as number[][];
      if (c0 > c1) {
        colors[2] = [Math.round((2 * colors[0][0] + colors[1][0]) / 3), Math.round((2 * colors[0][1] + colors[1][1]) / 3), Math.round((2 * colors[0][2] + colors[1][2]) / 3)];
        colors[3] = [Math.round((colors[0][0] + 2 * colors[1][0]) / 3), Math.round((colors[0][1] + 2 * colors[1][1]) / 3), Math.round((colors[0][2] + 2 * colors[1][2]) / 3)];
      } else {
        colors[2] = [Math.round((colors[0][0] + colors[1][0]) / 2), Math.round((colors[0][1] + colors[1][1]) / 2), Math.round((colors[0][2] + colors[1][2]) / 2)];
        colors[3] = [0, 0, 0]; // transparent
      }

      // Build index bits
      let indices = 0;
      for (let i = 0; i < 16; i++) {
        const [r, g, b, a] = blockColors[i];
        let best = 0;
        if (hasTransparent && a < 128) {
          best = 3;
        } else {
          let bestDist = Infinity;
          const limit = hasTransparent ? 3 : 4;
          for (let ci = 0; ci < limit; ci++) {
            const dr = r - colors[ci][0], dg = g - colors[ci][1], db = b - colors[ci][2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) { bestDist = dist; best = ci; }
          }
        }
        indices |= (best << (i * 2));
      }

      const blockOffset = (by * blocksX + bx) * 8;
      output[blockOffset] = c0 & 0xFF;
      output[blockOffset + 1] = (c0 >> 8) & 0xFF;
      output[blockOffset + 2] = c1 & 0xFF;
      output[blockOffset + 3] = (c1 >> 8) & 0xFF;
      output[blockOffset + 4] = indices & 0xFF;
      output[blockOffset + 5] = (indices >> 8) & 0xFF;
      output[blockOffset + 6] = (indices >> 16) & 0xFF;
      output[blockOffset + 7] = (indices >> 24) & 0xFF;
    }
  }
  return output;
}

function rgbaToRGB565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

function rgb565Decode(c: number): number[] {
  return [
    Math.round(((c >> 11) & 0x1F) * 255 / 31),
    Math.round(((c >> 5) & 0x3F) * 255 / 63),
    Math.round((c & 0x1F) * 255 / 31),
  ];
}

/**
 * Rebuild a WIFNT file by replacing the texture data with new RGBA pixels
 */
export function rebuildWifnt(
  originalFile: ArrayBuffer,
  info: WifntInfo,
  newPixels: Uint8Array | Uint8ClampedArray
): ArrayBuffer {
  const linearBC1 = encodeDXT1(newPixels, info.textureWidth, info.textureHeight);
  // Reswizzle to Tegra X1 block linear layout
  const blocksX = Math.ceil(info.textureWidth / 4);
  const blocksY = Math.ceil(info.textureHeight / 4);
  const swizzled = swizzleBlockLinear(linearBC1, blocksX, blocksY);
  const header = new Uint8Array(originalFile, 0, info.textureDataOffset);
  const result = new Uint8Array(header.length + swizzled.length);
  result.set(header);
  result.set(swizzled, header.length);
  return result.buffer;
}
