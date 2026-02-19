/**
 * BFTTF Converter — Convert TTF/OTF ↔ BFTTF (Nintendo Switch format)
 * 
 * BFTTF is a simple XOR encryption on top of TTF/OTF fonts used by Switch games.
 * Based on the algorithm from switch-stuff/BFTTF-Converter.
 */

const BFTTF_KEY = 0x06186249;
const BFTTF_MAGIC_XOR = 0x18029a7f; // Magic header value before XOR

/**
 * Encrypt a TTF/OTF file to BFTTF format for Nintendo Switch.
 */
export function ttfToBfttf(ttfData: ArrayBuffer): ArrayBuffer {
  const input = new DataView(ttfData);
  const inputLen = ttfData.byteLength;
  
  // Pad input to multiple of 4 bytes
  const paddedLen = Math.ceil(inputLen / 4) * 4;
  
  // Output: 8 bytes header + padded TTF data
  const output = new ArrayBuffer(8 + paddedLen);
  const outView = new DataView(output);
  
  // Write encrypted header
  // First 4 bytes: magic XORed with key
  outView.setUint32(0, (BFTTF_MAGIC_XOR ^ BFTTF_KEY) >>> 0, true);
  // Next 4 bytes: file size (byte-flipped) XORed with key
  outView.setUint32(4, (flipBytes(inputLen) ^ BFTTF_KEY) >>> 0, true);
  
  // XOR each 4-byte block of the TTF data
  const paddedInput = new Uint8Array(paddedLen);
  paddedInput.set(new Uint8Array(ttfData));
  const paddedView = new DataView(paddedInput.buffer);
  
  for (let i = 0; i < paddedLen / 4; i++) {
    const val = paddedView.getUint32(i * 4, true);
    outView.setUint32(8 + i * 4, (val ^ BFTTF_KEY) >>> 0, true);
  }
  
  return output;
}

/**
 * Decrypt a BFTTF file back to TTF/OTF format.
 */
export function bfttfToTtf(bfttfData: ArrayBuffer): ArrayBuffer {
  const input = new DataView(bfttfData);
  const dataLen = bfttfData.byteLength - 8;
  
  if (dataLen <= 0) throw new Error("ملف BFTTF غير صالح — حجمه صغير جداً");
  
  // Read and decrypt the original size from header
  const sizeXored = input.getUint32(4, true);
  const originalSize = flipBytes((sizeXored ^ BFTTF_KEY) >>> 0);
  
  const output = new ArrayBuffer(originalSize > 0 && originalSize <= dataLen ? originalSize : dataLen);
  const outView = new DataView(output);
  
  const blocks = Math.ceil(output.byteLength / 4);
  for (let i = 0; i < blocks; i++) {
    const val = input.getUint32(8 + i * 4, true);
    outView.setUint32(i * 4, (val ^ BFTTF_KEY) >>> 0, true);
  }
  
  return output;
}

/**
 * Check if a file is in BFTTF format by checking magic header.
 */
export function isBfttf(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) return false;
  const view = new DataView(data);
  const magic = (view.getUint32(0, true) ^ BFTTF_KEY) >>> 0;
  return magic === BFTTF_MAGIC_XOR;
}

/** Flip byte order of a 32-bit unsigned integer */
function flipBytes(val: number): number {
  return (
    ((val & 0x000000ff) << 24) +
    ((val & 0x0000ff00) << 8) +
    ((val & 0x00ff0000) >> 8) +
    ((val & 0xff000000) >>> 24)
  ) >>> 0;
}
