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
  icon?: string; // Lucide icon name
  color?: string; // Tailwind color class for icon
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
  { id: "main-menu", label: "القائمة الرئيسية", emoji: "🏠", icon: "Home", color: "text-emerald-400" },
  { id: "settings", label: "الإعدادات", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "hud", label: "واجهة اللعب (HUD)", emoji: "🖥️", icon: "MonitorSmartphone", color: "text-sky-400" },
  { id: "pause-menu", label: "قائمة الإيقاف", emoji: "⏸️", icon: "Pause", color: "text-orange-400" },
  // الأسلحة والمعدات
  { id: "swords", label: "السيوف", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "bows", label: "الأقواس", emoji: "🏹", icon: "Target", color: "text-lime-400" },
  { id: "shields", label: "الدروع", emoji: "🛡️", icon: "ShieldCheck", color: "text-blue-400" },
  { id: "armor", label: "الملابس والدروع", emoji: "👕", icon: "Shirt", color: "text-violet-400" },
  // العناصر والمواد
  { id: "materials", label: "المواد والموارد", emoji: "🧪", icon: "FlaskConical", color: "text-teal-400" },
  { id: "food", label: "الطعام والطبخ", emoji: "🍖", icon: "Utensils", color: "text-amber-400" },
  { id: "key-items", label: "الأدوات المهمة", emoji: "🔑", icon: "Key", color: "text-yellow-400" },
  // المحتوى
  { id: "story", label: "حوارات القصة", emoji: "📖", icon: "BookOpen", color: "text-violet-400" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜", icon: "ScrollText", color: "text-orange-400" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️", icon: "Map", color: "text-emerald-400" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡", icon: "Lightbulb", color: "text-yellow-400" },
  { id: "character", label: "الشخصيات والأعداء", emoji: "🎭", icon: "Drama", color: "text-rose-400" },
  { id: "npc", label: "حوارات الشخصيات", emoji: "💬", icon: "MessageCircle", color: "text-cyan-400" },
];

// === BDAT (Xenoblade) Game Categories ===
export const BDAT_CATEGORIES: FileCategory[] = [
  { id: "bdat-menu", label: "القوائم والواجهة", emoji: "🖥️", icon: "Monitor", color: "text-sky-400" },
  { id: "bdat-battle", label: "نظام القتال", emoji: "⚔️", icon: "Swords", color: "text-red-400" },
  { id: "bdat-character", label: "الشخصيات والأبطال", emoji: "🧑‍🤝‍🧑", icon: "Users", color: "text-blue-400" },
  { id: "bdat-enemy", label: "الأعداء والوحوش", emoji: "👹", icon: "Skull", color: "text-rose-500" },
  { id: "bdat-item", label: "الأدوات والمعدات", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "bdat-quest", label: "المهام والتحديات", emoji: "📜", icon: "ScrollText", color: "text-orange-400" },
  { id: "bdat-field", label: "المواقع والخرائط", emoji: "🗺️", icon: "MapPin", color: "text-emerald-400" },
  { id: "bdat-story", label: "حوارات القصة", emoji: "📖", icon: "BookOpen", color: "text-violet-400" },
  { id: "bdat-skill", label: "المهارات والفنون", emoji: "✨", icon: "Sparkles", color: "text-yellow-400" },
  { id: "bdat-gem", label: "الجواهر والإكسسوارات", emoji: "💎", icon: "Gem", color: "text-cyan-400" },
  { id: "bdat-class", label: "الفصائل والأدوار", emoji: "🛡️", icon: "Shield", color: "text-indigo-400" },
  { id: "bdat-tips", label: "النصائح والشروحات", emoji: "💡", icon: "Lightbulb", color: "text-lime-400" },
];

export function categorizeBdatTable(label: string): string {
  const match = label.match(/^(.+?)\[\d+\]/);
  if (!match) return "other";
  const tbl = match[1];

  // القوائم والواجهة
  if (/^MNU_/i.test(tbl) || /^menu$/i.test(tbl)) return "bdat-menu";
  // نظام القتال
  if (/^BTL_/i.test(tbl) || /^(RSC_|WPN_)/i.test(tbl)) return "bdat-battle";
  // الشخصيات
  if (/^CHR_/i.test(tbl) || /^(FLD_Npc|ma\d)/i.test(tbl)) return "bdat-character";
  // الأعداء
  if (/^(ENE_|EMT_|FLD_Enemy)/i.test(tbl)) return "bdat-enemy";
  // الأدوات والمعدات
  if (/^(ITM_|FLD_Collect)/i.test(tbl)) return "bdat-item";
  // المهام
  if (/^(QST_|EVT_|TSK_)/i.test(tbl)) return "bdat-quest";
  // المواقع
  if (/^(FLD_Map|FLD_Land|FLD_Location|SYS_Map|GMK_)/i.test(tbl)) return "bdat-field";
  // القصة
  if (/^(MSG_|TLK_|FLD_Talk)/i.test(tbl)) return "bdat-story";
  // المهارات
  if (/^(SKL_|ART_|SPC_)/i.test(tbl)) return "bdat-skill";
  // الجواهر
  if (/^(GEM_|ACC_|ORB_)/i.test(tbl)) return "bdat-gem";
  // الفصائل
  if (/^(JOB_|ROL_|CLS_)/i.test(tbl)) return "bdat-class";
  // النصائح
  if (/^(TIP_|HLP_|TUT_)/i.test(tbl)) return "bdat-tips";
  // FLD_ عام
  if (/^FLD_/i.test(tbl)) return "bdat-field";

  return "other";
}

// Check if text contains technical tag markers
export function hasTechnicalTags(text: string): boolean {
  return /[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF]/.test(text);
}

// Locally restore missing control characters from original into translation
// without using AI — only inserts MISSING markers, preserving existing correct ones
// Keeps consecutive tag groups together (e.g. E000+E001+E002)
export function restoreTagsLocally(original: string, translation: string): string {
  const TAG_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
  const TAG_TEST = /[\uFFF9-\uFFFC\uE000-\uE0FF]/;
  
  const origMarkers = original.match(TAG_REGEX) || [];
  if (origMarkers.length === 0) return translation;
  
  const transMarkers = translation.match(TAG_REGEX) || [];
  if (transMarkers.length >= origMarkers.length) return translation;
  
  // Find which specific markers are present in translation
  const transMarkerSet = new Set(transMarkers);
  
  // Check if ANY markers are missing
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
      // Remove any partial markers of this group from translation
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

  // Build position map from plain text to cleanTranslation (which may have surviving markers)
  const plainToClean: number[] = [];
  let pi = 0;
  for (let ci = 0; ci <= cleanTranslation.length; ci++) {
    if (ci === cleanTranslation.length || !TAG_TEST.test(cleanTranslation[ci])) {
      plainToClean.push(ci);
      pi++;
    }
  }

  let result = cleanTranslation;
  for (const ins of insertions) {
    const cleanPos = ins.pos < plainToClean.length ? plainToClean[ins.pos] : result.length;
    const pos = Math.min(cleanPos, result.length);
    result = result.slice(0, pos) + ins.chars + result.slice(pos);
    // Rebuild mapping after insertion (shift subsequent positions)
    for (let k = 0; k < plainToClean.length; k++) {
      if (plainToClean[k] >= pos) plainToClean[k] += ins.chars.length;
    }
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
  const regex = /([\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF\u0000-\u0008\u000E-\u001F]+)/g;
  const parts = text.split(regex);
  if (parts.length === 1 && !regex.test(text)) return text;
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;
  for (const part of parts) {
    if (!part) continue;
    const firstCode = part.charCodeAt(0);
    // PUA markers (E000-E0FF) — render each one as an individual numbered badge
    if (firstCode >= 0xE000 && firstCode <= 0xE0FF) {
      for (let ci = 0; ci < part.length; ci++) {
        const code = part.charCodeAt(ci);
        if (code >= 0xE000 && code <= 0xE0FF) {
          const tagNum = code - 0xE000 + 1;
          elements.push(
            <Tooltip key={keyIdx++}>
              <TooltipTrigger asChild>
                <span className="inline-block px-1 rounded border text-xs cursor-help mx-0.5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                  🏷{tagNum}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                رمز تحكم #{tagNum} — أيقونة زر أو تنسيق (لا تحذفه)
              </TooltipContent>
            </Tooltip>
          );
        }
      }
      continue;
    }
    // Legacy FFF9-FFFC markers or other control chars
    const tagType = TAG_TYPES[part[0]] || (part.match(/[\uFFF9\uFFFA\uFFFB\uFFFC\u0000-\u0008\u000E-\u001F]/) ? TAG_FALLBACK : null);
    if (tagType) {
      elements.push(
        <Tooltip key={keyIdx++}>
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
      continue;
    }
    elements.push(<React.Fragment key={keyIdx++}>{part}</React.Fragment>);
  }
  return elements;
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
