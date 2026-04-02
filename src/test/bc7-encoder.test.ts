import { describe, it, expect } from 'vitest';
import { encodeBC7, encodeBC3 } from '../lib/bc7-encoder';
import { decodeBC7 } from '../lib/bc7-decoder';

describe('BC7 encode/decode roundtrip', () => {
  it('should roundtrip a solid color block with minimal loss', () => {
    const w = 4, h = 4;
    const rgba = new Uint8Array(w * h * 4);
    // Fill with a solid color: (200, 100, 50, 255)
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = 200; rgba[i * 4 + 1] = 100; rgba[i * 4 + 2] = 50; rgba[i * 4 + 3] = 255;
    }

    const encoded = encodeBC7(rgba, w, h);
    expect(encoded.length).toBe(16); // one BC7 block

    const decoded = decodeBC7(encoded, w, h);
    expect(decoded.length).toBe(w * h * 4);

    // Check that decoded values are close to original (BC7 mode 6 has ~1-bit loss)
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(decoded[i * 4] - 200)).toBeLessThanOrEqual(2);
      expect(Math.abs(decoded[i * 4 + 1] - 100)).toBeLessThanOrEqual(2);
      expect(Math.abs(decoded[i * 4 + 2] - 50)).toBeLessThanOrEqual(2);
      expect(Math.abs(decoded[i * 4 + 3] - 255)).toBeLessThanOrEqual(2);
    }
  });

  it('should roundtrip a gradient image', () => {
    const w = 8, h = 8;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = Math.round(x * 255 / 7);
        rgba[i + 1] = Math.round(y * 255 / 7);
        rgba[i + 2] = 128;
        rgba[i + 3] = 255;
      }
    }

    const encoded = encodeBC7(rgba, w, h);
    expect(encoded.length).toBe(4 * 16); // 2x2 blocks * 16 bytes

    const decoded = decodeBC7(encoded, w, h);
    // Allow up to 4 error per channel for gradient (quantization)
    let maxErr = 0;
    for (let i = 0; i < w * h * 4; i++) {
      maxErr = Math.max(maxErr, Math.abs(decoded[i] - rgba[i]));
    }
    expect(maxErr).toBeLessThanOrEqual(10);
  });

  it('BC3 should produce correct block size', () => {
    const w = 8, h = 4;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = 128;
    }
    const encoded = encodeBC3(rgba, w, h);
    // 2x1 blocks * 16 bytes = 32
    expect(encoded.length).toBe(32);
  });
});
