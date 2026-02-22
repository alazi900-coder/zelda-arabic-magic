

## Fix: WIFNT Font Texture Deswizzling

### Root Cause

The font atlas appears garbled because the **Tegra X1 Block Linear address calculation** has the wrong bit arrangement for the in-GOB (Group of Bytes) offset. This is the core algorithm that converts between tiled GPU memory and linear CPU memory.

### What's Wrong

**Bug 1: Wrong in-GOB address bits**

The current code calculates the position within a GOB like this:
```
[bits 8-7: y2-1] [bit 6: x5] [bit 5: y0] [bits 4-0: x4-0]
```

The correct calculation (from KillzXGaming/Switch-Toolbox reference) should be:
```
[bit 8: x5] [bits 7-6: y2-1] [bit 5: x4] [bit 4: y0] [bits 3-0: x3-0]
```

Every single pixel is being read from the wrong memory location, resulting in garbled output.

**Bug 2: Overcomplicated textureDataOffset**

The LAFT header already stores the texture offset at byte 36 and the texture size at byte 40. The current code tries to compute the offset from the Mibl footer's imageSize using complex alignment math, which is error-prone. We should read the offset directly from the LAFT header.

### Fix Plan

**File: `src/lib/wifnt-parser.ts`**

1. **Rewrite `getAddrBlockLinear`** to match the reference implementation exactly:
   - Use the correct formula: `((x%64)/32)*256 + ((y%8)/2)*64 + ((x%32)/16)*32 + (y%2)*16 + (x%16)`
   - This is the established Tegra X1 TRM formula used by all working Switch modding tools

2. **Read texture offset from LAFT header** (byte 36) instead of computing it from the Mibl footer:
   - `textureDataOffset = view.getUint32(36, true)` from the LAFT header
   - `textureSize = view.getUint32(40, true)` from the LAFT header
   - Falls back to Mibl footer calculation only if the header values are invalid

3. **Add more diagnostic logging** to help verify the fix is working:
   - Log the actual texture offset, data sizes, and block dimensions used during deswizzling

### Technical Details

The `getAddrBlockLinear` function implements the Tegra X1 TRM (Technical Reference Manual) address calculation. A GOB is a 64x8 byte (512 total bytes) tile. The address within a GOB is a specific interleaving of x and y bit positions. Getting even one bit wrong scrambles the entire texture.

The reference implementation from Switch-Toolbox (ported from AboodXD's BNTX Extractor) is:

```text
GOB_address = base_address
    + (y / (8 * block_height)) * 512 * block_height * image_width_in_gobs
    + (x * bytes_per_pixel / 64) * 512 * block_height
    + (y % (8 * block_height) / 8) * 512

x *= bytes_per_pixel

Address = GOB_address
    + ((x % 64) / 32) * 256
    + ((y % 8) / 2) * 64
    + ((x % 32) / 16) * 32
    + (y % 2) * 16
    + (x % 16)
```

