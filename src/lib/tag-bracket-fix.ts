/**
 * Unified Tag Bracket Fix Utility
 * Single source of truth for fixing broken brackets around [Tag:Value] technical tags.
 * 
 * SAFETY PRINCIPLE: Never delete brackets unless we successfully identified and restored
 * the corresponding technical tag. If we can't fix with confidence, leave as-is (fail-safe).
 */

export interface TagBracketFixStats {
  reversed: number;    // ]tag[ → [tag]
  mismatched: number;  // ]tag] or [tag[ → [tag]
  bare: number;        // tag without brackets → [tag]
  total: number;
}

export interface TagBracketFixResult {
  text: string;
  stats: TagBracketFixStats;
}

/** Regex to match valid [Tag:Value] patterns, optionally followed by (description) */
const TAG_COLON_REGEX = /\[\w+:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?/g;

/** Regex to match [TAG]N patterns (no colon, tag followed by closing bracket then a number) */
const TAG_BRACKET_NUM_REGEX = /\[[A-Z]{2,10}\]\d+/g;

/**
 * Check if original text contains technical tags in any supported format:
 * - [Tag:Value] style (with colon)
 * - [TAG]N style (tag then number)
 */
export function hasTechnicalBracketTag(original: string): boolean {
  return /\[\w+:[^\]]*?\s*\]/.test(original) || /\[[A-Z]{2,10}\]\d+/.test(original);
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fix broken/reversed/missing brackets around [Tag:Value] technical tags.
 * Compares the original text's tags with the translation and repairs any mangled versions.
 * 
 * SAFE: Does NOT delete any brackets unless a valid tag replacement was made.
 * If the translation can't be fixed with confidence, it's returned unchanged.
 */
export function fixTagBracketsStrict(original: string, translation: string): TagBracketFixResult {
  const stats: TagBracketFixStats = { reversed: 0, mismatched: 0, bare: 0, total: 0 };

  let result = translation;

  // 1. Handle [Tag:Value] style tags
  const colonTags = [...original.matchAll(new RegExp(TAG_COLON_REGEX.source, TAG_COLON_REGEX.flags))].map(m => m[0]);
  for (const tag of colonTags) {
    if (result.includes(tag)) continue;

    const closeBracketIdx = tag.indexOf(']');
    const inner = tag.slice(1, closeBracketIdx);
    const esc = escapeRegex(inner);

    // Pattern 1: reversed brackets ]inner[
    const revPattern = new RegExp(`\\]\\s*${esc}\\s*\\[`);
    if (revPattern.test(result)) {
      result = result.replace(revPattern, `[${inner}]`);
      stats.reversed++;
      stats.total++;
      continue;
    }

    // Pattern 2: mismatched brackets ]inner] or [inner[
    let fixed = false;
    for (const bp of [
      new RegExp(`\\]\\s*${esc}\\s*\\]`),
      new RegExp(`\\[\\s*${esc}\\s*\\[`),
    ]) {
      if (bp.test(result)) {
        result = result.replace(bp, `[${inner}]`);
        stats.mismatched++;
        stats.total++;
        fixed = true;
        break;
      }
    }
    if (fixed) continue;

    // Pattern 3: bare inner without brackets
    const barePattern = new RegExp(`(?<!\\[)${esc}(?!\\])`);
    if (barePattern.test(result)) {
      result = result.replace(barePattern, `[${inner}]`);
      stats.bare++;
      stats.total++;
      continue;
    }

    // Pattern 4: inner content got fully reversed by BiDi
    const reversedInner = inner.split('').reverse().join('');
    const escapedReversed = escapeRegex(reversedInner);
    for (const rp of [
      new RegExp(`\\[\\s*${escapedReversed}\\s*\\]`),
      new RegExp(`\\]\\s*${escapedReversed}\\s*\\[`),
    ]) {
      if (rp.test(result)) {
        result = result.replace(rp, `[${inner}]`);
        stats.reversed++;
        stats.total++;
        break;
      }
    }
  }

  // 2. Handle [TAG]N style tags (e.g. [ML]1, [SE]0)
  const bracketNumTags = [...original.matchAll(new RegExp(TAG_BRACKET_NUM_REGEX.source, TAG_BRACKET_NUM_REGEX.flags))].map(m => m[0]);
  for (const tag of bracketNumTags) {
    if (result.includes(tag)) continue;

    // Extract parts: e.g. tag="[ML]1" → tagName="ML", num="1"
    const match = tag.match(/^\[([A-Z]{2,10})\](\d+)$/);
    if (!match) continue;
    const [, tagName, num] = match;
    const escName = escapeRegex(tagName);
    const escNum = escapeRegex(num);

    // Pattern: ]TAG[N (reversed brackets)
    const revP = new RegExp(`\\]${escName}\\[${escNum}`);
    if (revP.test(result)) {
      result = result.replace(revP, tag);
      stats.reversed++;
      stats.total++;
      continue;
    }

    // Pattern: [TAG[N or ]TAG]N (mismatched)
    let fixed2 = false;
    for (const bp of [
      new RegExp(`\\[${escName}\\[${escNum}`),
      new RegExp(`\\]${escName}\\]${escNum}`),
    ]) {
      if (bp.test(result)) {
        result = result.replace(bp, tag);
        stats.mismatched++;
        stats.total++;
        fixed2 = true;
        break;
      }
    }
    if (fixed2) continue;

    // Pattern: TAG]N or [TAG]  N (tag present but number detached or brackets wrong)
    // Pattern: bare TAGN without brackets
    const bareP = new RegExp(`(?<!\\[)${escName}(?!\\])\\s*${escNum}`);
    if (bareP.test(result)) {
      result = result.replace(bareP, tag);
      stats.bare++;
      stats.total++;
      continue;
    }

    // Pattern: [TAG] N (space between ] and number)
    const spaceP = new RegExp(`\\[${escName}\\]\\s+${escNum}`);
    if (spaceP.test(result)) {
      result = result.replace(spaceP, tag);
      stats.mismatched++;
      stats.total++;
      continue;
    }
  }

  return { text: result, stats };
}
