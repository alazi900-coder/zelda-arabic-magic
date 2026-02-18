import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export interface ExtractedEntry {
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  maxBytes: number;
}

export interface EditorState {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries?: Set<string>;
  glossary?: string;
  technicalBypass?: Set<string>;
}

export interface ReviewIssue {
  key: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  original?: string;
  translation?: string;
}

export interface ReviewSummary {
  total: number;
  errors: number;
  warnings: number;
  checked: number;
}

export interface ReviewResults {
  issues: ReviewIssue[];
  summary: ReviewSummary;
}

export interface ShortSuggestion {
  key: string;
  original: string;
  current: string;
  suggested: string;
  currentBytes: number;
  suggestedBytes: number;
  maxBytes: number;
}

export interface ImproveResult {
  key: string;
  original: string;
  current: string;
  improved: string;
  reason: string;
  improvedBytes: number;
  maxBytes: number;
}

export interface FileCategory {
  id: string;
  label: string;
  emoji: string;
}

export const AUTOSAVE_DELAY = 1500;
export const AI_BATCH_SIZE = 30;
export const PAGE_SIZE = 50;
export const INPUT_DEBOUNCE = 300;

// Tag type config for color-coded display
export const TAG_TYPES: Record<string, { label: string; color: string; tooltip: string }> = {
  '\uFFF9': { label: '⚙', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', tooltip: 'رمز تحكم (إيقاف مؤقت، انتظار، سرعة نص)' },
  '\uFFFA': { label: '🎨', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', tooltip: 'رمز تنسيق (لون، حجم خط، روبي)' },
  '\uFFFB': { label: '📌', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', tooltip: 'متغير (اسم اللاعب، عدد، اسم عنصر)' },
};
export const TAG_FALLBACK = { label: '…', color: 'bg-muted text-muted-foreground', tooltip: 'رمز تقني خاص بمحرك اللعبة' };

export const FILE_CATEGORIES: FileCategory[] = [
  // قوائم اللعبة
  { id: "main-menu", label: "القائمة الرئيسية", emoji: "🏠" },
  { id: "settings", label: "الإعدادات", emoji: "⚙️" },
  { id: "hud", label: "واجهة اللعب (HUD)", emoji: "🖥️" },
  { id: "pause-menu", label: "قائمة الإيقاف", emoji: "⏸️" },
  // الأسلحة والمعدات
  { id: "swords", label: "السيوف", emoji: "⚔️" },
  { id: "bows", label: "الأقواس", emoji: "🏹" },
  { id: "shields", label: "الدروع", emoji: "🛡️" },
  { id: "armor", label: "الملابس والدروع", emoji: "👕" },
  // العناصر والمواد
  { id: "materials", label: "المواد والموارد", emoji: "🧪" },
  { id: "food", label: "الطعام والطبخ", emoji: "🍖" },
  { id: "key-items", label: "الأدوات المهمة", emoji: "🔑" },
  // المحتوى
  { id: "story", label: "حوارات القصة", emoji: "📖" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡" },
  { id: "character", label: "الشخصيات والأعداء", emoji: "🎭" },
  { id: "npc", label: "حوارات الشخصيات", emoji: "💬" },
];

// Check if text contains technical tag markers
export function hasTechnicalTags(text: string): boolean {
  return /[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uF8FF]/.test(text);
}

// Locally restore missing control characters from original into translation
// without using AI — preserves consecutive tag GROUPS (e.g. FFF9+E000+FFFA)
export function restoreTagsLocally(original: string, translation: string): string {
  const charRegexG = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
  const charTest = /[\uFFF9-\uFFFC\uE000-\uF8FF]/;
  const origChars = original.match(charRegexG) || [];
  if (origChars.length === 0) return translation;
  
  const transChars = translation.match(charRegexG) || [];
  if (transChars.length >= origChars.length) return translation;

  // Extract consecutive tag GROUPS from original with their relative positions
  const origGroups: { chars: string; relPos: number }[] = [];
  let i = 0;
  while (i < original.length) {
    if (charTest.test(original[i])) {
      const start = i;
      let group = '';
      while (i < original.length && charTest.test(original[i])) {
        group += original[i];
        i++;
      }
      // Position = midpoint of the group in the original
      const midpoint = (start + i) / 2;
      origGroups.push({ chars: group, relPos: midpoint / Math.max(original.length, 1) });
    } else {
      i++;
    }
  }

  // Strip all control chars from translation to get clean text
  const cleanTranslation = translation.replace(charRegexG, '');

  // Find word boundary positions in clean translation
  const wordBoundaries = [0];
  for (let j = 0; j < cleanTranslation.length; j++) {
    if (cleanTranslation[j] === ' ' || cleanTranslation[j] === '\n') {
      wordBoundaries.push(j + 1);
    }
  }
  wordBoundaries.push(cleanTranslation.length);

  // Map each GROUP to nearest word boundary (keeping group chars together)
  const insertions: { pos: number; chars: string }[] = [];
  for (const group of origGroups) {
    const rawPos = Math.round(group.relPos * cleanTranslation.length);
    let bestPos = rawPos;
    let bestDist = Infinity;
    for (const wb of wordBoundaries) {
      const dist = Math.abs(wb - rawPos);
      if (dist < bestDist) { bestDist = dist; bestPos = wb; }
    }
    insertions.push({ pos: bestPos, chars: group.chars });
  }

  // Sort by position descending to insert from end (avoids offset shifts)
  insertions.sort((a, b) => b.pos - a.pos);

  let result = cleanTranslation;
  for (const ins of insertions) {
    const pos = Math.min(ins.pos, result.length);
    result = result.slice(0, pos) + ins.chars + result.slice(pos);
  }

  return result;
}

// Preview tag restoration without applying — returns before/after
export function previewTagRestore(original: string, translation: string): { before: string; after: string; hasDiff: boolean } {
  const after = restoreTagsLocally(original, translation);
  return { before: translation, after, hasDiff: after !== translation };
}

// Sanitize original text: replace binary tag markers with color-coded, tooltipped badges
export function displayOriginal(text: string): React.ReactNode {
  const regex = /([\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uF8FF\u0000-\u0008\u000E-\u001F]+)/g;
  const parts = text.split(regex);
  if (parts.length === 1 && !regex.test(text)) return text;
  return parts.map((part, i) => {
    if (!part) return null;
    const firstChar = part[0];
    const tagType = TAG_TYPES[firstChar] || (part.match(/[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uF8FF\u0000-\u0008\u000E-\u001F]/) ? TAG_FALLBACK : null);
    if (tagType) {
      return (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <span className={`inline-block px-1 rounded border text-xs cursor-help mx-0.5 ${tagType.color}`}>
              {tagType.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tagType.tooltip}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function categorizeFile(filePath: string): string {
  // === قوائم اللعبة ===
  if (/LayoutMsg\/(Title|Boot|Save|Load|GameOver|Opening|Ending)/i.test(filePath)) return "main-menu";
  if (/LayoutMsg\/(Option|Config|Setting|System|Language|Control|Camera|Sound)/i.test(filePath)) return "settings";
  if (/LayoutMsg\/(Pause|Menu|Pouch|Inventory|Equipment|Status)/i.test(filePath)) return "pause-menu";
  if (/LayoutMsg\//i.test(filePath)) return "hud";
  
  // === الأسلحة والمعدات ===
  if (/ActorMsg\/(Weapon_Sword|Weapon_Lsword|Weapon_SmallSword)/i.test(filePath)) return "swords";
  if (/ActorMsg\/Weapon_Bow/i.test(filePath)) return "bows";
  if (/ActorMsg\/Weapon_Shield/i.test(filePath)) return "shields";
  if (/ActorMsg\/Armor/i.test(filePath)) return "armor";
  
  // === العناصر والمواد ===
  if (/ActorMsg\/Item_Material/i.test(filePath)) return "materials";
  if (/ActorMsg\/(Item_Cook|Item_Fruit|Item_Mushroom|Item_Fish|Item_Meat|Item_Plant)/i.test(filePath)) return "food";
  if (/ActorMsg\/(PouchContent|Item_Key|Item_Ore|Item_Enemy|Item_Insect|Item_)/i.test(filePath)) return "key-items";
  
  // === المحتوى ===
  if (/EventFlowMsg\/(Npc|Demo_Npc)/i.test(filePath)) return "npc";
  if (/EventFlowMsg\//i.test(filePath)) return "story";
  if (/ChallengeMsg\//i.test(filePath)) return "challenge";
  if (/LocationMsg\//i.test(filePath)) return "map";
  if (/StaticMsg\/(Tips|GuideKeyIcon)\.msbt/i.test(filePath)) return "tips";
  if (/ActorMsg\/Enemy/i.test(filePath)) return "character";
  if (/ActorMsg\//i.test(filePath)) return "character";
  
  return "other";
}

// Re-export from canonical source to avoid duplication
export { isArabicChar, hasArabicChars, reverseBidi as unReverseBidi } from "@/lib/arabic-processing";

export function isTechnicalText(text: string): boolean {
  if (/^[0-9A-Fa-f\-\._:\/]+$/.test(text.trim())) return true;
  if (/\[[^\]]*\]/.test(text) && text.length < 50) return true;
  if (/<[^>]+>/.test(text)) return true;
  if (/[\\/][\w\-]+[\\/]/i.test(text)) return true;
  if (text.length < 10 && /[{}()\[\]<>|&%$#@!]/.test(text)) return true;
  if (/^[a-z]+([A-Z][a-z]*)+$|^[a-z]+(_[a-z]+)+$/.test(text.trim())) return true;
  return false;
}

export function entryKey(entry: ExtractedEntry): string {
  return `${entry.msbtFile}:${entry.index}`;
}
