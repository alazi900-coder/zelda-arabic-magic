

# Fix: Garbled Text in MSBT Extraction (UTF-16 Alignment Bug)

## Root Cause

The `parseMSBT` function in `supabase/functions/arabize/index.ts` has an incorrect MSBT control code structure assumption.

### Current (Wrong)

The code assumes a **6-byte** tag header:

```text
0x000E (2) + group (2) + size (2) + data (size)
```

And reads `tagSize` from offset `j+4`.

### Actual MSBT Format (Nintendo TOTK)

The real structure is an **8-byte** header:

```text
0x000E (2) + group (2) + type (2) + paramSize (2) + params (paramSize)
```

The size field is at offset `j+6`, not `j+4`. By reading the "type" field as "size", the code:
1. Gets a wrong byte count to skip
2. Leaves leftover tag bytes in the text stream
3. Breaks UTF-16LE alignment
4. `TextDecoder` then produces CJK garbage like "昀椀瘀攀" instead of "five"

## The Fix

**File:** `supabase/functions/arabize/index.ts` (lines 334-342)

Change the tag parsing from:

```typescript
if (charCode === 0x0E) {
  const tagSize = view.getUint16(absOffset + j + 4, true);
  const totalTagBytes = 6 + tagSize;
  ...
  j += 4 + tagSize; // + 2 from loop = 6 + tagSize (WRONG)
```

To:

```typescript
if (charCode === 0x0E) {
  // 0x0E(2) + group(2) + type(2) + paramSize(2) + params(paramSize)
  const paramSize = view.getUint16(absOffset + j + 6, true);
  const totalTagBytes = 8 + paramSize;
  ...
  j += 6 + paramSize; // + 2 from loop = 8 + paramSize (CORRECT)
```

This ensures:
- The correct field (paramSize at offset j+6) is read
- The full tag (8 + paramSize bytes) is captured in `tagBytes`
- UTF-16LE alignment is preserved after every tag
- No more garbled CJK text

## Verification

After deploying the fix, re-upload and extract the same MSBT files. Entries like `entry_3` in `EventFlowMsg/Obj_DiaryAssassin_A_05.msbt` should display clean English text instead of "昀椀瘀攀 挀栀愀洀戀攀爀猀".

