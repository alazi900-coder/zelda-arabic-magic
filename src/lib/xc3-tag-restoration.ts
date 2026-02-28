/**
 * XC3 Tag Restoration System
 * Restores missing control characters AND multi-char technical tags
 * from original text into translations.
 * Extracted from types.tsx for cleaner architecture.
 */

/** Unified regex matching ALL technical tag formats */
const TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\d+|\[\w+:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?|\[\w+=\w[^\]]*\]|\{\w+:\w[^}]*\}|\{[\w]+\}/g;

/**
 * Extract all technical tag tokens from text (as ordered array of strings).
 */
function extractTags(text: string): string[] {
  return [...text.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
}

/**
 * Locally restore missing technical tags from original into translation
 * without using AI — only inserts MISSING tags, preserving existing correct ones.
 * Also strips AI-invented tags that don't exist in original (e.g. [ML:icon icon=btn_a ]).
 */
export function restoreTagsLocally(original: string, translation: string): string {
  const origTags = extractTags(original);
  if (origTags.length === 0) return translation;

  const transTags = extractTags(translation);

  // Check if all original tags are present (exact multiset match)
  const origCount = new Map<string, number>();
  for (const t of origTags) origCount.set(t, (origCount.get(t) || 0) + 1);
  const transCount = new Map<string, number>();
  for (const t of transTags) transCount.set(t, (transCount.get(t) || 0) + 1);

  let allPresent = true;
  for (const [tag, count] of origCount) {
    if ((transCount.get(tag) || 0) < count) { allPresent = false; break; }
  }
  if (allPresent) {
    // All original tags present — but strip any AI-invented tags not in original
    return stripForeignTags(original, translation, origTags);
  }

  // Some tags are missing — rebuild
  // Step 1: Strip ALL tags from translation (both correct and incorrect)
  const cleanTranslation = translation.replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), '').trim();

  // Step 2: Compute relative positions of each tag in original
  const origPlain = original.replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), '');
  const origLength = Math.max(origPlain.length, 1);

  interface TagPosition { tag: string; relPos: number }
  const tagPositions: TagPosition[] = [];
  let plainIdx = 0;
  let i = 0;
  const origMatchAll = [...original.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))];
  let matchIdx = 0;

  for (let ci = 0; ci < original.length; ) {
    if (matchIdx < origMatchAll.length && ci === origMatchAll[matchIdx].index) {
      const m = origMatchAll[matchIdx];
      tagPositions.push({ tag: m[0], relPos: plainIdx / origLength });
      ci += m[0].length;
      matchIdx++;
    } else {
      plainIdx++;
      ci++;
    }
  }

  // Step 3: Insert tags into clean translation at proportional positions
  const transLength = Math.max(cleanTranslation.length, 1);
  
  // Find word boundary positions in clean translation
  const wordBounds = [0];
  for (let j = 0; j < cleanTranslation.length; j++) {
    if (cleanTranslation[j] === ' ' || cleanTranslation[j] === '\n') {
      wordBounds.push(j + 1);
    }
  }
  wordBounds.push(cleanTranslation.length);

  // Map each tag to nearest word boundary
  const insertions: { pos: number; tag: string }[] = [];
  for (const tp of tagPositions) {
    const rawPos = Math.round(tp.relPos * transLength);
    let bestPos = rawPos;
    let bestDist = Infinity;
    for (const wb of wordBounds) {
      const dist = Math.abs(wb - rawPos);
      if (dist < bestDist) { bestDist = dist; bestPos = wb; }
    }
    insertions.push({ pos: bestPos, tag: tp.tag });
  }

  // Sort by position descending to insert from end
  insertions.sort((a, b) => b.pos - a.pos);

  let result = cleanTranslation;
  for (const ins of insertions) {
    const pos = Math.min(ins.pos, result.length);
    result = result.slice(0, pos) + ins.tag + result.slice(pos);
  }

  return result;
}

/**
 * Strip tags from translation that don't exist in the original text.
 * This catches AI-invented tags like [ML:icon icon=btn_a ] when the original has 1[ML].
 */
function stripForeignTags(original: string, translation: string, origTags: string[]): string {
  const origTagSet = new Set(origTags);
  const transTags = extractTags(translation);
  
  // Check if there are any foreign tags
  const hasForeign = transTags.some(t => !origTagSet.has(t));
  if (!hasForeign) return translation;

  // Remove foreign tags from translation
  let result = translation;
  for (const t of transTags) {
    if (!origTagSet.has(t)) {
      result = result.replace(t, '');
    }
  }
  // Clean up double spaces
  return result.replace(/  +/g, ' ').trim();
}

/**
 * Preview tag restoration without applying — returns before/after
 */
export function previewTagRestore(original: string, translation: string): { before: string; after: string; hasDiff: boolean } {
  const after = restoreTagsLocally(original, translation);
  return { before: translation, after, hasDiff: after !== translation };
}
