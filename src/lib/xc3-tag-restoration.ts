/**
 * XC3 Tag Restoration System
 * Restores missing control characters from original text into translations.
 * Extracted from types.tsx for cleaner architecture.
 */

const TAG_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]|\[\w+:[^\]]*\]/g;
const TAG_TEST = /[\uFFF9-\uFFFC\uE000-\uE0FF]|\[\w+:[^\]]*\]/;

/**
 * Locally restore missing control characters from original into translation
 * without using AI — only inserts MISSING markers, preserving existing correct ones.
 * Keeps consecutive tag groups together (e.g. E000+E001+E002).
 */
export function restoreTagsLocally(original: string, translation: string): string {
  const origMarkers = original.match(TAG_REGEX) || [];
  if (origMarkers.length === 0) return translation;

  const transMarkers = translation.match(TAG_REGEX) || [];
  if (transMarkers.length >= origMarkers.length) return translation;

  const transMarkerSet = new Set(transMarkers);
  const someMissing = origMarkers.some(m => !transMarkerSet.has(m));
  if (!someMissing) return translation;

  // Extract consecutive tag GROUPS from original with their relative positions
  const origGroups: { chars: string; relPos: number }[] = [];
  let i = 0;
  while (i < original.length) {
    if (TAG_TEST.test(original[i])) {
      const start = i;
      let group = '';
      while (i < original.length && TAG_TEST.test(original[i])) {
        group += original[i];
        i++;
      }
      const midpoint = (start + i) / 2;
      origGroups.push({ chars: group, relPos: midpoint / Math.max(original.length, 1) });
    } else {
      i++;
    }
  }

  // For each group, check if ALL its chars are present. If any char is missing, the whole group needs re-insertion.
  const groupsToInsert: { chars: string; relPos: number }[] = [];
  for (const group of origGroups) {
    const groupChars = [...group.chars];
    const anyMissing = groupChars.some(c => !transMarkerSet.has(c));
    if (anyMissing) {
      groupsToInsert.push(group);
      for (const c of groupChars) transMarkerSet.delete(c);
    }
  }

  if (groupsToInsert.length === 0) return translation;

  // Strip markers that belong to groups being re-inserted
  const charsToStrip = new Set(groupsToInsert.flatMap(g => [...g.chars]));
  let cleanTranslation = '';
  for (let j = 0; j < translation.length; j++) {
    if (charsToStrip.has(translation[j])) continue;
    cleanTranslation += translation[j];
  }

  // Find word boundary positions
  const plainText = cleanTranslation.replace(TAG_REGEX, '');
  const wordBoundaries = [0];
  for (let j = 0; j < plainText.length; j++) {
    if (plainText[j] === ' ' || plainText[j] === '\n') {
      wordBoundaries.push(j + 1);
    }
  }
  wordBoundaries.push(plainText.length);

  // Map each group to nearest word boundary
  const insertions: { pos: number; chars: string }[] = [];
  for (const group of groupsToInsert) {
    const rawPos = Math.round(group.relPos * plainText.length);
    let bestPos = rawPos;
    let bestDist = Infinity;
    for (const wb of wordBoundaries) {
      const dist = Math.abs(wb - rawPos);
      if (dist < bestDist) { bestDist = dist; bestPos = wb; }
    }
    insertions.push({ pos: bestPos, chars: group.chars });
  }

  // Sort by position descending to insert from end
  insertions.sort((a, b) => b.pos - a.pos);

  // Build position map from plain text to cleanTranslation
  const plainToClean: number[] = [];
  for (let ci = 0; ci <= cleanTranslation.length; ci++) {
    if (ci === cleanTranslation.length || !TAG_TEST.test(cleanTranslation[ci])) {
      plainToClean.push(ci);
    }
  }

  let result = cleanTranslation;
  for (const ins of insertions) {
    const cleanPos = ins.pos < plainToClean.length ? plainToClean[ins.pos] : result.length;
    const pos = Math.min(cleanPos, result.length);
    result = result.slice(0, pos) + ins.chars + result.slice(pos);
    for (let k = 0; k < plainToClean.length; k++) {
      if (plainToClean[k] >= pos) plainToClean[k] += ins.chars.length;
    }
  }

  return result;
}

/**
 * Preview tag restoration without applying — returns before/after
 */
export function previewTagRestore(original: string, translation: string): { before: string; after: string; hasDiff: boolean } {
  const after = restoreTagsLocally(original, translation);
  return { before: translation, after, hasDiff: after !== translation };
}
