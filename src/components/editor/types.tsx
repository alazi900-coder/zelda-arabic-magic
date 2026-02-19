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
  fuzzyScores?: Record<string, number>;
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
  { id: "bdat-dlc", label: "المحتوى الإضافي (DLC)", emoji: "🎮", icon: "Gamepad2", color: "text-pink-400" },
  { id: "bdat-system", label: "إعدادات النظام", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "bdat-message", label: "أرشيف الرسائل", emoji: "💬", icon: "MessageSquare", color: "text-teal-400" },
  { id: "bdat-gimmick", label: "الآليات والألغاز", emoji: "🔧", icon: "Wrench", color: "text-gray-400" },
  { id: "bdat-settings", label: "إعدادات الصوت والعرض", emoji: "🎚️", icon: "SlidersHorizontal", color: "text-fuchsia-400" },
];

export function categorizeBdatTable(label: string, sourceFilename?: string): string {
  const match = label.match(/^(.+?)\[\d+\]/);
  if (!match) return "other";
  const tbl = match[1];

  // Extract column name from label (part after "].")
  const colMatch = label.match(/\]\s*\.?\s*(.+)/);
  const col = colMatch ? colMatch[1] : "";

  // Step 1: Categorize by table name (prefix + full-name patterns)
  const tblCat = categorizeByTableName(tbl);
  if (tblCat) return tblCat;

  // Step 2: Categorize by column name keywords
  const colCat = categorizeByColumnName(col);
  if (colCat) return colCat;

  // Step 3: Fallback to source BDAT filename
  if (sourceFilename) {
    const fileCat = categorizeByFilename(sourceFilename);
    if (fileCat) return fileCat;
  }

  return "other";
}

export function categorizeByFilename(filename: string): string | null {
  const f = filename.toLowerCase().replace(/\.bdat$/i, '');
  
  const filenameMap: Record<string, string> = {
    'battle': 'bdat-battle',
    'btl': 'bdat-battle',
    'field': 'bdat-field',
    'fld': 'bdat-field',
    'menu': 'bdat-menu',
    'mnu': 'bdat-menu',
    'quest': 'bdat-quest',
    'qst': 'bdat-quest',
    'system': 'bdat-system',
    'sys': 'bdat-system',
    'dlc': 'bdat-dlc',
    'enemy': 'bdat-enemy',
    'ene': 'bdat-enemy',
    'item': 'bdat-item',
    'itm': 'bdat-item',
    'story': 'bdat-story',
    'event': 'bdat-story',
    'evt': 'bdat-story',
    'character': 'bdat-character',
    'chr': 'bdat-character',
    'skill': 'bdat-skill',
    'art': 'bdat-skill',
    'gem': 'bdat-gem',
    'class': 'bdat-class',
    'job': 'bdat-class',
    'tips': 'bdat-tips',
    'tutorial': 'bdat-tips',
    'message': 'bdat-message',
    'msg': 'bdat-message',
    'autotalk': 'bdat-message',
    'talk': 'bdat-story',
    'gimmick': 'bdat-gimmick',
    'gmk': 'bdat-gimmick',
    'common': 'bdat-menu',
    'ui': 'bdat-menu',
    'npc': 'bdat-character',
  };
  
  // Exact match
  if (filenameMap[f]) return filenameMap[f];
  
  // Partial match - check if filename contains any key
  for (const [key, cat] of Object.entries(filenameMap)) {
    if (f.includes(key)) return cat;
  }
  
  return null;
}

export function categorizeByTableName(tbl: string): string | null {
  const t = tbl.toLowerCase();

  // === القوائم والواجهة ===
  if (/^mnu_/i.test(tbl) || /^menu$/i.test(tbl)) return "bdat-menu";
  if (/mnu_option|mnu_msg|mnu_name|mnu_shop|mnu_camp|mnu_tutorial|mnu_map|mnu_status|mnu_battle|mnu_quest|mnu_hero|mnu_system|mnu_achievement|mnu_class|mnu_collect|mnu_item|mnu_gem|mnu_filter|mnu_sort|mnu_font|mnu_res|mnu_layer|mnu_text|mnu_weapon/i.test(tbl)) return "bdat-menu";

  // === نظام القتال ===
  if (/^btl_/i.test(tbl) || /^(rsc_|wpn_)/i.test(tbl)) return "bdat-battle";

  // === الشخصيات ===
  if (/^chr_/i.test(tbl) || /^(fld_npc|fld_mob|fld_kizuna)/i.test(tbl)) return "bdat-character";

  // === الأعداء ===
  if (/^(ene_|emt_|fld_enemy|fld_unique|btl_en)/i.test(tbl)) return "bdat-enemy";

  // === الأدوات والمعدات ===
  if (/^(itm_|fld_collect|fld_tbox|fld_salvage)/i.test(tbl)) return "bdat-item";

  // === المهام ===
  if (/^(qst_|tsk_)/i.test(tbl)) return "bdat-quest";

  // === الأحداث والقصة ===
  if (/^(evt_|tlk_|fld_talk|fld_event)/i.test(tbl)) return "bdat-story";
  // msg_ sub-categories (check specific prefixes before generic msg_)
  if (/^msg_mnu_/i.test(tbl)) return "bdat-menu";
  if (/^msg_btl_/i.test(tbl)) return "bdat-battle";
  if (/^msg_fld_/i.test(tbl)) return "bdat-character";
  if (/^msg_qst_/i.test(tbl)) return "bdat-quest";
  if (/^msg_item_/i.test(tbl)) return "bdat-item";
  if (/^msg_enemy_/i.test(tbl)) return "bdat-enemy";
  if (/^msg_colony_/i.test(tbl)) return "bdat-field";
  if (/^msg_comspot_/i.test(tbl)) return "bdat-field";
  if (/^msg_extra_/i.test(tbl)) return "bdat-dlc";
  if (/^msg_/i.test(tbl)) return "bdat-message";

  // === المحتوى الإضافي ===
  if (/^dlc_/i.test(tbl)) return "bdat-dlc";

  // === أرشيف الرسائل ===
  if (/^(ma_)/i.test(tbl)) return "bdat-message";

  // === إعدادات النظام ===
  if (/^sys_/i.test(tbl)) return "bdat-system";

  // === الآليات (gimmick tables - lowercase without prefix) ===
  if (/^(gimmick|gmk_)/i.test(tbl)) return "bdat-gimmick";

  // === المواقع والخرائط ===
  if (/^(fld_map|fld_land|fld_location|fld_area|fld_camp|fld_colony|fld_weather)/i.test(tbl)) return "bdat-field";

  // === المهارات ===
  if (/^(skl_|art_|spc_)/i.test(tbl)) return "bdat-skill";

  // === الجواهر ===
  if (/^(gem_|acc_|orb_)/i.test(tbl)) return "bdat-gem";

  // === الفصائل ===
  if (/^(job_|rol_|cls_)/i.test(tbl)) return "bdat-class";

  // === النصائح ===
  if (/^(tip_|hlp_|tut_)/i.test(tbl)) return "bdat-tips";
  if (/^sys_(tips|loading)/i.test(tbl)) return "bdat-tips";

  // === FLD_ عام (catch-all for remaining FLD_ tables) ===
  if (/^fld_/i.test(tbl)) return "bdat-field";

  // === BGM ===
  if (/^bgm/i.test(tbl)) return "bdat-system";

  // === RSC_ (Resource tables - typically system/menu) ===
  if (/^rsc_/i.test(tbl)) return "bdat-system";

  // === Hex hash names (unresolved) - try to classify by context ===
  // These are like "0xABC123" - can't categorize by table name
  if (/^0x[0-9a-f]+$/i.test(tbl)) return null; // fall through to column check

  return null;
}

export function categorizeByColumnName(columnName: string): string | null {
  if (!columnName || /^0x[0-9a-f]+$/i.test(columnName)) return null;
  const col = columnName.toLowerCase();

  // القوائم والواجهة - UI column patterns
  if (/^(msg_caption|msgidcaption|caption|windowtitle|btncaption|menucategory|menugroup|menuicon|menupriority|optiontext|overwritetext|pagetitle|filtern|sortn)/i.test(columnName)) return "bdat-menu";
  if (/window|btn|layout|menu(?!mapimage)/i.test(col) && !/enemy|battle/i.test(col)) return "bdat-menu";

  // المهام والقصص - Quest/Story column patterns
  if (/^(msg_info|msgidinfo|questcategory|questflag|questid|questimage|purposeicon|nextpurpose|taskui|linqquest)/i.test(columnName)) return "bdat-quest";
  if (/task|purpose|summary|quest|scenario/i.test(col)) return "bdat-quest";

  // المواقع - Location column patterns
  if (/^(locationname|locationid|locationbdat|colonyid|mapid|mapinfo|mapjump|areainfo|arealist|landmark)/i.test(columnName)) return "bdat-field";
  if (/landmark|colony(?!flag)|area(?!ffect)/i.test(col) && !/enemy/i.test(col)) return "bdat-field";

  // الأدوات والقتال - Items & Battle column patterns
  if (/^(itm|gem|weapon|armor|accessory|pouch|material|recipe|price|equiptype)/i.test(columnName)) return "bdat-item";
  if (/skill|weapon|armor|gem(?!ini)/i.test(col) && col.length > 3) return "bdat-item";

  // الإعدادات - Settings column patterns
  if (/^(voice|audio|config|option(?!text)|setting|display|brightness|camera|sound|formation|notice|message$)/i.test(columnName)) return "bdat-settings";

  // أسماء/أوصاف عامة - try to infer from common text columns
  // Msg_Name, Msg_Detail, Msg_Help, Name, DebugName, DescText, DetailText, etc.
  // These are too generic to categorize - leave as "other"

  return null;
}

// Check if text contains technical tag markers
export function hasTechnicalTags(text: string): boolean {
  return /[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF]/.test(text);
}

// Re-export from dedicated module for backward compatibility
export { restoreTagsLocally, previewTagRestore } from "@/lib/xc3-tag-restoration";

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
