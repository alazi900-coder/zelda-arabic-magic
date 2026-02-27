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
const TAG_REGEX = /\[\w+:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?/g;

/**
 * Check if original text contains [Tag:Value] style technical tags.
 */
export function hasTechnicalBracketTag(original: string): boolean {
  return /\[\w+:[^\]]*?\s*\]/.test(original);
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

  // 1. Collect all valid [Tag:Value] from original
  const origTags = [...original.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
  if (origTags.length === 0) {
    return { text: translation, stats };
  }

  let result = translation;

  for (const tag of origTags) {
    // If the tag already exists correctly, skip
    if (result.includes(tag)) continue;

    // Extract inner content: e.g. "ML:EnhanceParam paramtype=1 "
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

    // Pattern 3: bare inner without brackets (common after BiDi mangling)
    // Use negative lookbehind/lookahead to ensure no bracket is adjacent
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

  // NO orphan bracket cleanup — this is the key safety change.
  // We only fix brackets we can confidently identify as belonging to a known tag.
  // Removing "orphan" brackets was causing destructive deletion of valid content.

  return { text: result, stats };
}
