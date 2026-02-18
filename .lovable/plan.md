

## Plan: Comprehensive Protection and Quality System for XC3

### Current State Analysis

After thorough codebase exploration, much of the requested functionality **already exists** but is scattered or incomplete:

- **Tag restoration** (`restoreTagsLocally`) exists in `types.tsx` and is used after AI translation
- **Quality checks** exist in `useEditorQuality.ts` (tooShort, mixedLanguage, stuckChars) but the **UI panel only shows 4 of 8 stats**
- **Protection system** (protectedEntries, presentation forms detection) is fully functional
- **Auto-repair on load** already restores missing tags

### What Will Be Added/Changed

---

### 1. New file: `src/lib/xc3-tag-protection.ts`

Dedicated tag protection module for AI translation workflow:
- `protectTags(text)` -- Replace PUA icons, `[Tag:Value]`, `{variable}`, and control chars with numbered placeholders (`TAG_0`, `TAG_1`...) before sending to AI
- `restoreTags(translatedText, tags)` -- Re-insert original tags after AI returns translation
- Treat consecutive PUA sequences as atomic blocks
- This improves AI translation quality by preventing the AI from corrupting/dropping tags

### 2. Expand `QualityStatsPanel.tsx`

Add the missing stat cards to the UI:
- Too short translations (orange)
- Mixed language warnings (yellow)
- Damaged tags (red)
- Total now shows 7 categories in a responsive grid
- Each stat card is clickable to filter

### 3. Update `useEditorQuality.ts` -- XC3 whitelist

Expand the mixed language whitelist with XC3-specific terms:
- Character names: Noah, Mio, Lanz, Sena, Taion, Eunie, Riku, Manana
- Locations: Aionios, Keves, Agnus, Colony
- Game terms: Arts, Talent, Chain Attack, Ouroboros, Interlink
- Controller: A, B, X, Y, L, R, ZL, ZR
- Technical: UI, NPC, DLC, NG+, HP, MP, AP, TP, EXP

### 4. Integrate `protectTags` into AI translation flow

Update `useEditorTranslation.ts`:
- Before sending to edge function: strip tags with `protectTags()`
- After receiving translation: restore tags with `restoreTags()`
- Keep existing `restoreTagsLocally` as fallback safety net

### 5. Move `restoreTagsLocally` to `src/lib/xc3-tag-restoration.ts`

Extract from `types.tsx` to a dedicated module for cleaner architecture. Re-export from `types.tsx` for backward compatibility.

### 6. New file: `src/test/xc3-protection.test.ts`

Comprehensive tests covering:
- PUA icon protection and restoration
- Atomic block handling for consecutive PUA sequences
- `[Format:Value]` tag protection
- `{variable}` placeholder protection
- Missing tag detection
- Placeholder count mismatch detection
- XC3 whitelist not flagging game terms as mixed language
- Actual untranslated English flagged correctly
- Presentation Forms skip protection
- Standard Arabic entries get protected
- Double-reversal prevention
- Missing PUA restoration at word boundaries

---

### Technical Details

**Files to create:**
- `src/lib/xc3-tag-protection.ts` (protectTags/restoreTags)
- `src/lib/xc3-tag-restoration.ts` (moved from types.tsx)
- `src/test/xc3-protection.test.ts`

**Files to modify:**
- `src/components/editor/QualityStatsPanel.tsx` -- expand to 7 stat cards
- `src/hooks/useEditorQuality.ts` -- XC3 whitelist expansion
- `src/hooks/useEditorTranslation.ts` -- integrate protectTags before AI call
- `src/components/editor/types.tsx` -- re-export from new module

