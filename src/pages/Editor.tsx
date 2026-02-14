import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Download, Search, FileText, Loader2, Filter, Sparkles, Save, Tag, Upload, FileDown, Cloud, CloudUpload, LogIn, BookOpen, AlertTriangle, Eye, EyeOff, RotateCcw, CheckCircle2, ShieldCheck, ChevronLeft, ChevronRight, Check, X, BarChart3, Menu, MoreVertical } from "lucide-react";
import ZeldaDialoguePreview from "@/components/ZeldaDialoguePreview";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { processArabicText, hasArabicChars as hasArabicCharsProcessing, hasArabicPresentationForms, removeArabicPresentationForms } from "@/lib/arabic-processing";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface ExtractedEntry {
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  maxBytes: number;
}

interface EditorState {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries?: Set<string>;
  glossary?: string;
  technicalBypass?: Set<string>;
}

const AUTOSAVE_DELAY = 1500;
const AI_BATCH_SIZE = 30;
const PAGE_SIZE = 50;
const INPUT_DEBOUNCE = 300;

// Debounced input component to prevent re-renders on every keystroke
const DebouncedInput = memo(({ value, onChange, placeholder, className, autoFocus }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(newVal), INPUT_DEBOUNCE);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
});

interface FileCategory {
  id: string;
  label: string;
  emoji: string;
}

const FILE_CATEGORIES: FileCategory[] = [
  { id: "inventory", label: "الأسلحة والأدوات والمواد", emoji: "🎒" },
  { id: "ui", label: "القوائم والواجهة", emoji: "🖥️" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜" },
  { id: "story", label: "حوارات القصة والمهام", emoji: "📖" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡" },
  { id: "character", label: "أسماء الشخصيات والأعداء", emoji: "🎭" },
];

function categorizeFile(filePath: string): string {
  if (/ActorMsg\/PouchContent\.msbt/i.test(filePath)) return "inventory";
  if (/LayoutMsg\//i.test(filePath)) return "ui";
  if (/ChallengeMsg\//i.test(filePath)) return "challenge";
  if (/EventFlowMsg\//i.test(filePath)) return "story";
  if (/LocationMsg\//i.test(filePath)) return "map";
  if (/StaticMsg\/(Tips|GuideKeyIcon)\.msbt/i.test(filePath)) return "tips";
  if (/ActorMsg\//i.test(filePath)) return "character";
  return "other";
}

// Same algorithm as reverseBidi in edge function - reversing twice restores original
function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function unReverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = '';
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = '';
        }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      return [...seg.text].reverse().join('');
    }).join('');
  }).join('\n');
}

function hasArabicChars(text: string): boolean {
  return [...text].some(ch => isArabicChar(ch));
}

function isTechnicalText(text: string): boolean {
  if (/^[0-9A-Fa-f\-\._:\/]+$/.test(text.trim())) return true;
  if (/\[[^\]]*\]/.test(text) && text.length < 50) return true;
  if (/<[^>]+>/.test(text)) return true;
  if (/[\\/][\w\-]+[\\/]/i.test(text)) return true;
  if (text.length < 10 && /[{}()\[\]<>|&%$#@!]/.test(text)) return true;
  if (/^[a-z]+([A-Z][a-z]*)+$|^[a-z]+(_[a-z]+)+$/.test(text.trim())) return true;
  return false;
}

const Editor = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "translated" | "untranslated" | "problems" | "needs-improve" | "too-short" | "too-long" | "stuck-chars" | "mixed-lang">("all");
  const [filterTechnical, setFilterTechnical] = useState<"all" | "only" | "exclude">("all");
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
   const [technicalEditingMode, setTechnicalEditingMode] = useState<string | null>(null);
   const [showPreview, setShowPreview] = useState(false);
   const [previewKey, setPreviewKey] = useState<string | null>(null);
   const [reviewing, setReviewing] = useState(false);
   const [reviewResults, setReviewResults] = useState<{ issues: any[]; summary: any } | null>(null);
   const [tmStats, setTmStats] = useState<{ reused: number; sent: number } | null>(null);
   const [suggestingShort, setSuggestingShort] = useState(false);
   const [shortSuggestions, setShortSuggestions] = useState<any[] | null>(null);
   const [quickReviewMode, setQuickReviewMode] = useState(false);
   const [quickReviewIndex, setQuickReviewIndex] = useState(0);
    const [showQualityStats, setShowQualityStats] = useState(false);
   const [translatingSingle, setTranslatingSingle] = useState<string | null>(null);
    const [previousTranslations, setPreviousTranslations] = useState<Record<string, string>>({});
    const [currentPage, setCurrentPage] = useState(0);
  const [arabicNumerals, setArabicNumerals] = useState(false);
     const [mirrorPunctuation, setMirrorPunctuation] = useState(false);
     const [applyingArabic, setApplyingArabic] = useState(false);
     const [improvingTranslations, setImprovingTranslations] = useState(false);
     const [improveResults, setImproveResults] = useState<any[] | null>(null);
     const [fixingMixed, setFixingMixed] = useState(false);
  
  const navigate = useNavigate();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleProtection = (key: string) => {
    if (!state) return;
    const newProtected = new Set(state.protectedEntries || []);
    if (newProtected.has(key)) {
      newProtected.delete(key);
    } else {
      newProtected.add(key);
    }
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
  };

  const toggleTechnicalBypass = (key: string) => {
    if (!state) return;
    const newBypass = new Set(state.technicalBypass || []);
    if (newBypass.has(key)) {
      newBypass.delete(key);
    } else {
      newBypass.add(key);
    }
    setState(prev => prev ? { ...prev, technicalBypass: newBypass } : null);
  };

  const handleProtectAllArabic = () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
    const newProtected = new Set(state.protectedEntries || []);
    let count = 0;
    
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (arabicRegex.test(entry.original) && !newProtected.has(key)) {
        newProtected.add(key);
        count++;
      }
    }
    
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
    setLastSaved(`✅ تم حماية ${count} نص معرّب من العكس`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleFixReversed = (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const corrected = unReverseBidi(entry.original);
    const newProtected = new Set(state.protectedEntries || []);
    newProtected.add(key);
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: corrected },
      protectedEntries: newProtected,
    } : null);
  };

  const handleFixAllReversed = () => {
    if (!state) return;
    const newTranslations = { ...state.translations };
    const newProtected = new Set(state.protectedEntries || []);
    let count = 0;
    let skippedProtected = 0;
    let skippedTranslated = 0;
    let skippedSame = 0;

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (hasArabicChars(entry.original)) {
        // Skip if already protected (user already fixed this)
        if (newProtected.has(key)) {
          skippedProtected++;
          continue;
        }
        
        const existing = newTranslations[key]?.trim();
        // Fix if: no translation, or translation matches original (auto-detected), or translation matches original trimmed
        const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
        
        if (isAutoDetected) {
          const corrected = unReverseBidi(entry.original);
          if (corrected !== entry.original) {
            newTranslations[key] = corrected;
            newProtected.add(key);
            count++;
          } else {
            skippedSame++;
          }
        } else {
          skippedTranslated++;
        }
      }
    }

    console.log(`[Fix Reversed] Fixed: ${count}, Skipped protected: ${skippedProtected}, Skipped translated: ${skippedTranslated}, Skipped same: ${skippedSame}`);

    setState(prev => prev ? {
      ...prev,
      translations: newTranslations,
      protectedEntries: newProtected,
    } : null);
    
    // بناء رسالة تفصيلية
    const parts: string[] = [];
    if (count > 0) parts.push("تم تصحيح: " + count + " نص");
    if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
    if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
    if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);
    
    const detailedMessage = (count > 0 ? "\u2705 " : "\u26A0\uFE0F ") + parts.join(" | ");
    setLastSaved(detailedMessage);
    setTimeout(() => setLastSaved(""), 5000);
  };

  const detectPreTranslated = useCallback((editorState: EditorState): Record<string, string> => {
    const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
    const autoTranslations: Record<string, string> = {};
    for (const entry of editorState.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!editorState.translations[key]?.trim() && arabicRegex.test(entry.original)) {
        autoTranslations[key] = entry.original;
      }
    }
    return autoTranslations;
  }, []);

  useEffect(() => {
    const loadState = async () => {
      const stored = await idbGet<EditorState>("editorState");
      if (stored) {
        // Only keep translations for keys that exist in the current file's entries
        const validKeys = new Set(stored.entries.map(e => `${e.msbtFile}:${e.index}`));
        const autoTranslations = detectPreTranslated({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(),
        });
        const filteredStored: Record<string, string> = {};
        for (const [k, v] of Object.entries(stored.translations || {})) {
          if (validKeys.has(k)) filteredStored[k] = v;
        }
        const mergedTranslations = { ...autoTranslations, ...filteredStored };
        
        const protectedSet = new Set<string>(
          Array.isArray(stored.protectedEntries) ? (stored.protectedEntries as string[]) : []
        );

        const bypassSet = new Set<string>(
          Array.isArray((stored as any).technicalBypass) ? ((stored as any).technicalBypass as string[]) : []
        );

        const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
        for (const entry of stored.entries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          if (arabicRegex.test(entry.original)) {
            const existingTranslation = mergedTranslations[key]?.trim();
            if (existingTranslation && existingTranslation !== entry.original && existingTranslation !== entry.original.trim()) {
              protectedSet.add(key);
            }
          }
        }
        
        setState({
          entries: stored.entries,
          translations: mergedTranslations,
          protectedEntries: protectedSet,
          technicalBypass: bypassSet,
        });

        const autoCount = Object.keys(autoTranslations).length;
        setLastSaved(autoCount > 0 
          ? `تم التحميل + اكتشاف ${autoCount} نص معرّب مسبقاً`
          : "تم التحميل من الحفظ السابق"
        );
      } else {
        // Create demo data for testing mobile layout
        const demoEntries: ExtractedEntry[] = [
          { msbtFile: "ActorMsg/Link.msbt", index: 0, label: "Link", original: "Link", maxBytes: 64 },
          { msbtFile: "ActorMsg/Link.msbt", index: 1, label: "Hero", original: "The Hero of Hyrule", maxBytes: 32 },
          { msbtFile: "LayoutMsg/Common.msbt", index: 0, label: "Accept", original: "Accept", maxBytes: 20 },
          { msbtFile: "LayoutMsg/Common.msbt", index: 1, label: "Cancel", original: "Cancel", maxBytes: 20 },
          { msbtFile: "StoryMsg/MainQuest.msbt", index: 0, label: "Quest_Intro", original: "The ancient evil has returned to [Color:Red]Hyrule[Color:White]. You must find the Master Sword.", maxBytes: 80 },
          { msbtFile: "StoryMsg/MainQuest.msbt", index: 1, label: "Quest_Complete", original: "You have completed the trial!", maxBytes: 40 },
          { msbtFile: "EventFlowMsg/NPC_Dialog.msbt", index: 0, label: "Greet", original: "Hello, traveler! Welcome to our village.", maxBytes: 50 },
          { msbtFile: "EventFlowMsg/NPC_Dialog.msbt", index: 1, label: "Warning", original: "Be careful! The monsters in the forest are very dangerous at night.", maxBytes: 60 },
          { msbtFile: "ChallengeMsg/Shrine.msbt", index: 0, label: "Shrine_Name", original: "Trial of Power", maxBytes: 30 },
          { msbtFile: "ChallengeMsg/Shrine.msbt", index: 1, label: "Shrine_Desc", original: "Defeat all enemies within the time limit to prove your strength.", maxBytes: 50 },
        ];
        const demoTranslations: Record<string, string> = {
          "ActorMsg/Link.msbt:0": "لينك",
          "ActorMsg/Link.msbt:1": "بطل مملكة هايرول الأسطوري العظيم المختار من الآلهة القديمة",
          "LayoutMsg/Common.msbt:0": "الموافقة والقبول على جميع الشروط",
          "LayoutMsg/Common.msbt:1": "إلغاء العملية والرجوع للخلف",
          "StoryMsg/MainQuest.msbt:0": "لقد عاد الشر القديم إلى [Color:Red]هايرول[Color:White]. يجب عليك أن تجد سيف الماستر السحري الأسطوري لهزيمة الشر وإنقاذ المملكة من الدمار الشامل",
          "StoryMsg/MainQuest.msbt:1": "لقد أكملت التحدي بنجاح! تهانينا يا بطل هايرول الشجاع",
          "EventFlowMsg/NPC_Dialog.msbt:0": "مرحباً أيها المسافر الشجاع! أهلاً وسهلاً بك في قريتنا الصغيرة الجميلة",
          "EventFlowMsg/NPC_Dialog.msbt:1": "احذر جيداً! الوحوش الموجودة في الغابة المظلمة خطيرة للغاية خاصةً في الليل عندما يحل الظلام الدامس",
          "ChallengeMsg/Shrine.msbt:0": "تحدي القوة والشجاعة الأسطورية",
          "ChallengeMsg/Shrine.msbt:1": "اهزم جميع الأعداء والوحوش الخطيرة خلال الوقت المحدد لإثبات قوتك وشجاعتك في المعركة",
        };
        
        setState({
          entries: demoEntries,
          translations: demoTranslations,
          protectedEntries: new Set(),
          technicalBypass: new Set(),
        });
        setLastSaved("تم تحميل بيانات تجريبية");
      }
    };
    loadState();
  }, [detectPreTranslated]);


  const saveToIDB = useCallback(async (editorState: EditorState) => {
    await idbSet("editorState", {
      entries: editorState.entries,
      translations: editorState.translations,
      protectedEntries: Array.from(editorState.protectedEntries || []),
      technicalBypass: Array.from(editorState.technicalBypass || []),
    });
    setLastSaved(`آخر حفظ: ${new Date().toLocaleTimeString("ar-SA")}`);
  }, []);

  useEffect(() => {
    if (!state) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToIDB(state), AUTOSAVE_DELAY);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state?.translations, saveToIDB]);

  const msbtFiles = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.entries.map(e => e.msbtFile));
    return Array.from(set).sort();
  }, [state?.entries]);

  const categoryCounts = useMemo(() => {
    if (!state) return {};
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const cat = categorizeFile(e.msbtFile);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [state?.entries]);

  // Category progress: how many translated per category
  const [categoryProgress, setCategoryProgress] = useState<Record<string, { total: number; translated: number }>>({});
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => {
      const progress: Record<string, { total: number; translated: number }> = {};
      for (const e of state.entries) {
        const cat = categorizeFile(e.msbtFile);
        if (!progress[cat]) progress[cat] = { total: 0, translated: 0 };
        progress[cat].total++;
        const key = `${e.msbtFile}:${e.index}`;
        if (state.translations[key]?.trim()) progress[cat].translated++;
      }
      setCategoryProgress(progress);
    }, 800);
    return () => clearTimeout(timer);
  }, [state?.entries, state?.translations]);

  // Quality stats computation - debounced to avoid recomputing on every keystroke
  const [qualityStats, setQualityStats] = useState({ tooLong: 0, nearLimit: 0, missingTags: 0, placeholderMismatch: 0, total: 0, problemKeys: new Set<string>() });
  const qualityTimerRef = useRef<ReturnType<typeof setTimeout>>();
  
  useEffect(() => {
    if (!state) return;
    if (qualityTimerRef.current) clearTimeout(qualityTimerRef.current);
    qualityTimerRef.current = setTimeout(() => {
      let tooLong = 0, nearLimit = 0, missingTags = 0, placeholderMismatch = 0;
      const problemKeys = new Set<string>();

      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key]?.trim();
        if (!translation) continue;

        if (entry.maxBytes > 0) {
          const bytes = translation.length * 2;
          if (bytes > entry.maxBytes) { tooLong++; problemKeys.add(key); }
          else if (bytes / entry.maxBytes > 0.8) { nearLimit++; problemKeys.add(key); }
        }

        const origTags = entry.original.match(/\[[^\]]*\]/g) || [];
        for (const tag of origTags) {
          if (!translation.includes(tag)) { missingTags++; problemKeys.add(key); break; }
        }

        const origPh = (entry.original.match(/\uFFFC/g) || []).length;
        const transPh = (translation.match(/\uFFFC/g) || []).length;
        if (origPh !== transPh) { placeholderMismatch++; problemKeys.add(key); }
      }

      setQualityStats({ tooLong, nearLimit, missingTags, placeholderMismatch, total: problemKeys.size, problemKeys });
    }, 1000); // 1 second debounce for quality stats
    return () => { if (qualityTimerRef.current) clearTimeout(qualityTimerRef.current); };
  }, [state?.entries, state?.translations]);

  // Helper functions for "needs improvement" filters
  const isTranslationTooShort = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    if (!translation?.trim() || !entry.original?.trim()) return false;
    // Translation is less than 30% of original length (suspiciously short)
    return translation.trim().length < entry.original.trim().length * 0.3 && entry.original.trim().length > 5;
  }, []);

  const isTranslationTooLong = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    if (!translation?.trim() || entry.maxBytes <= 0) return false;
    return (translation.length * 2) > entry.maxBytes;
  }, []);

  const hasStuckChars = useCallback((translation: string): boolean => {
    if (!translation?.trim()) return false;
    // Detect Presentation Forms (already processed/stuck characters)
    return hasArabicPresentationForms(translation);
  }, []);

  const isMixedLanguage = useCallback((translation: string): boolean => {
    if (!translation?.trim()) return false;
    // Strip tags before checking
    const stripped = translation.replace(/\[[^\]]*\]/g, '').replace(/\uFFFC/g, '').trim();
    if (!stripped) return false;
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(stripped);
    // Check for actual English words (2+ letters), not just single chars or numbers
    const englishWords = stripped.match(/[a-zA-Z]{2,}/g) || [];
    // Whitelist common gaming terms
    const whitelist = new Set(['HP', 'MP', 'ATK', 'DEF', 'NPC', 'HUD', 'FPS', 'XP', 'DLC', 'UI', 'OK']);
    const realEnglish = englishWords.filter(w => !whitelist.has(w.toUpperCase()));
    return hasArabic && realEnglish.length > 0;
  }, []);

  const needsImprovement = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    return isTranslationTooShort(entry, translation) || 
           isTranslationTooLong(entry, translation) || 
           hasStuckChars(translation) || 
           isMixedLanguage(translation);
  }, [isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage]);

  // Count entries needing improvement (debounced)
  const [needsImproveCount, setNeedsImproveCount] = useState({ total: 0, tooShort: 0, tooLong: 0, stuck: 0, mixed: 0 });
  const needsImproveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!state) return;
    if (needsImproveTimerRef.current) clearTimeout(needsImproveTimerRef.current);
    needsImproveTimerRef.current = setTimeout(() => {
      let tooShort = 0, tooLong = 0, stuck = 0, mixed = 0;
      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key];
        if (!translation?.trim()) continue;
        if (isTranslationTooShort(entry, translation)) tooShort++;
        if (isTranslationTooLong(entry, translation)) tooLong++;
        if (hasStuckChars(translation)) stuck++;
        if (isMixedLanguage(translation)) mixed++;
      }
      const total = new Set([...state.entries.filter(e => {
        const k = `${e.msbtFile}:${e.index}`;
        const t = state.translations[k];
        return t?.trim() && needsImprovement(e, t);
      }).map(e => `${e.msbtFile}:${e.index}`)]).size;
      setNeedsImproveCount({ total, tooShort, tooLong, stuck, mixed });
    }, 1000);
    return () => { if (needsImproveTimerRef.current) clearTimeout(needsImproveTimerRef.current); };
  }, [state?.entries, state?.translations, isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement]);

  const filteredEntries = useMemo(() => {
    if (!state) return [];
    return state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const translation = state.translations[key] || '';
      const isTranslated = translation.trim() !== '';
      const isTechnical = isTechnicalText(e.original);
      
      const matchSearch = !search ||
        e.original.toLowerCase().includes(search.toLowerCase()) ||
        e.label.includes(search) ||
        translation.includes(search);
      const matchFile = filterFile === "all" || e.msbtFile === filterFile;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      const matchStatus = 
        filterStatus === "all" || 
        (filterStatus === "translated" && isTranslated) ||
        (filterStatus === "untranslated" && !isTranslated) ||
        (filterStatus === "problems" && qualityStats.problemKeys.has(key)) ||
        (filterStatus === "needs-improve" && isTranslated && needsImprovement(e, translation)) ||
        (filterStatus === "too-short" && isTranslated && isTranslationTooShort(e, translation)) ||
        (filterStatus === "too-long" && isTranslated && isTranslationTooLong(e, translation)) ||
        (filterStatus === "stuck-chars" && isTranslated && hasStuckChars(translation)) ||
        (filterStatus === "mixed-lang" && isTranslated && isMixedLanguage(translation));
      const matchTechnical = 
        filterTechnical === "all" ||
        (filterTechnical === "only" && isTechnical) ||
        (filterTechnical === "exclude" && !isTechnical);
      
      return matchSearch && matchFile && matchCategory && matchStatus && matchTechnical;
    });
  }, [state, search, filterFile, filterCategory, filterStatus, filterTechnical, qualityStats.problemKeys, needsImprovement, isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [search, filterFile, filterCategory, filterStatus, filterTechnical]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);

  const updateTranslation = (key: string, value: string) => {
    if (!state) return;
    // Save previous value for undo
    const prev = state.translations[key] || '';
    if (prev !== value) {
      setPreviousTranslations(old => ({ ...old, [key]: prev }));
    }
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: value },
    } : null);
  };

  const handleUndoTranslation = (key: string) => {
    if (previousTranslations[key] !== undefined) {
      setState(prev => prev ? {
        ...prev,
        translations: { ...prev.translations, [key]: previousTranslations[key] },
      } : null);
      setPreviousTranslations(old => {
        const copy = { ...old };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleTranslateSingle = async (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    setTranslatingSingle(key);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Gather context from neighbors
      const idx = state.entries.indexOf(entry);
      const contextEntries = [-2, -1, 1, 2]
        .map(offset => state.entries[idx + offset])
        .filter(n => n && state.translations[`${n.msbtFile}:${n.index}`]?.trim())
        .map(n => ({
          key: `${n.msbtFile}:${n.index}`,
          original: n.original,
          translation: state.translations[`${n.msbtFile}:${n.index}`],
        }));

      const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: [{ key, original: entry.original }],
          glossary: state.glossary || '',
          context: contextEntries.length > 0 ? contextEntries : undefined,
        }),
      });

      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      
      if (data.translations && data.translations[key]) {
        updateTranslation(key, data.translations[key]);
      }
    } catch (err) {
      console.error('Single translate error:', err);
    } finally {
      setTranslatingSingle(null);
    }
  };

  // Debounced translated count to avoid recounting on every keystroke
  const [translatedCount, setTranslatedCount] = useState(0);
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => {
      setTranslatedCount(Object.values(state.translations).filter(v => v.trim() !== '').length);
    }, 500);
    return () => clearTimeout(timer);
  }, [state?.translations]);

  const handleAutoTranslate = async () => {
    if (!state) return;

    const arabicRegex = /[\u0600-\u06FF]/;
    
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0, skipCategory = 0;
    
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      if (!matchCategory) { skipCategory++; return false; }
      if (!e.original.trim()) { skipEmpty++; return false; }
      
      const isAlreadyArabic = arabicRegex.test(e.original);
      const isTech = isTechnicalText(e.original);
      const hasBypass = state.technicalBypass?.has(key);
      
      if (isAlreadyArabic) { skipArabic++; return false; }
      if (isTech && !hasBypass) { skipTechnical++; return false; }
      if (state.translations[key] && state.translations[key].trim()) { skipTranslated++; return false; }
      
      return true;
    });

    if (untranslated.length === 0) {
      const reasons: string[] = [];
      if (skipArabic > 0) reasons.push(`${skipArabic} نص عربي أصلاً`);
      if (skipTechnical > 0) reasons.push(`${skipTechnical} نص تقني`);
      if (skipTranslated > 0) reasons.push(`${skipTranslated} مترجم بالفعل`);
      if (skipCategory > 0) reasons.push(`${skipCategory} خارج الفئة`);
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة${reasons.length > 0 ? ` (${reasons.join('، ')})` : ''}`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // === Translation Memory: reuse existing translations for identical texts ===
    const tmMap = new Map<string, string>();
    for (const [key, val] of Object.entries(state.translations)) {
      if (val.trim()) {
        const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
        if (entry) {
          const norm = entry.original.trim().toLowerCase();
          if (!tmMap.has(norm)) tmMap.set(norm, val);
        }
      }
    }

    const tmReused: Record<string, string> = {};
    const needsAI: typeof untranslated = [];

    for (const e of untranslated) {
      const norm = e.original.trim().toLowerCase();
      const cached = tmMap.get(norm);
      if (cached) {
        const key = `${e.msbtFile}:${e.index}`;
        tmReused[key] = cached;
      } else {
        needsAI.push(e);
      }
    }

    // Apply TM results immediately
    if (Object.keys(tmReused).length > 0) {
      setState(prev => prev ? {
        ...prev,
        translations: { ...prev.translations, ...tmReused },
      } : null);
    }

    const tmCount = Object.keys(tmReused).length;
    setTmStats({ reused: tmCount, sent: needsAI.length });

    if (needsAI.length === 0) {
      setTranslateProgress(`✅ تم إعادة استخدام ${tmCount} ترجمة من الذاكرة — لا حاجة للذكاء الاصطناعي!`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    const totalBatches = Math.ceil(needsAI.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    
    abortControllerRef.current = new AbortController();

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }

        const batch = needsAI.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        const tmInfo = tmCount > 0 ? ` (+ ${tmCount} من الذاكرة)` : '';
        setTranslateProgress(`جاري ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...${tmInfo}`);

        const entries = batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
        }));

        // === Context: gather nearby translated entries for better accuracy ===
        const batchIndices = batch.map(e => state.entries.indexOf(e));
        const contextEntries: { key: string; original: string; translation?: string }[] = [];
        const contextKeys = new Set<string>();
        
        for (const idx of batchIndices) {
          for (let offset = -2; offset <= 2; offset++) {
            if (offset === 0) continue;
            const neighbor = state.entries[idx + offset];
            if (!neighbor) continue;
            const nKey = `${neighbor.msbtFile}:${neighbor.index}`;
            if (contextKeys.has(nKey)) continue;
            const nTranslation = state.translations[nKey];
            if (nTranslation?.trim()) {
              contextKeys.add(nKey);
              contextEntries.push({ key: nKey, original: neighbor.original, translation: nTranslation });
            }
          }
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entries,
            glossary: state.glossary || '',
            context: contextEntries.slice(0, 10),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `خطأ ${response.status}`);
        }

        const data = await response.json();
        const batchTranslations = data.translations || {};
        allTranslations = { ...allTranslations, ...batchTranslations };

        if (Object.keys(batchTranslations).length > 0) {
          setState(prev => {
            if (!prev) return null;
            return {
              ...prev,
              translations: { ...prev.translations, ...batchTranslations },
            };
          });
        }
      }

      const aiCount = Object.keys(allTranslations).length;
      const totalDone = aiCount + tmCount;
      const parts: string[] = [];
      if (aiCount > 0) parts.push(`${aiCount} بالذكاء الاصطناعي`);
      if (tmCount > 0) parts.push(`${tmCount} من ذاكرة الترجمة`);
      setTranslateProgress(`✅ تمت ترجمة ${totalDone} نص (${parts.join(' + ')})!`);
      setTimeout(() => setTranslateProgress(""), 5000);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const savedCount = Object.keys(allTranslations).length;
        if (savedCount > 0) {
          setTranslateProgress(`⏹️ تم إيقاف الترجمة - تم حفظ ${savedCount} نص مترجم`);
        } else {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
        }
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        const savedCount = Object.keys(allTranslations).length;
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg}${savedCount > 0 ? ` (تم حفظ ${savedCount} نص قبل الخطأ)` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const handleReviewTranslations = async () => {
    if (!state) return;
    setReviewing(true);
    setReviewResults(null);

    try {
      const reviewEntries = filteredEntries
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          return state.translations[key]?.trim();
        })
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: state.translations[`${e.msbtFile}:${e.index}`],
          maxBytes: e.maxBytes || 0,
        }));

      if (reviewEntries.length === 0) {
        setReviewResults({ issues: [], summary: { total: 0, errors: 0, warnings: 0, checked: 0 } });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: reviewEntries,
          glossary: state.glossary || '',
        }),
      });

      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      setReviewResults(data);
     } catch (err) {
       setTranslateProgress(`❌ خطأ في المراجعة: ${err instanceof Error ? err.message : 'غير معروف'}`);
       setTimeout(() => setTranslateProgress(""), 4000);
     } finally {
       setReviewing(false);
     }
   };

   const handleSuggestShorterTranslations = async () => {
     if (!state || !reviewResults) return;
     
     setSuggestingShort(true);
     setShortSuggestions(null);

     try {
       const reviewEntries = state.entries
         .filter(e => {
           const key = `${e.msbtFile}:${e.index}`;
           return state.translations[key]?.trim();
         })
         .map(e => ({
           key: `${e.msbtFile}:${e.index}`,
           original: e.original,
           translation: state.translations[`${e.msbtFile}:${e.index}`],
           maxBytes: e.maxBytes || 0,
         }));

       const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
       const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

       const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${supabaseKey}`,
           'apikey': supabaseKey,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           entries: reviewEntries,
           glossary: state.glossary || '',
           action: 'suggest-short',
         }),
       });

       if (!response.ok) throw new Error(`خطأ ${response.status}`);
       const data = await response.json();
       setShortSuggestions(data.suggestions || []);
     } catch (err) {
       setShortSuggestions([]);
     } finally {
       setSuggestingShort(false);
     }
   };

    const handleApplyShorterTranslation = (key: string, suggested: string) => {
      if (!state) return;
      setState(prev => prev ? {
        ...prev,
        translations: { ...prev.translations, [key]: suggested },
      } : null);
    };

    const handleApplyAllShorterTranslations = () => {
      if (!state || !shortSuggestions) return;
      
      const updates: Record<string, string> = {};
      shortSuggestions.forEach((suggestion: any) => {
        updates[suggestion.key] = suggestion.suggested;
      });

      setState(prev => prev ? {
        ...prev,
        translations: { ...prev.translations, ...updates },
      } : null);

      setShortSuggestions(null);
      setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} اقتراح قصير`);
      setTimeout(() => setLastSaved(""), 3000);
    };

  const handleStopTranslate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFixAllStuckCharacters = () => {
    if (!state) return;
    
    let fixedCount = 0;
    const updates: Record<string, string> = {};
    
    for (const [key, translation] of Object.entries(state.translations)) {
      if (translation?.trim() && hasArabicPresentationForms(translation)) {
        const fixed = removeArabicPresentationForms(translation);
        if (fixed !== translation) {
          updates[key] = fixed;
          fixedCount++;
        }
      }
    }
    
    if (fixedCount === 0) {
      setLastSaved("لا توجد ترجمات بها أحرف ملتصقة");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, ...updates },
    } : null);
    
    setLastSaved(`✅ تم إصلاح ${fixedCount} ترجمة من الأحرف الملتصقة`);
    setTimeout(() => setLastSaved(""), 3000);
  };


  const handleFixMixedLanguage = async () => {
    if (!state) return;
    setFixingMixed(true);
    setTranslateProgress("🌐 جاري إصلاح النصوص المختلطة...");

    try {
      const mixedEntries = state.entries
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          const translation = state.translations[key];
          return translation?.trim() && isMixedLanguage(translation);
        })
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: state.translations[`${e.msbtFile}:${e.index}`],
        }));

      if (mixedEntries.length === 0) {
        setTranslateProgress("لا توجد نصوص مختلطة للإصلاح");
        setTimeout(() => setTranslateProgress(""), 3000);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Process in batches of 20
      const BATCH = 20;
      const allUpdates: Record<string, string> = {};
      let processed = 0;

      for (let i = 0; i < mixedEntries.length; i += BATCH) {
        const batch = mixedEntries.slice(i, i + BATCH);
        setTranslateProgress(`🌐 إصلاح النصوص المختلطة... ${processed}/${mixedEntries.length}`);

        const response = await fetch(`${supabaseUrl}/functions/v1/fix-mixed-language`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entries: batch,
            glossary: state.glossary || '',
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `خطأ ${response.status}`);
        }

        const data = await response.json();
        if (data.translations) {
          // Store previous translations for undo
          for (const [key, val] of Object.entries(data.translations)) {
            if (state.translations[key] !== val) {
              setPreviousTranslations(prev => ({ ...prev, [key]: state.translations[key] || '' }));
              allUpdates[key] = val as string;
            }
          }
        }
        processed += batch.length;
      }

      const fixedCount = Object.keys(allUpdates).length;
      if (fixedCount > 0) {
        setState(prev => prev ? {
          ...prev,
          translations: { ...prev.translations, ...allUpdates },
        } : null);
      }

      setTranslateProgress(`✅ تم إصلاح ${fixedCount} ترجمة مختلطة اللغة`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally {
      setFixingMixed(false);
    }
  };

  // تنظيف أحرف Presentation Forms - تحويل أحرف العرض المتصلة إلى أحرف عادية
  const normalizeArabicPresentationForms = (text: string): string => {
    if (!text) return text;
    let result = text;
    const presentationMap: Record<string, string> = {
      '\uFB50': 'ا', '\uFB51': 'ا',
      '\uFB52': 'ب', '\uFB53': 'ب', '\uFB54': 'ب', '\uFB55': 'ب',
      '\uFB56': 'ة', '\uFB57': 'ة',
      '\uFB58': 'ت', '\uFB59': 'ت', '\uFB5A': 'ت', '\uFB5B': 'ت',
      '\uFB5C': 'ث', '\uFB5D': 'ث', '\uFB5E': 'ث', '\uFB5F': 'ث',
      '\uFB60': 'ج', '\uFB61': 'ج',
      '\uFB62': 'ح', '\uFB63': 'ح', '\uFB64': 'ح', '\uFB65': 'ح',
      '\uFB66': 'خ', '\uFB67': 'خ',
      '\uFB68': 'د', '\uFB69': 'د',
      '\uFB6A': 'ذ', '\uFB6B': 'ذ',
      '\uFB6C': 'ر', '\uFB6D': 'ر',
      '\uFB6E': 'ز', '\uFB6F': 'ز',
      '\uFB70': 'س', '\uFB71': 'س', '\uFB72': 'س', '\uFB73': 'س',
      '\uFB74': 'ش', '\uFB75': 'ش', '\uFB76': 'ش', '\uFB77': 'ش',
      '\uFB78': 'ص', '\uFB79': 'ص',
      '\uFB7A': 'ض', '\uFB7B': 'ض',
      '\uFB7C': 'ط', '\uFB7D': 'ط',
      '\uFB7E': 'ظ', '\uFB7F': 'ظ',
      '\uFB80': 'ع', '\uFB81': 'ع',
      '\uFB82': 'غ', '\uFB83': 'غ',
      '\uFB84': 'ف', '\uFB85': 'ف',
      '\uFB86': 'ق', '\uFB87': 'ق',
      '\uFB88': 'ك', '\uFB89': 'ك',
      '\uFB8A': 'ل', '\uFB8B': 'ل',
      '\uFB8C': 'م', '\uFB8D': 'م',
      '\uFB8E': 'ن', '\uFB8F': 'ن',
      '\uFB90': 'ه', '\uFB91': 'ه',
      '\uFB92': 'و', '\uFB93': 'و',
      '\uFB94': 'ي', '\uFB95': 'ي', '\uFB96': 'ي', '\uFB97': 'ي',
      '\uFEFB': 'لا', '\uFEFC': 'لا', '\uFEF5': 'لأ', '\uFEF6': 'لأ',
      '\uFEF7': 'لؤ', '\uFEF8': 'لؤ', '\uFEF9': 'لا', '\uFEFA': 'لا',
    };
    for (const [p, s] of Object.entries(presentationMap)) {
      result = result.split(p).join(s);
    }
    result = result.replace(/[\uFE70-\uFEFF]/g, ch => ch.normalize('NFKD'));
    result = result.normalize('NFKD');
    return result;
  };

  const handleExportTranslations = () => {
    if (!state) return;
    // تنظيف أحرف Presentation Forms قبل التصدير لضمان حفظ النصوص بشكلها الأصلي النظيف
    const cleanTranslations: Record<string, string> = {};
    for (const [key, value] of Object.entries(state.translations)) {
      cleanTranslations[key] = normalizeArabicPresentationForms(value);
    }
    const data = JSON.stringify(cleanTranslations, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translations_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

   const handleImportTranslations = () => {
     const input = document.createElement('input');
     input.type = 'file';
     input.accept = '.json';
     input.onchange = async (e) => {
       const file = (e.target as HTMLInputElement).files?.[0];
       if (!file) return;
       try {
         const text = await file.text();
         const imported = JSON.parse(text) as Record<string, string>;
         
         // تنظيف أحرف Presentation Forms من جميع الترجمات المستوردة
         const cleanedImported: Record<string, string> = {};
         for (const [key, value] of Object.entries(imported)) {
           cleanedImported[key] = normalizeArabicPresentationForms(value);
         }
         
         setState(prev => {
           if (!prev) return null;
           return { ...prev, translations: { ...prev.translations, ...cleanedImported } };
         });
         setLastSaved(`✅ تم استيراد ${Object.keys(imported).length} ترجمة وتنظيفها`);
         
         // تصحيح النصوص المعكوسة تلقائياً بعد الاستيراد
         setTimeout(() => {
           setState(prevState => {
             if (!prevState) return null;
             const newTranslations = { ...prevState.translations };
             const newProtected = new Set(prevState.protectedEntries || []);
             let count = 0;
             let skippedProtected = 0;
             let skippedTranslated = 0;
             let skippedSame = 0;

             for (const entry of prevState.entries) {
               const key = `${entry.msbtFile}:${entry.index}`;
               if (hasArabicChars(entry.original)) {
                 if (newProtected.has(key)) {
                   skippedProtected++;
                   continue;
                 }
                 
                 const existing = newTranslations[key]?.trim();
                 const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
                 
                 if (isAutoDetected) {
                   const corrected = unReverseBidi(entry.original);
                   if (corrected !== entry.original) {
                     newTranslations[key] = corrected;
                     newProtected.add(key);
                     count++;
                   } else {
                     skippedSame++;
                   }
                 } else {
                   skippedTranslated++;
                 }
               }
             }

             if (count > 0 || skippedProtected > 0 || skippedTranslated > 0 || skippedSame > 0) {
               const parts: string[] = [];
               if (count > 0) parts.push("تم تصحيح: " + count + " نص");
               if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
               if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
               if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);
               
               const detailedMessage = (count > 0 ? "\u2705 " : "\u26A0\uFE0F ") + "تم التصحيح | " + parts.join(" | ");
               setLastSaved(detailedMessage);
               setTimeout(() => setLastSaved(""), 5000);
             }

             return {
               ...prevState,
               translations: newTranslations,
               protectedEntries: newProtected,
             };
           });
         }, 0);
       } catch {
         alert('ملف JSON غير صالح');
       }
     };
     input.click();
   };

  const handleImportGlossary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setState(prev => prev ? { ...prev, glossary: text } : null);
        setLastSaved(`📖 تم تحميل قاموس المصطلحات (${file.name})`);
        setTimeout(() => setLastSaved(""), 3000);
      } catch {
        alert('خطأ في قراءة الملف');
      }
    };
    input.click();
  };

  const handleLoadDefaultGlossary = async () => {
    try {
      const response = await fetch('/zelda-glossary.txt');
      if (!response.ok) throw new Error('فشل تحميل القاموس');
      const text = await response.text();
      setState(prev => prev ? { ...prev, glossary: text } : null);
      const termCount = text.split('\n').filter(l => l.includes('=')).length;
      setLastSaved(`📖 تم تحميل القاموس الافتراضي (${termCount} مصطلح)`);
      setTimeout(() => setLastSaved(""), 3000);
    } catch {
      alert('خطأ في تحميل القاموس الافتراضي');
    }
  };

  const handleSaveGlossaryToCloud = async () => {
    if (!state || !user || !state.glossary) {
      setCloudStatus('❌ لا يوجد قاموس لحفظه');
      setTimeout(() => setCloudStatus(""), 3000);
      return;
    }

    setCloudSyncing(true);
    setCloudStatus('جاري حفظ القاموس...');

    try {
      const { data, error } = await supabase
        .from('glossaries')
        .insert({
          user_id: user.id,
          name: 'قاموسي',
          content: state.glossary,
        })
        .select()
        .single();

      if (error) throw error;

      setCloudStatus(`✅ تم حفظ القاموس في السحابة (${state.glossary.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) {
      console.error('خطأ في حفظ القاموس:', error);
      setCloudStatus('❌ فشل حفظ القاموس في السحابة');
      setTimeout(() => setCloudStatus(""), 3000);
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleLoadGlossaryFromCloud = async () => {
    if (!user) {
      setCloudStatus('❌ يجب تسجيل الدخول أولاً');
      setTimeout(() => setCloudStatus(""), 3000);
      return;
    }

    setCloudSyncing(true);
    setCloudStatus('جاري تحميل القاموس من السحابة...');

    try {
      const { data, error } = await supabase
        .from('glossaries')
        .select('content')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setCloudStatus('❌ لم يتم العثور على قاموس محفوظ');
        setTimeout(() => setCloudStatus(""), 3000);
        return;
      }

      setState(prev => prev ? { ...prev, glossary: data.content } : null);
      setCloudStatus(`✅ تم تحميل القاموس من السحابة (${data.content.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) {
      console.error('خطأ في تحميل القاموس من السحابة:', error);
      setCloudStatus('❌ فشل تحميل القاموس من السحابة');
      setTimeout(() => setCloudStatus(""), 3000);
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleImproveTranslations = async () => {
    if (!state) return;
    setImprovingTranslations(true);
    setImproveResults(null);

    try {
      const translatedEntries = filteredEntries
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          return state.translations[key]?.trim();
        })
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: state.translations[`${e.msbtFile}:${e.index}`],
          maxBytes: e.maxBytes || 0,
        }));

      if (translatedEntries.length === 0) {
        setTranslateProgress("⚠️ لا توجد ترجمات لتحسينها في النطاق المحدد");
        setTimeout(() => setTranslateProgress(""), 3000);
        return;
      }

      setTranslateProgress(`جاري تحسين ${translatedEntries.length} ترجمة...`);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: translatedEntries,
          glossary: state.glossary || '',
          action: 'improve',
        }),
      });

      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      
      if (improvements.length === 0) {
        setTranslateProgress("✅ جميع الترجمات ممتازة — لا تحتاج تحسين!");
      } else {
        setTranslateProgress(`✅ تم اقتراح تحسينات لـ ${improvements.length} ترجمة`);
        setImproveResults(improvements);
      }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally {
      setImprovingTranslations(false);
    }
  };

  const handleApplyImprovement = (key: string, improved: string) => {
    if (!state) return;
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: improved },
    } : null);
  };

  const handleApplyAllImprovements = () => {
    if (!state || !improveResults) return;
    const updates: Record<string, string> = {};
    improveResults.forEach((item: any) => {
      if (item.improvedBytes <= item.maxBytes || item.maxBytes === 0) {
        updates[item.key] = item.improved;
      }
    });
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, ...updates },
    } : null);
    setImproveResults(null);
    setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} تحسين`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleImproveSingleTranslation = async (entry: ExtractedEntry) => {
    if (!state) return;
    
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = state.translations[key];
    
    if (!translation?.trim()) {
      setTranslateProgress("⚠️ لا توجد ترجمة لتحسينها");
      setTimeout(() => setTranslateProgress(""), 3000);
      return;
    }

    setImprovingTranslations(true);
    setImproveResults(null);

    try {
      setTranslateProgress(`جاري تحسين الترجمة...`);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: [{
            key,
            original: entry.original,
            translation,
            maxBytes: entry.maxBytes || 0,
          }],
          glossary: state.glossary || '',
          action: 'improve',
        }),
      });

      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      
      if (improvements.length === 0) {
        setTranslateProgress("✅ هذه الترجمة ممتازة — لا تحتاج تحسين!");
      } else {
        setTranslateProgress(`✅ تم اقتراح تحسين لهذه الترجمة`);
        setImproveResults(improvements);
      }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally {
      setImprovingTranslations(false);
    }
  };

  const handleCloudSave = async () => {
    if (!state || !user) return;
    setCloudSyncing(true);
    setCloudStatus("جاري الحفظ في السحابة...");
    try {
      const translated = Object.values(state.translations).filter(v => v.trim() !== '').length;
      const { data: existing } = await supabase
        .from('translation_projects')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('translation_projects')
          .update({
            translations: state.translations,
            entry_count: state.entries.length,
            translated_count: translated,
          })
          .eq('id', existing[0].id);
      } else {
        await supabase
          .from('translation_projects')
          .insert({
            user_id: user.id,
            translations: state.translations,
            entry_count: state.entries.length,
            translated_count: translated,
          });
      }
      setCloudStatus("☁️ تم الحفظ في السحابة بنجاح!");
    } catch (err) {
      setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في الحفظ'}`);
    } finally {
      setCloudSyncing(false);
      setTimeout(() => setCloudStatus(""), 4000);
    }
  };

  const handleCloudLoad = async () => {
    if (!user) return;
    
    
    setCloudSyncing(true);
    setCloudStatus("جاري التحميل من السحابة...");
    try {
      const { data, error } = await supabase
        .from('translation_projects')
        .select('translations')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setCloudStatus("لا توجد ترجمات محفوظة في السحابة");
        setTimeout(() => setCloudStatus(""), 3000);
        return;
      }

      const cloudTranslations = data.translations as Record<string, string>;
      setState(prev => {
        if (!prev) return null;
        return { ...prev, translations: { ...prev.translations, ...cloudTranslations } };
      });
      setCloudStatus(`☁️ تم تحميل ${Object.keys(cloudTranslations).length} ترجمة من السحابة`);
    } catch (err) {
      setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في التحميل'}`);
    } finally {
      setCloudSyncing(false);
      setTimeout(() => setCloudStatus(""), 4000);
    }
  };

  const handleApplyArabicProcessing = () => {
    if (!state) return;

    setApplyingArabic(true);
    const newTranslations = { ...state.translations };
    let processedCount = 0;
    let skippedCount = 0;

    for (const [key, value] of Object.entries(newTranslations)) {
      if (!value?.trim()) continue;
      // Skip texts that already have Presentation Forms (already processed)
      if (hasArabicPresentationForms(value)) {
        skippedCount++;
        continue;
      }
      if (!hasArabicCharsProcessing(value)) continue;
      
      newTranslations[key] = processArabicText(value, {
        arabicNumerals,
        mirrorPunct: mirrorPunctuation,
      });
      processedCount++;
    }

    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setApplyingArabic(false);
    setLastSaved(`✅ تم تطبيق المعالجة العربية على ${processedCount} نص` + (skippedCount > 0 ? ` (تم تخطي ${skippedCount} نص معالج مسبقاً)` : ''));
    setTimeout(() => setLastSaved(""), 5000);
  };

  const handleBuild = async () => {
    if (!state) return;

    const langBuf = await idbGet<ArrayBuffer>("editorLangFile");
    const dictBuf = await idbGet<ArrayBuffer>("editorDictFile");
    const langFileName = (await idbGet<string>("editorLangFileName")) || "output.zs";

    if (!langBuf) {
      setBuildProgress("❌ ملف اللغة غير موجود. يرجى العودة لصفحة المعالجة وإعادة رفع الملفات.");
      setTimeout(() => setBuildProgress(""), 5000);
      return;
    }

    setBuilding(true);
    setBuildProgress("تجهيز الترجمات...");

    try {
      const formData = new FormData();
      formData.append("langFile", new File([new Uint8Array(langBuf)], langFileName));
      if (dictBuf) {
        formData.append("dictFile", new File([new Uint8Array(dictBuf)], (await idbGet<string>("editorDictFileName")) || "ZsDic.pack.zs"));
      }

      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.translations)) {
        if (v.trim()) nonEmptyTranslations[k] = v;
      }
      formData.append("translations", JSON.stringify(nonEmptyTranslations));
      formData.append("protectedEntries", JSON.stringify(Array.from(state.protectedEntries || [])));
      if (arabicNumerals) formData.append("arabicNumerals", "true");
      if (mirrorPunctuation) formData.append("mirrorPunctuation", "true");
      setBuildProgress("إرسال للمعالجة...");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/arabize?mode=build`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const err = await response.json();
          throw new Error(err.error || `خطأ ${response.status}`);
        }
        throw new Error(`خطأ ${response.status}`);
      }

      setBuildProgress("تحميل الملف...");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0');

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `arabized_${langFileName}`;
      a.click();

      setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 3000);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 5000);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground mb-4">لا توجد بيانات للتحرير. يرجى استخراج النصوص أولاً.</p>
          <Link to="/process">
            <Button className="font-display">اذهب لصفحة المعالجة</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-4 md:py-8 px-3 md:px-4">
      <div className="max-w-6xl mx-auto">
        <Link to="/process" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 md:mb-6 font-body text-sm">
          <ArrowRight className="w-4 h-4" />
          العودة للمعالجة
        </Link>

        <h1 className="text-2xl md:text-3xl font-display font-bold mb-1 md:mb-2">محرر الترجمة ✍️</h1>
        <p className="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 font-body">
          عدّل النصوص العربية يدوياً أو استخدم الترجمة التلقائية
        </p>

        {/* Stats Cards - simplified on mobile */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-6">
          <Card className="flex-1 min-w-[100px]">
            <CardContent className="flex items-center gap-2 md:gap-3 p-3 md:p-4">
              <FileText className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              <div>
                <p className="text-base md:text-lg font-display font-bold">{state.entries.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground">إجمالي</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[100px]">
            <CardContent className="flex items-center gap-2 md:gap-3 p-3 md:p-4">
              <FileText className="w-4 h-4 md:w-5 md:h-5 text-secondary" />
              <div>
                <p className="text-base md:text-lg font-display font-bold">{translatedCount}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground">مترجم</p>
              </div>
            </CardContent>
          </Card>
          {!isMobile && (
            <>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="flex items-center gap-3 p-4">
                  <FileText className="w-5 h-5 text-destructive" />
                  <div>
                    <p className="text-lg font-display font-bold">{state.entries.length - translatedCount}</p>
                    <p className="text-xs text-muted-foreground">غير مترجم</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="flex items-center gap-3 p-4">
                  <Tag className="w-5 h-5 text-accent" />
                  <div>
                    <p className="text-lg font-display font-bold">{state.protectedEntries?.size || 0} / {state.entries.length}</p>
                    <p className="text-xs text-muted-foreground">محمي من العكس</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {translating ? (
            <Button
              size={isMobile ? "default" : "lg"}
              variant="destructive"
              onClick={handleStopTranslate}
              className="font-display font-bold px-4 md:px-6"
            >
              <><Loader2 className="w-4 h-4 animate-spin" /> إيقاف ⏹️</>
            </Button>
          ) : (
            <Button
              size={isMobile ? "default" : "lg"}
              variant="default"
              onClick={handleAutoTranslate}
              disabled={translating}
              className="font-display font-bold px-4 md:px-6"
            >
              <Sparkles className="w-4 h-4" /> ترجمة تلقائية 🤖
            </Button>
          )}
        </div>

        {/* Category Progress */}
        {Object.keys(categoryProgress).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            {FILE_CATEGORIES.filter(cat => categoryProgress[cat.id]).map(cat => {
              const prog = categoryProgress[cat.id];
              const pct = prog.total > 0 ? Math.round((prog.translated / prog.total) * 100) : 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(filterCategory === cat.id ? "all" : cat.id)}
                  className={`p-2 rounded-lg border text-xs text-right transition-colors ${
                    filterCategory === cat.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 bg-card/50 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span>{cat.emoji}</span>
                    <span className="font-mono text-muted-foreground">{pct}%</span>
                  </div>
                  <p className="font-display font-bold truncate">{cat.label}</p>
                  <Progress value={pct} className="h-1 mt-1" />
                  <p className="text-muted-foreground mt-1">{prog.translated}/{prog.total}</p>
                </button>
              );
            })}
            {categoryProgress['other'] && (
              <button
                onClick={() => setFilterCategory(filterCategory === "other" ? "all" : "other")}
                className={`p-2 rounded-lg border text-xs text-right transition-colors ${
                  filterCategory === "other"
                    ? 'border-primary bg-primary/10'
                    : 'border-border/50 bg-card/50 hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span>📁</span>
                  <span className="font-mono text-muted-foreground">
                    {categoryProgress['other'].total > 0 ? Math.round((categoryProgress['other'].translated / categoryProgress['other'].total) * 100) : 0}%
                  </span>
                </div>
                <p className="font-display font-bold truncate">أخرى</p>
                <Progress value={categoryProgress['other'].total > 0 ? (categoryProgress['other'].translated / categoryProgress['other'].total) * 100 : 0} className="h-1 mt-1" />
                <p className="text-muted-foreground mt-1">{categoryProgress['other'].translated}/{categoryProgress['other'].total}</p>
              </button>
            )}
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-display font-bold text-foreground">
              نسبة الإنجاز
            </span>
            <span className="text-sm font-body text-muted-foreground">
              {translatedCount} / {state.entries.length} ({state.entries.length > 0 ? Math.round((translatedCount / state.entries.length) * 100) : 0}%)
            </span>
          </div>
          <Progress 
            value={state.entries.length > 0 ? (translatedCount / state.entries.length) * 100 : 0}
            className="h-2.5"
          />
        </div>

        {/* Status Messages */}
        {lastSaved && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{lastSaved}</CardContent>
          </Card>
        )}
        
        {translateProgress && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{translateProgress}</CardContent>
          </Card>
        )}

        {buildProgress && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{buildProgress}</CardContent>
          </Card>
        )}


        {cloudStatus && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center font-display">{cloudStatus}</CardContent>
          </Card>
        )}

        {tmStats && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">
              🧠 ذاكرة الترجمة: أُعيد استخدام {tmStats.reused} ترجمة — أُرسل {tmStats.sent} للذكاء الاصطناعي
            </CardContent>
          </Card>
        )}

        {reviewResults && (
          <Card className="mb-4 border-border bg-card">
            <CardContent className="p-4">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                تقرير المراجعة الذكية
              </h3>
              
              {/* Filter Scope Label */}
              <div className="mb-3 p-2 rounded bg-secondary/30 border border-secondary/50 text-xs text-muted-foreground">
                <p className="font-medium mb-1">نطاق المراجعة:</p>
                <p>
                  {(() => {
                    const filters: string[] = [];
                    if (filterCategory !== "all") {
                      const category = FILE_CATEGORIES.find(c => c.id === filterCategory);
                      if (category) filters.push(`${category.emoji} ${category.label}`);
                    } else {
                      filters.push("📚 جميع الفئات");
                    }
                    if (filterFile !== "all") filters.push(`📄 ملف محدد`);
                    if (filterStatus !== "all") {
                      const statusLabels: Record<string, string> = {
                        "translated": "✅ مترجمة",
                        "untranslated": "⬜ غير مترجمة",
                        "problems": "🚨 بها مشاكل",
                        "needs-improve": "⚠️ تحتاج تحسين",
                        "too-short": "📏 قصيرة جداً",
                        "too-long": "📐 طويلة جداً",
                        "stuck-chars": "🔤 أحرف ملتصقة",
                        "mixed-lang": "🌐 عربي + إنجليزي"
                      };
                      if (statusLabels[filterStatus]) filters.push(statusLabels[filterStatus]);
                    }
                    if (search) filters.push(`🔍 بحث: "${search}"`);
                    return filters.join(" • ");
                  })()}
                </p>
              </div>
              
              <div className="flex gap-4 mb-3 text-sm">
                <span>✅ فُحص: {reviewResults.summary.checked}</span>
                <span className="text-destructive">❌ أخطاء: {reviewResults.summary.errors}</span>
                <span className="text-amber-500">⚠️ تحذيرات: {reviewResults.summary.warnings}</span>
              </div>
              {reviewResults.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">🎉 لا توجد مشاكل! الترجمات تبدو سليمة.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {reviewResults.issues.slice(0, 50).map((issue: any, i: number) => (
                    <div key={i} className={`p-2 rounded text-xs border ${
                      issue.severity === 'error' ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5'
                    }`}>
                      <p className="font-mono text-muted-foreground mb-1">{issue.key}</p>
                      <p>{issue.message}</p>
                      {issue.suggestion && <p className="text-primary mt-1">💡 {issue.suggestion}</p>}
                    </div>
                  ))}
                  {reviewResults.issues.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center">... و {reviewResults.issues.length - 50} مشكلة أخرى</p>
                  )}
                </div>
               )}
               <div className="flex gap-2 mt-3">
                 <Button 
                   variant="outline"
                   size="sm" 
                   onClick={handleSuggestShorterTranslations}
                   disabled={suggestingShort || reviewResults.issues.length === 0}
                   className="text-xs border-primary/30"
                 >
                   {suggestingShort ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                   اقترح بدائل أقصر
                 </Button>
                 <Button variant="ghost" size="sm" onClick={() => { setReviewResults(null); setShortSuggestions(null); }} className="text-xs">
                   إغلاق ✕
                 </Button>
               </div>
             </CardContent>
           </Card>
         )}

         {shortSuggestions && shortSuggestions.length > 0 && (
           <Card className="mb-4 border-border bg-card">
             <CardContent className="p-4">
               <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                 <Sparkles className="w-5 h-5 text-primary" />
                 بدائل أقصر مقترحة
               </h3>
               <div className="max-h-64 overflow-y-auto space-y-3">
                 {shortSuggestions.map((suggestion: any, i: number) => (
                   <div key={i} className="p-3 rounded border border-border/50 bg-background/50">
                     <p className="text-xs text-muted-foreground mb-2">{suggestion.key}</p>
                     <p className="text-xs mb-2"><strong>الأصلي:</strong> {suggestion.original}</p>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-2">
                       <div>
                         <p className="text-muted-foreground">الحالي ({suggestion.currentBytes}/{suggestion.maxBytes} بايت)</p>
                         <p className="p-2 bg-destructive/5 rounded border border-destructive/30">{suggestion.current}</p>
                       </div>
                       <div>
                         <p className="text-muted-foreground">المقترح ({suggestion.suggestedBytes}/{suggestion.maxBytes} بايت)</p>
                         <p className="p-2 bg-primary/5 rounded border border-primary/30">{suggestion.suggested}</p>
                       </div>
                     </div>
                     <Button 
                       size="sm"
                       onClick={() => {
                         handleApplyShorterTranslation(suggestion.key, suggestion.suggested);
                         setShortSuggestions(shortSuggestions.filter((_: any, idx: number) => idx !== i));
                       }}
                       className="text-xs h-7"
                     >
                       ✓ تطبيق المقترح
                     </Button>
                   </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm"
                    onClick={handleApplyAllShorterTranslations}
                    className="text-xs h-7 flex-1"
                  >
                    ✓ تطبيق الكل ({shortSuggestions.length})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShortSuggestions(null)} className="mt-0 text-xs">
                    إغلاق الاقتراحات ✕
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Improve Results */}
          {improveResults && improveResults.length > 0 && (
            <Card className="mb-4 border-border bg-card">
              <CardContent className="p-4">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-secondary" />
                  تحسينات مقترحة ({improveResults.length})
                </h3>
                <div className="max-h-80 overflow-y-auto space-y-3">
                  {improveResults.map((item: any, i: number) => (
                    <div key={i} className="p-3 rounded border border-border/50 bg-background/50">
                      <p className="text-xs text-muted-foreground mb-2 font-mono">{item.key}</p>
                      <p className="text-xs mb-2"><strong>الأصلي:</strong> {item.original}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <p className="text-muted-foreground">الحالي ({item.currentBytes} بايت)</p>
                          <p className="p-2 bg-muted/30 rounded border border-border/30" dir="rtl">{item.current}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">المحسّن ({item.improvedBytes} بايت){item.maxBytes > 0 && item.improvedBytes > item.maxBytes ? ' ⚠️ يتجاوز الحد' : ''}</p>
                          <p className="p-2 bg-secondary/5 rounded border border-secondary/30" dir="rtl">{item.improved}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleApplyImprovement(item.key, item.improved);
                          setImproveResults(improveResults.filter((_: any, idx: number) => idx !== i));
                        }}
                        disabled={item.maxBytes > 0 && item.improvedBytes > item.maxBytes}
                        className="text-xs h-7"
                      >
                        ✓ تطبيق التحسين
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleApplyAllImprovements}
                    className="text-xs h-7 flex-1"
                  >
                    ✓ تطبيق الكل ({improveResults.length})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setImproveResults(null)} className="text-xs">
                    إغلاق ✕
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        {!user && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة
            </CardContent>
          </Card>
        )}

        {/* Category progress section removed for performance */}

        {/* Filter Bar - collapsible on mobile */}
        <div className="mb-6 p-3 md:p-4 bg-card rounded border border-border">
          <div className="flex gap-2 md:gap-3 items-center">
            <DebouncedInput
              placeholder="ابحث عن نصوص..."
              value={search}
              onChange={(val) => setSearch(val)}
              className="flex-1 min-w-[120px] px-3 py-2 rounded bg-background border border-border font-body text-sm"
            />
            {isMobile ? (
              <Button
                variant={filtersOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="font-body text-xs shrink-0"
              >
                <Filter className="w-3 h-3" /> فلاتر
              </Button>
            ) : (
              <>
                <select
                  value={filterFile}
                  onChange={(e) => setFilterFile(e.target.value)}
                  className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
                >
                  <option value="all">كل الملفات</option>
                  {msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
                >
                  <option value="all">كل الفئات</option>
                  {FILE_CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>)}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
                >
                  <option value="all">الكل</option>
                   <option value="translated">مترجم</option>
                   <option value="untranslated">غير مترجم</option>
                   <option value="problems">⚠️ بها مشاكل ({qualityStats.total})</option>
                   <option value="needs-improve">🔧 تحتاج تحسين ({needsImproveCount.total})</option>
                   <option value="too-short">📏 قصيرة جداً ({needsImproveCount.tooShort})</option>
                   <option value="too-long">📐 طويلة جداً ({needsImproveCount.tooLong})</option>
                   <option value="stuck-chars">🔤 أحرف ملتصقة ({needsImproveCount.stuck})</option>
                   <option value="mixed-lang">🌐 عربي + إنجليزي ({needsImproveCount.mixed})</option>
                </select>
                <Button
                  variant={showQualityStats ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowQualityStats(!showQualityStats)}
                  className="font-body text-xs"
                >
                  <BarChart3 className="w-3 h-3" /> إحصائيات الجودة
                </Button>
                <Button
                  variant={quickReviewMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => { setQuickReviewMode(!quickReviewMode); setQuickReviewIndex(0); }}
                  className="font-body text-xs"
                >
                  <Eye className="w-3 h-3" /> مراجعة سريعة
                </Button>
              </>
            )}
          </div>
          {/* Mobile filters dropdown */}
          {isMobile && filtersOpen && (
            <div className="mt-3 flex flex-col gap-2">
              <select
                value={filterFile}
                onChange={(e) => setFilterFile(e.target.value)}
                className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
              >
                <option value="all">كل الملفات</option>
                {msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
              >
                <option value="all">كل الفئات</option>
                {FILE_CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
              >
                <option value="all">الكل</option>
                 <option value="translated">مترجم</option>
                 <option value="untranslated">غير مترجم</option>
                 <option value="problems">⚠️ بها مشاكل ({qualityStats.total})</option>
                 <option value="needs-improve">🔧 تحتاج تحسين ({needsImproveCount.total})</option>
                 <option value="too-short">📏 قصيرة جداً ({needsImproveCount.tooShort})</option>
                 <option value="too-long">📐 طويلة جداً ({needsImproveCount.tooLong})</option>
                 <option value="stuck-chars">🔤 أحرف ملتصقة ({needsImproveCount.stuck})</option>
                 <option value="mixed-lang">🌐 عربي + إنجليزي ({needsImproveCount.mixed})</option>
              </select>
              <div className="flex gap-2">
                <Button
                  variant={showQualityStats ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowQualityStats(!showQualityStats)}
                  className="font-body text-xs flex-1"
                >
                  <BarChart3 className="w-3 h-3" /> جودة
                </Button>
                <Button
                  variant={quickReviewMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => { setQuickReviewMode(!quickReviewMode); setQuickReviewIndex(0); }}
                  className="font-body text-xs flex-1"
                >
                  <Eye className="w-3 h-3" /> مراجعة
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Cloud Actions */}
        {user && (
          <div className={`mb-6 flex gap-${isMobile ? '2' : '3'} flex-wrap`}>
            <Button
              size={isMobile ? "sm" : "lg"}
              variant="outline"
              onClick={handleCloudSave}
              disabled={cloudSyncing || translatedCount === 0}
              className={`font-display font-bold px-4 border-primary/30 ${isMobile ? 'text-xs' : ''}`}
            >
              <CloudUpload className="w-4 h-4" /> حفظ في السحابة
            </Button>
            <Button
              size={isMobile ? "sm" : "lg"}
              variant="outline"
              onClick={handleCloudLoad}
              disabled={cloudSyncing}
              className={`font-display font-bold px-4 border-primary/30 ${isMobile ? 'text-xs' : ''}`}
            >
              <Cloud className="w-4 h-4" /> تحميل من السحابة
            </Button>
          </div>
        )}

        {/* Export/Import Actions */}
        {isMobile ? (
          <div className="mb-6 flex gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-body text-xs">
                  <Download className="w-3 h-3" /> ملفات
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border z-50">
                <DropdownMenuLabel className="text-xs">تصدير واستيراد</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportTranslations}>
                  <Download className="w-4 h-4" /> تصدير JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportTranslations}>
                  <Upload className="w-4 h-4" /> استيراد JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleImportGlossary}>
                  <BookOpen className="w-4 h-4" /> تحميل قاموس
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLoadDefaultGlossary}>
                  📖 القاموس الافتراضي
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-body text-xs" disabled={!user}>
                  <Cloud className="w-3 h-3" /> سحابة
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border z-50">
                <DropdownMenuLabel className="text-xs">المزامنة السحابية</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSaveGlossaryToCloud} disabled={!user || cloudSyncing}>
                  <CloudUpload className="w-4 h-4" /> حفظ القاموس
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLoadGlossaryFromCloud} disabled={!user || cloudSyncing}>
                  <Cloud className="w-4 h-4" /> تحميل القاموس
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-body text-xs">
                  <MoreVertical className="w-3 h-3" /> أدوات
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border z-50">
                <DropdownMenuItem onClick={handleApplyArabicProcessing} disabled={applyingArabic}>
                  <Sparkles className="w-4 h-4" /> تطبيق المعالجة العربية ✨
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFixAllReversed}>
                  <RotateCcw className="w-4 h-4" /> تصحيح الكل (معكوس)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReviewTranslations} disabled={reviewing || translatedCount === 0}>
                  <ShieldCheck className="w-4 h-4" /> مراجعة ذكية 🔍
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImproveTranslations} disabled={improvingTranslations || translatedCount === 0}>
                  <Sparkles className="w-4 h-4" /> تحسين الترجمات ✨
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleFixAllStuckCharacters} disabled={needsImproveCount.stuck === 0}>
                  <AlertTriangle className="w-4 h-4" /> إصلاح الأحرف الملتصقة 🔤
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFixMixedLanguage} disabled={fixingMixed || needsImproveCount.mixed === 0}>
                  {fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} إصلاح النصوص المختلطة 🌐
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="mb-6 flex gap-3 flex-wrap">
            <Button variant="outline" onClick={handleExportTranslations} className="font-body">
              <Download className="w-4 h-4" /> تصدير JSON
            </Button>
            <Button variant="outline" onClick={handleImportTranslations} className="font-body">
              <Upload className="w-4 h-4" /> استيراد JSON
            </Button>
            <Button variant="outline" onClick={handleImportGlossary} className="font-body">
              <BookOpen className="w-4 h-4" /> تحميل قاموس
            </Button>
            <Button variant="outline" onClick={handleLoadDefaultGlossary} className="font-body border-primary/30 text-primary hover:text-primary">
              📖 القاموس الافتراضي
            </Button>
            <Button variant="outline" onClick={handleSaveGlossaryToCloud} disabled={!user || cloudSyncing} className="font-body border-secondary/30 text-secondary hover:text-secondary">
              {cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CloudUpload className="w-4 h-4 mr-2" />}
              حفظ القاموس ☁️
            </Button>
            <Button variant="outline" onClick={handleLoadGlossaryFromCloud} disabled={!user || cloudSyncing} className="font-body border-secondary/30 text-secondary hover:text-secondary">
              {cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Cloud className="w-4 h-4 mr-2" />}
              تحميل من السحابة ☁️
            </Button>
            <Button variant="outline" onClick={handleFixAllReversed} className="font-body border-accent/30 text-accent hover:text-accent">
              <RotateCcw className="w-4 h-4" /> تصحيح الكل (عربي معكوس)
            </Button>
            <Button
              variant="outline"
              onClick={handleReviewTranslations}
              disabled={reviewing || translatedCount === 0}
              className="font-body border-green-500/30 text-green-600 hover:text-green-700"
            >
              {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              مراجعة ذكية 🔍
            </Button>
            <Button
              variant="outline"
              onClick={handleImproveTranslations}
              disabled={improvingTranslations || translatedCount === 0}
              className="font-body border-secondary/30 text-secondary hover:text-secondary"
            >
              {improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              تحسين الترجمات ✨
            </Button>
            <Button
              variant="outline"
              onClick={handleFixMixedLanguage}
              disabled={fixingMixed || needsImproveCount.mixed === 0}
              className="font-body border-primary/30 text-primary hover:text-primary"
            >
              {fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
              إصلاح النصوص المختلطة 🌐
            </Button>
          </div>
        )}

        {/* Build Options */}
        <Card className="mb-4 border-border">
          <CardContent className="p-4">
            <h3 className="font-display font-bold mb-3 text-sm">⚙️ خيارات البناء</h3>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
                <input
                  type="checkbox"
                  checked={arabicNumerals}
                  onChange={(e) => setArabicNumerals(e.target.checked)}
                  className="rounded border-border"
                />
                تحويل الأرقام إلى هندية (٠١٢٣٤٥٦٧٨٩)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
                <input
                  type="checkbox"
                  checked={mirrorPunctuation}
                  onChange={(e) => setMirrorPunctuation(e.target.checked)}
                  className="rounded border-border"
                />
                عكس علامات الترقيم (؟ ، ؛)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Arabic Processing + Build Buttons */}
        <div className="flex gap-3 mb-6">
          <Button
            size="lg"
            variant="secondary"
            onClick={handleApplyArabicProcessing}
            disabled={applyingArabic}
            className="flex-1 font-display font-bold"
          >
            {applyingArabic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            تطبيق المعالجة العربية ✨
          </Button>
          <Button
            size="lg"
            onClick={handleBuild}
            disabled={building}
            className="flex-1 font-display font-bold"
          >
            {building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
            بناء الملف النهائي
          </Button>
        </div>

        {/* Quality Stats Panel */}
        {showQualityStats && (
          <Card className="mb-6 border-border">
            <CardContent className="p-4">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                إحصائيات الجودة
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
                  <p className="text-2xl font-display font-bold text-destructive">{qualityStats.tooLong}</p>
                  <p className="text-xs text-muted-foreground">تجاوز حد البايت</p>
                </div>
                <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 text-center">
                  <p className="text-2xl font-display font-bold text-amber-500">{qualityStats.nearLimit}</p>
                  <p className="text-xs text-muted-foreground">قريب من الحد (&gt;80%)</p>
                </div>
                <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
                  <p className="text-2xl font-display font-bold text-destructive">{qualityStats.missingTags}</p>
                  <p className="text-xs text-muted-foreground">Tags مفقودة</p>
                </div>
                <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
                  <p className="text-2xl font-display font-bold text-destructive">{qualityStats.placeholderMismatch}</p>
                  <p className="text-xs text-muted-foreground">عناصر نائبة مختلفة</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Progress value={qualityStats.total > 0 ? Math.max(0, 100 - (qualityStats.total / Math.max(translatedCount, 1)) * 100) : 100} className="h-2 flex-1" />
                <span className="text-xs font-display text-muted-foreground">
                  {qualityStats.total > 0 ? `${qualityStats.total} نص بمشاكل` : '✅ لا مشاكل'}
                </span>
              </div>
              {qualityStats.total > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setFilterStatus("problems"); setShowQualityStats(false); }}
                  className="mt-3 text-xs"
                >
                  <Filter className="w-3 h-3" /> عرض النصوص بها مشاكل فقط
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Review Mode */}
        {quickReviewMode && filteredEntries.length > 0 ? (
          <Card className="mb-6 border-primary/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  المراجعة السريعة
                </h3>
                <span className="text-sm text-muted-foreground font-display">
                  {quickReviewIndex + 1} / {filteredEntries.length}
                </span>
              </div>
              
              <Progress value={((quickReviewIndex + 1) / filteredEntries.length) * 100} className="h-1.5 mb-4" />

              {(() => {
                const entry = filteredEntries[quickReviewIndex];
                if (!entry) return null;
                const key = `${entry.msbtFile}:${entry.index}`;
                const translation = state?.translations[key] || '';
                const hasProblem = qualityStats.problemKeys.has(key);
                const byteUsed = entry.maxBytes > 0 ? translation.length * 2 : 0;
                
                return (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{entry.msbtFile} • {entry.label}</p>
                    
                    <div className="p-3 rounded border border-border/50 bg-muted/30 mb-3">
                      <p className="text-xs text-muted-foreground mb-1">النص الأصلي:</p>
                      <p className="font-body text-sm">{entry.original}</p>
                    </div>

                    {hasProblem && (
                      <p className="text-xs text-destructive mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> هذا النص به مشكلة
                        {entry.maxBytes > 0 && byteUsed > entry.maxBytes && ` (${byteUsed}/${entry.maxBytes} بايت)`}
                      </p>
                    )}

                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground mb-1">الترجمة:</p>
                      <DebouncedInput
                        value={translation}
                        onChange={(val) => updateTranslation(key, val)}
                        placeholder="أدخل الترجمة..."
                        className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
                        autoFocus
                      />
                      {entry.maxBytes > 0 && (
                        <p className={`text-xs mt-1 ${byteUsed > entry.maxBytes ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {byteUsed}/{entry.maxBytes} بايت
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQuickReviewIndex(Math.max(0, quickReviewIndex - 1))}
                        disabled={quickReviewIndex === 0}
                      >
                        <ChevronRight className="w-4 h-4" /> السابق
                      </Button>
                      
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setQuickReviewIndex(Math.min(filteredEntries.length - 1, quickReviewIndex + 1))}
                        disabled={quickReviewIndex >= filteredEntries.length - 1}
                        className="flex-1"
                      >
                        <Check className="w-4 h-4" /> قبول والتالي
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          updateTranslation(key, '');
                          setQuickReviewIndex(Math.min(filteredEntries.length - 1, quickReviewIndex + 1));
                        }}
                        disabled={quickReviewIndex >= filteredEntries.length - 1 && !translation}
                      >
                        <X className="w-4 h-4" /> رفض
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setQuickReviewMode(false)}
                      >
                        إغلاق
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        ) : null}

        {/* Pagination Header */}
        {filteredEntries.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              عرض {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filteredEntries.length)} من {filteredEntries.length} نص
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronRight className="w-4 h-4" /> السابق
              </Button>
              <span className="text-sm font-display">{currentPage + 1} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
              >
                التالي <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Entries List */}
        <div className="space-y-2">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد نصوص مطابقة</p>
          ) : (
            paginatedEntries.map((entry, idx) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const translation = state?.translations[key] || '';
              const isProtected = state?.protectedEntries?.has(key);
              const isTech = isTechnicalText(entry.original);
              const hasProblem = qualityStats.problemKeys.has(key);
              
              return (
                <Card key={key} className={`p-3 md:p-4 border-border/50 hover:border-border transition-colors ${hasProblem ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                  <div className={`flex ${isMobile ? 'flex-col' : 'items-start'} gap-3 md:gap-4`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1 truncate">{entry.msbtFile} • {entry.label}</p>
                      <p className="font-body text-sm mb-2 break-words">{entry.original}</p>
                      {isTech && (
                        <p className="text-xs text-accent mb-2">⚠️ نص تقني - تحتاج حذر في الترجمة</p>
                      )}
                      {hasProblem && (
                        <p className="text-xs text-destructive mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> يحتاج مراجعة
                        </p>
                      )}
                      {translation?.trim() && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {isTranslationTooShort(entry, translation) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">📏 قصيرة جداً</span>
                          )}
                          {isTranslationTooLong(entry, translation) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">📐 تتجاوز الحد</span>
                          )}
                          {hasStuckChars(translation) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">🔤 أحرف ملتصقة</span>
                          )}
                          {isMixedLanguage(translation) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">🌐 عربي + إنجليزي</span>
                          )}
                        </div>
                      )}
                      {hasArabicChars(entry.original) && (!translation || translation === entry.original) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFixReversed(entry)}
                          className="text-xs text-accent mb-2 h-7 px-2"
                        >
                          <RotateCcw className="w-3 h-3" /> تصحيح المعكوس
                        </Button>
                      )}
                      <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
                        <DebouncedInput
                          value={translation}
                          onChange={(val) => updateTranslation(key, val)}
                          placeholder="أدخل الترجمة..."
                          className="flex-1 w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-9 w-9 shrink-0"
                             onClick={() => handleTranslateSingle(entry)}
                             disabled={translatingSingle === key}
                             title="ترجمة هذا النص"
                           >
                             {translatingSingle === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
                           </Button>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-9 w-9 shrink-0"
                             onClick={() => handleImproveSingleTranslation(entry)}
                             disabled={improvingTranslations || !translation?.trim()}
                             title="تحسين هذه الترجمة"
                           >
                             {improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-secondary" />}
                           </Button>
                           {previousTranslations[key] !== undefined && (
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-9 w-9 shrink-0"
                               onClick={() => handleUndoTranslation(key)}
                               title="تراجع عن التعديل"
                             >
                               <RotateCcw className="w-4 h-4 text-muted-foreground" />
                             </Button>
                           )}
                         </div>
                      </div>
                      {/* Byte usage progress bar */}
                      {entry.maxBytes > 0 && translation && (() => {
                        const byteUsed = translation.length * 2;
                        const ratio = byteUsed / entry.maxBytes;
                        const percent = Math.min(ratio * 100, 100);
                        const colorClass = ratio > 1 ? 'bg-destructive' : ratio > 0.8 ? 'bg-amber-500' : 'bg-primary';
                        return (
                          <div className="mt-1.5">
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground mb-0.5">
                              <span>{byteUsed}/{entry.maxBytes} بايت</span>
                              <span className={ratio > 1 ? 'text-destructive font-bold' : ''}>{Math.round(ratio * 100)}%</span>
                            </div>
                            <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {!isMobile && (
                      <div className="flex flex-col gap-1 items-center">
                        {isProtected && <Tag className="w-5 h-5 text-accent" />}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronRight className="w-4 h-4" /> السابق
            </Button>
            <span className="text-sm font-display">{currentPage + 1} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              التالي <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
