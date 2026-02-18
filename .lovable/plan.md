

# Fix: Button Icons Appearing as `??` in Game

## Problem Diagnosis

The root cause is a **lossy tag mapping** in the extract/build pipeline:

1. **Extract mode** converts each unique PUA marker (E000, E001, E002...) into one of only 3 display markers (FFF9, FFFA, FFFB) based on group type. So if an entry has 4 tags, they might all become FFF9 -- losing their individual identity.

2. **Build mode** does sequential replacement: it walks through the translation text, and each time it sees ANY display marker (FFF9/FFFA/FFFB/FFFC), it replaces it with the next tag from the original entry's tag list.

3. If the AI translation or manual editing drops even ONE display marker, the sequential mapping shifts -- causing all subsequent tags to map to wrong positions, producing `??` icons in-game.

4. The `restoreTagsLocally` function tries to re-inject missing markers, but it works with display markers (FFF9-FFFC), not the original PUA codes. Since multiple tags map to the same display marker, the count check can pass even when tags are misaligned.

## Solution: Preserve Original PUA Markers

Instead of converting PUA markers to lossy display markers during extract, keep the original PUA codes (E000, E001, E002...) in the editor text. This makes the mapping 1:1 and eliminates the possibility of tag confusion.

### Changes

#### 1. Edge Function: Extract Mode (`supabase/functions/arabize/index.ts`)

**Current behavior (lossy):**
```
E000 -> FFF9 (group 0)
E001 -> FFF9 (group 0)  // COLLISION!
E002 -> FFFA (group 1)
```

**New behavior (lossless):**
- Keep PUA markers as-is in the extracted text (E000, E001, E002...)
- Add a `tagMap` array to the response so the editor knows each tag's type for display coloring
- Each entry will include: `{ ..., tagTypes: [{marker: 0xE000, group: 0}, {marker: 0xE001, group: 0}, ...] }`

#### 2. Editor Display (`src/components/editor/types.tsx`)

- Update `displayOriginal` to color-code PUA markers based on the `tagTypes` metadata (or a simple heuristic: show all PUA as the generic tag badge)
- Update `TAG_TYPES` to handle PUA range characters with the fallback color scheme
- `hasTechnicalTags` already covers PUA range -- no change needed

#### 3. Build Mode (`supabase/functions/arabize/index.ts`)

- **Simplify** the build replacement: PUA markers in the translation text already match the original `tag.markerCode` directly -- no sequential mapping needed
- Just verify each expected PUA marker is present; if missing, use `restoreTagsLocally` as fallback

#### 4. Tag Restoration (`src/components/editor/types.tsx`)

- `restoreTagsLocally`: Update to work with PUA markers directly instead of display markers
- Since PUA codes are unique per entry, restoration becomes trivial: check which E00x codes are missing and re-insert them

#### 5. AI Translation Protection (`supabase/functions/translate-entries/index.ts`)

- The `protectTags` function already handles PUA range (`[\uE000-\uE0FF]+`) -- no change needed
- The TAG_N placeholder system will correctly preserve PUA markers through AI translation

#### 6. Editor File I/O (`src/hooks/useEditorFileIO.ts`)

- Update JSON import to handle both old format (FFF9-FFFC markers) and new format (PUA markers) for backward compatibility
- When importing old files that use FFF9-FFFC markers, attempt to map them back to PUA using the original entry's tag list

### Migration / Backward Compatibility

- Old exported JSON files use FFF9-FFFC markers. The import logic will detect this and convert to PUA markers using the original entry's tag metadata
- The build mode will retain the old FFF9-FFFC replacement as a fallback path for any legacy translations

### Technical Details

**Files to modify:**
1. `supabase/functions/arabize/index.ts` -- Remove lossy PUA-to-display conversion in extract mode; simplify build mode tag replacement
2. `src/components/editor/types.tsx` -- Update `displayOriginal` to render PUA markers with color badges; update `restoreTagsLocally` for PUA
3. `src/hooks/useEditorBuild.ts` -- Update tag count checks to use PUA range
4. `src/hooks/useEditorTranslation.ts` -- Minor: `autoFixTags` already delegates to `restoreTagsLocally`
5. `src/hooks/useEditorFileIO.ts` -- Add backward-compatible import for old FFF9-based files
6. `supabase/functions/translate-entries/index.ts` -- No changes needed (already handles PUA)

