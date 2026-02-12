import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Download, Search, FileText, Loader2, Filter, Sparkles, Save, Tag, Upload, FileDown, Cloud, CloudUpload, LogIn, BookOpen, AlertTriangle, Eye, EyeOff, RotateCcw, CheckCircle2, ShieldCheck, ChevronLeft, ChevronRight, Check, X, BarChart3 } from "lucide-react";
import ZeldaDialoguePreview from "@/components/ZeldaDialoguePreview";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const [filterStatus, setFilterStatus] = useState<"all" | "translated" | "untranslated" | "problems">("all");
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
  
  const navigate = useNavigate();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

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
    const arabicRegex = /[\u0600-\u06FF]/;
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

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const hasTranslation = newTranslations[key]?.trim();
      if (!hasTranslation && hasArabicChars(entry.original)) {
        newTranslations[key] = unReverseBidi(entry.original);
        newProtected.add(key);
        count++;
      }
    }

    setState(prev => prev ? {
      ...prev,
      translations: newTranslations,
      protectedEntries: newProtected,
    } : null);
    setLastSaved(`✅ تم تصحيح ${count} نص عربي معكوس`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const detectPreTranslated = useCallback((editorState: EditorState): Record<string, string> => {
    const arabicRegex = /[\u0600-\u06FF]/;
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
        const autoTranslations = detectPreTranslated({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(),
        });
        const mergedTranslations = { ...autoTranslations, ...stored.translations };
        
        const protectedSet = new Set<string>(
          Array.isArray(stored.protectedEntries) ? (stored.protectedEntries as string[]) : []
        );

        const bypassSet = new Set<string>(
          Array.isArray((stored as any).technicalBypass) ? ((stored as any).technicalBypass as string[]) : []
        );

        const arabicRegex = /[\u0600-\u06FF]/;
        for (const entry of stored.entries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          if (arabicRegex.test(entry.original)) {
            protectedSet.add(key);
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

  const categoryProgress = useMemo(() => {
    if (!state) return {};
    const progress: Record<string, { translated: number; total: number }> = {};
    
    for (const cat of FILE_CATEGORIES) {
      progress[cat.id] = { translated: 0, total: 0 };
    }
    progress["other"] = { translated: 0, total: 0 };

    for (const e of state.entries) {
      const cat = categorizeFile(e.msbtFile);
      const key = `${e.msbtFile}:${e.index}`;
      const isTranslated = state.translations[key] && state.translations[key].trim() !== '';
      
      progress[cat].total += 1;
      if (isTranslated) progress[cat].translated += 1;
    }
    
    return progress;
  }, [state?.entries, state?.translations]);

  // Quality stats computation
  const qualityStats = useMemo(() => {
    if (!state) return { tooLong: 0, nearLimit: 0, missingTags: 0, placeholderMismatch: 0, total: 0, problemKeys: new Set<string>() };
    
    let tooLong = 0, nearLimit = 0, missingTags = 0, placeholderMismatch = 0;
    const problemKeys = new Set<string>();

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key]?.trim();
      if (!translation) continue;

      // Byte limit check
      if (entry.maxBytes > 0) {
        const bytes = translation.length * 2;
        if (bytes > entry.maxBytes) { tooLong++; problemKeys.add(key); }
        else if (bytes / entry.maxBytes > 0.8) { nearLimit++; problemKeys.add(key); }
      }

      // Missing tags
      const origTags = entry.original.match(/\[[^\]]*\]/g) || [];
      for (const tag of origTags) {
        if (!translation.includes(tag)) { missingTags++; problemKeys.add(key); break; }
      }

      // Placeholder mismatch
      const origPh = (entry.original.match(/\uFFFC/g) || []).length;
      const transPh = (translation.match(/\uFFFC/g) || []).length;
      if (origPh !== transPh) { placeholderMismatch++; problemKeys.add(key); }
    }

    return { tooLong, nearLimit, missingTags, placeholderMismatch, total: problemKeys.size, problemKeys };
  }, [state?.entries, state?.translations]);

  const filteredEntries = useMemo(() => {
    if (!state) return [];
    return state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const isTranslated = state.translations[key] && state.translations[key].trim() !== '';
      const isTechnical = isTechnicalText(e.original);
      
      const matchSearch = !search ||
        e.original.toLowerCase().includes(search.toLowerCase()) ||
        e.label.includes(search) ||
        (state.translations[key] || '').includes(search);
      const matchFile = filterFile === "all" || e.msbtFile === filterFile;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      const matchStatus = 
        filterStatus === "all" || 
        (filterStatus === "translated" && isTranslated) ||
        (filterStatus === "untranslated" && !isTranslated) ||
        (filterStatus === "problems" && qualityStats.problemKeys.has(key));
      const matchTechnical = 
        filterTechnical === "all" ||
        (filterTechnical === "only" && isTechnical) ||
        (filterTechnical === "exclude" && !isTechnical);
      
      return matchSearch && matchFile && matchCategory && matchStatus && matchTechnical;
    });
  }, [state, search, filterFile, filterCategory, filterStatus, filterTechnical, qualityStats.problemKeys]);

  const updateTranslation = (key: string, value: string) => {
    if (!state) return;
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: value },
    } : null);
  };

  const translatedCount = useMemo(() => {
    if (!state) return 0;
    return Object.values(state.translations).filter(v => v.trim() !== '').length;
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

  const handleExportTranslations = () => {
    if (!state) return;
    const data = JSON.stringify(state.translations, null, 2);
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
        setState(prev => {
          if (!prev) return null;
          return { ...prev, translations: { ...prev.translations, ...imported } };
        });
        setLastSaved(`✅ تم استيراد ${Object.keys(imported).length} ترجمة`);
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

  const handleBuild = async () => {
    if (!state) return;

    const langBuf = await idbGet<ArrayBuffer>("editorLangFile");
    const dictBuf = await idbGet<ArrayBuffer>("editorDictFile");
    const langFileName = (await idbGet<string>("editorLangFileName")) || "output.zs";

    if (!langBuf || !dictBuf) {
      alert("يجب إعادة رفع الملفات. يرجى العودة لصفحة المعالجة.");
      navigate("/process");
      return;
    }

    setBuilding(true);
    setBuildProgress("تجهيز الترجمات...");

    try {
      const formData = new FormData();
      formData.append("langFile", new File([new Uint8Array(langBuf)], langFileName));
      formData.append("dictFile", new File([new Uint8Array(dictBuf)], (await idbGet<string>("editorDictFileName")) || "ZsDic.pack.zs"));

      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.translations)) {
        if (v.trim()) nonEmptyTranslations[k] = v;
      }
      formData.append("translations", JSON.stringify(nonEmptyTranslations));
      formData.append("protectedEntries", JSON.stringify(Array.from(state.protectedEntries || [])));

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
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <Link to="/process" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للمعالجة
        </Link>

        <h1 className="text-3xl font-display font-bold mb-2">محرر الترجمة ✍️</h1>
        <p className="text-muted-foreground mb-6 font-body">
          عدّل النصوص العربية يدوياً أو استخدم الترجمة التلقائية بالذكاء الاصطناعي
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-lg font-display font-bold">{state.entries.length}</p>
                <p className="text-xs text-muted-foreground">نص إجمالي</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-secondary" />
              <div>
                <p className="text-lg font-display font-bold">{translatedCount}</p>
                <p className="text-xs text-muted-foreground">مترجم</p>
              </div>
            </CardContent>
          </Card>
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

          {translating ? (
            <Button
              size="lg"
              variant="destructive"
              onClick={handleStopTranslate}
              className="font-display font-bold px-6"
            >
              <><Loader2 className="w-4 h-4 animate-spin" /> إيقاف الترجمة ⏹️</>
            </Button>
          ) : (
            <Button
              size="lg"
              variant="default"
              onClick={handleAutoTranslate}
              disabled={translating}
              className="font-display font-bold px-6"
            >
              <Sparkles className="w-4 h-4" /> ترجمة تلقائية 🤖
            </Button>
          )}
        </div>

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

        {!user && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة
            </CardContent>
          </Card>
        )}

        {state && (
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-lg border border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {FILE_CATEGORIES.map(cat => {
                const prog = categoryProgress[cat.id];
                const pct = prog?.total ? Math.round((prog.translated / prog.total) * 100) : 0;
                return (
                  <div key={cat.id} className="p-3 bg-card rounded border border-border/50">
                    <p className="text-sm font-bold mb-2">{cat.emoji} {cat.label}</p>
                    <Progress value={pct} className="h-2 mb-1" />
                    <p className="text-xs text-muted-foreground text-center">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-6 p-4 bg-card rounded border border-border flex flex-wrap gap-3 items-center">
          <Input
            placeholder="ابحث عن نصوص..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] font-body"
          />
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
        </div>

        {/* Cloud Actions */}
        {user && (
          <div className="mb-6 flex gap-3 flex-wrap">
            <Button
              size="lg"
              variant="outline"
              onClick={handleCloudSave}
              disabled={cloudSyncing || translatedCount === 0}
              className="font-display font-bold px-4 border-primary/30"
            >
              <CloudUpload className="w-4 h-4" /> حفظ في السحابة
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCloudLoad}
              disabled={cloudSyncing}
              className="font-display font-bold px-4 border-primary/30"
            >
              <Cloud className="w-4 h-4" /> تحميل من السحابة
            </Button>
          </div>
        )}

        {/* Export/Import Actions */}
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
        </div>

        {/* Build Button */}
        <Button
          size="lg"
          onClick={handleBuild}
          disabled={building}
          className="w-full font-display font-bold mb-6"
        >
          {building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
          بناء الملف النهائي
        </Button>

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
                      <input
                        type="text"
                        value={translation}
                        onChange={(e) => updateTranslation(key, e.target.value)}
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

        {/* Entries List */}
        <div className="space-y-2">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد نصوص مطابقة</p>
          ) : (
            filteredEntries.map((entry, idx) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const translation = state?.translations[key] || '';
              const isProtected = state?.protectedEntries?.has(key);
              const isTech = isTechnicalText(entry.original);
              const hasProblem = qualityStats.problemKeys.has(key);
              
              return (
                <Card key={idx} className={`p-4 border-border/50 hover:border-border transition-colors ${hasProblem ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">{entry.msbtFile} • {entry.label}</p>
                      <p className="font-body text-sm mb-2">{entry.original}</p>
                      {isTech && (
                        <p className="text-xs text-accent mb-2">⚠️ نص تقني - تحتاج حذر في الترجمة</p>
                      )}
                      {hasProblem && (
                        <p className="text-xs text-destructive mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> يحتاج مراجعة
                        </p>
                      )}
                      {!translation && hasArabicChars(entry.original) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFixReversed(entry)}
                          className="text-xs text-accent mb-2 h-7 px-2"
                        >
                          <RotateCcw className="w-3 h-3" /> تصحيح المعكوس
                        </Button>
                      )}
                      <input
                        type="text"
                        value={translation}
                        onChange={(e) => updateTranslation(key, e.target.value)}
                        placeholder="أدخل الترجمة..."
                        className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
                      />
                    </div>
                    <div className="flex gap-1">
                      {isProtected && <Tag className="w-5 h-5 text-accent" />}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Editor;
