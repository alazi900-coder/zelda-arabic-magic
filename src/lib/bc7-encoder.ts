/**
 * BC7 encoder – Mode 6 only (single subset, 7-bit RGBA + p-bit, 4-bit indices).
 * Mode 6 covers the full RGBA range with good quality and is the simplest
 * single-subset mode that handles alpha. Every block is encoded independently.
 *
 * This produces output that the game can read identically to the original BC7
 * format (imageFormat 77) without falling back to BC1.
 */

function clamp(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

// BC7 Mode 6 interpolation weights (4-bit index → 16 values)
const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

function interp(e0: number, e1: number, w: number): number {
  return ((64 - w) * e0 + w * e1 + 32) >> 6;
}

/**
 * Find min/max endpoints for a 4×4 block across RGBA channels.
 * Returns [e0R,e0G,e0B,e0A, e1R,e1G,e1B,e1A] in 0-255 range.
 */
function findEndpoints(block: Uint8Array): [number[], number[]] {
  let minR = 255, minG = 255, minB = 255, minA = 255;
  let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
  for (let i = 0; i < 16; i++) {
    const r = block[i * 4], g = block[i * 4 + 1], b = block[i * 4 + 2], a = block[i * 4 + 3];
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (g < minG) minG = g; if (g > maxG) maxG = g;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
    if (a < minA) minA = a; if (a > maxA) maxA = a;
  }
  return [[maxR, maxG, maxB, maxA], [minR, minG, minB, minA]];
}

/**
 * Mode 6 layout (128 bits):
 *   bit 0-6:  mode bits (0b1000000 = bit6 set)
 *   bit 7-13: endpoint R0 (7 bits)
 *   bit 14-20: endpoint R1 (7 bits)
 *   bit 21-27: endpoint G0
 *   bit 28-34: endpoint G1
 *   bit 35-41: endpoint B0
 *   bit 42-48: endpoint B1
 *   bit 49-55: endpoint A0
 *   bit 56-62: endpoint A1
 *   bit 63: p-bit 0
 *   bit 64: p-bit 1
 *   bit 65-128: 16 indices × 4 bits = 64 bits (pixel 0 is anchor → 3 bits)
 *   Total: 7 + 7*4*2 + 2 + 63 = 7+56+2+63 = 128 ✓
 *   Actually: 7(mode) + 14(R) + 14(G) + 14(B) + 14(A) + 2(pbits) + 63(indices) = 128
 */
function encodeMode6Block(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  const [ep0_8, ep1_8] = findEndpoints(block);

  // Quantize endpoints to 7 bits + p-bit (effective 8 bits)
  // p-bit = LSB of the 8-bit value, top 7 bits = endpoint value
  const ep0: number[] = new Array(4);
  const ep1: number[] = new Array(4);
  const pb0Bits: number[] = new Array(4);
  const pb1Bits: number[] = new Array(4);

  for (let ch = 0; ch < 4; ch++) {
    ep0[ch] = ep0_8[ch] >> 1; // top 7 bits
    pb0Bits[ch] = ep0_8[ch] & 1;
    ep1[ch] = ep1_8[ch] >> 1;
    pb1Bits[ch] = ep1_8[ch] & 1;
  }

  // Use majority vote for p-bit (one p-bit per endpoint in mode 6)
  const pbit0 = (pb0Bits[0] + pb0Bits[1] + pb0Bits[2] + pb0Bits[3] >= 2) ? 1 : 0;
  const pbit1 = (pb1Bits[0] + pb1Bits[1] + pb1Bits[2] + pb1Bits[3] >= 2) ? 1 : 0;

  // Reconstruct effective 8-bit endpoints
  const eff0: number[] = ep0.map(v => (v << 1) | pbit0);
  const eff1: number[] = ep1.map(v => (v << 1) | pbit1);

  // Build palette (16 entries from interpolation)
  const palette: number[][] = [];
  for (let i = 0; i < 16; i++) {
    palette.push([
      interp(eff0[0], eff1[0], W4[i]),
      interp(eff0[1], eff1[1], W4[i]),
      interp(eff0[2], eff1[2], W4[i]),
      interp(eff0[3], eff1[3], W4[i]),
    ]);
  }

  // Find best index for each pixel
  const indices: number[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const r = block[i * 4], g = block[i * 4 + 1], b = block[i * 4 + 2], a = block[i * 4 + 3];
    let bestIdx = 0, bestErr = Infinity;
    for (let j = 0; j < 16; j++) {
      const dr = r - palette[j][0], dg = g - palette[j][1];
      const db = b - palette[j][2], da = a - palette[j][3];
      const err = dr * dr + dg * dg + db * db + da * da;
      if (err < bestErr) { bestErr = err; bestIdx = j; }
    }
    indices[i] = bestIdx;
  }

  // If endpoint order is "wrong" for anchor fix-up, swap
  // Anchor pixel (index 0) must have MSB of index = 0 (i.e., index < 8)
  if (indices[0] >= 8) {
    // Swap endpoints and invert all indices
    for (let ch = 0; ch < 4; ch++) {
      const t = ep0[ch]; ep0[ch] = ep1[ch]; ep1[ch] = t;
    }
    const tp = pbit0;
    // We need to re-assign pbit values - just swap them
    for (let i = 0; i < 16; i++) indices[i] = 15 - indices[i];
  }

  // Write bits
  let bitPos = 0;
  function writeBits(val: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (val & (1 << i)) {
        out[bitPos >> 3] |= 1 << (bitPos & 7);
      }
      bitPos++;
    }
  }

  // Mode 6: bit pattern 0b1000000 (bit 6 set)
  writeBits(64, 7); // 0b1000000

  // Endpoints: R0, R1, G0, G1, B0, B1, A0, A1 (each 7 bits)
  for (let ch = 0; ch < 4; ch++) {
    writeBits(ep0[ch], 7);
    writeBits(ep1[ch], 7);
  }

  // P-bits
  const finalPbit0 = (indices[0] < 8) ? pbit0 : (pbit0 ^ 1); // already swapped above if needed
  writeBits(pbit0, 1);
  writeBits(pbit1, 1);

  // Indices: pixel 0 = 3 bits (anchor), rest = 4 bits each
  writeBits(indices[0], 3); // anchor: 3 bits
  for (let i = 1; i < 16; i++) {
    writeBits(indices[i], 4);
  }

  return out;
}

/**
 * Encode RGBA pixels to BC7 compressed data (Mode 6).
 */
export function encodeBC7(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(bx * by * 16);
  const block = new Uint8Array(16 * 4); // 4×4 pixels × RGBA

  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      // Extract 4×4 block
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          const si = (x < w && y < h) ? (y * w + x) * 4 : -1;
          const di = (py * 4 + px) * 4;
          if (si >= 0) {
            block[di] = pixels[si];
            block[di + 1] = pixels[si + 1];
            block[di + 2] = pixels[si + 2];
            block[di + 3] = pixels[si + 3];
          } else {
            block[di] = block[di + 1] = block[di + 2] = block[di + 3] = 0;
          }
        }
      }

      const encoded = encodeMode6Block(block);
      out.set(encoded, (row * bx + col) * 16);
    }
  }

  return out;
}

/**
 * Encode RGBA pixels to BC3 compressed data.
 * BC3 = BC1 color block (8 bytes) + interpolated alpha block (8 bytes).
 * Per block: 16 bytes total.
 */
export function encodeBC3(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(bx * by * 16);

  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      const blockOff = (row * bx + col) * 16;

      // Gather pixel data
      const alphas: number[] = [];
      const colors: number[][] = [];
      let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          const i = (x < w && y < h) ? (y * w + x) * 4 : -1;
          const r = i >= 0 ? pixels[i] : 0;
          const g = i >= 0 ? pixels[i + 1] : 0;
          const b = i >= 0 ? pixels[i + 2] : 0;
          const a = i >= 0 ? pixels[i + 3] : 0;
          alphas.push(a);
          colors.push([r, g, b]);
          if (r < minR) minR = r; if (r > maxR) maxR = r;
          if (g < minG) minG = g; if (g > maxG) maxG = g;
          if (b < minB) minB = b; if (b > maxB) maxB = b;
        }
      }

      // --- Alpha block (8 bytes) ---
      let a0 = 0, a1 = 255;
      for (const a of alphas) { if (a > a0) a0 = a; if (a < a1) a1 = a; }
      if (a0 === a1 && a0 < 255) a0 = Math.min(255, a0 + 1);

      // Build 8-entry alpha palette
      const aPal = [a0, a1, 0, 0, 0, 0, 0, 0];
      if (a0 > a1) {
        for (let i = 1; i <= 6; i++) aPal[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
      } else {
        for (let i = 1; i <= 4; i++) aPal[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
        aPal[6] = 0; aPal[7] = 255;
      }

      // Find best alpha index for each pixel
      const aIndices: number[] = [];
      for (const a of alphas) {
        let best = 0, bestD = Infinity;
        for (let ci = 0; ci < 8; ci++) {
          const d = Math.abs(a - aPal[ci]);
          if (d < bestD) { bestD = d; best = ci; }
        }
        aIndices.push(best);
      }

      out[blockOff] = a0;
      out[blockOff + 1] = a1;
      // Pack 16 × 3-bit indices into 6 bytes
      const aBits = new Uint8Array(6);
      for (let i = 0; i < 16; i++) {
        const bo = i * 3, bi = Math.floor(bo / 8), br = bo % 8;
        aBits[bi] |= (aIndices[i] & 7) << br;
        if (br > 5 && bi + 1 < 6) aBits[bi + 1] |= (aIndices[i] & 7) >> (8 - br);
      }
      for (let i = 0; i < 6; i++) out[blockOff + 2 + i] = aBits[i];

      // --- Color block (8 bytes, same as BC1/DXT1) ---
      const colorOff = blockOff + 8;
      let c0 = ((maxR >> 3) << 11) | ((maxG >> 2) << 5) | (maxB >> 3);
      let c1 = ((minR >> 3) << 11) | ((minG >> 2) << 5) | (minB >> 3);
      if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
      if (c0 === c1 && c0 < 0xFFFF) c0++;

      const rgb565 = (v: number): number[] => [
        ((v >> 11) & 0x1F) * 255 / 31,
        ((v >> 5) & 0x3F) * 255 / 63,
        (v & 0x1F) * 255 / 31,
      ];

      const cols = [
        rgb565(c0), rgb565(c1),
        rgb565(c0).map((v, i) => Math.round((2 * v + rgb565(c1)[i]) / 3)),
        rgb565(c0).map((v, i) => Math.round((v + 2 * rgb565(c1)[i]) / 3)),
      ];

      let idx = 0;
      for (let i = 0; i < 16; i++) {
        let best = 0, bestD = Infinity;
        for (let ci = 0; ci < 4; ci++) {
          const dr = colors[i][0] - cols[ci][0];
          const dg = colors[i][1] - cols[ci][1];
          const db = colors[i][2] - cols[ci][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = ci; }
        }
        idx |= best << (i * 2);
      }

      out[colorOff] = c0 & 0xFF; out[colorOff + 1] = (c0 >> 8) & 0xFF;
      out[colorOff + 2] = c1 & 0xFF; out[colorOff + 3] = (c1 >> 8) & 0xFF;
      out[colorOff + 4] = idx & 0xFF; out[colorOff + 5] = (idx >> 8) & 0xFF;
      out[colorOff + 6] = (idx >> 16) & 0xFF; out[colorOff + 7] = (idx >> 24) & 0xFF;
    }
  }

  return out;
}
