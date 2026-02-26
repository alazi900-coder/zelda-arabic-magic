import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { processArabicText, hasArabicChars as hasArabicCharsProcessing, hasArabicPresentationForms, removeArabicPresentationForms } from "@/lib/arabic-processing";
import { scanAllTranslations as scanMergedTranslations } from "@/lib/arabic-sentence-splitter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import { useEditorGlossary } from "@/hooks/useEditorGlossary";
import { useEditorFileIO } from "@/hooks/useEditorFileIO";
import { useEditorQuality } from "@/hooks/useEditorQuality";
import { useEditorBuild } from "@/hooks/useEditorBuild";
import { useEditorTranslation } from "@/hooks/useEditorTranslation";
import {
  ExtractedEntry, EditorState, AUTOSAVE_DELAY, AI_BATCH_SIZE, PAGE_SIZE,
  categorizeFile, categorizeBdatTable, hasArabicChars, unReverseBidi, isTechnicalText, hasTechnicalTags,
  ReviewIssue, ReviewSummary, ReviewResults, ShortSuggestion, ImproveResult,
  restoreTagsLocally,
} from "@/components/editor/types";
export function useEditorState() {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "translated" | "untranslated" | "problems" | "needs-improve" | "too-short" | "too-long" | "stuck-chars" | "mixed-lang" | "has-tags" | "damaged-tags" | "fuzzy" | "byte-overflow">("all");
  const [filterTechnical, setFilterTechnical] = useState<"all" | "only" | "exclude">("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [filterColumn, setFilterColumn] = useState<string>("all");
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewResults, setReviewResults] = useState<ReviewResults | null>(null);
  const [suggestingShort, setSuggestingShort] = useState(false);
  const [shortSuggestions, setShortSuggestions] = useState<ShortSuggestion[] | null>(null);
  const [quickReviewMode, setQuickReviewMode] = useState(false);
  const [quickReviewIndex, setQuickReviewIndex] = useState(0);
  const [showQualityStats, setShowQualityStats] = useState(false);
  const [previousTranslations, setPreviousTranslations] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [showRetranslateConfirm, setShowRetranslateConfirm] = useState(false);
  const [arabicNumerals, setArabicNumerals] = useState(false);
  const [mirrorPunctuation, setMirrorPunctuation] = useState(false);
  const [improvingTranslations, setImprovingTranslations] = useState(false);
  const [improveResults, setImproveResults] = useState<ImproveResult[] | null>(null);
  const [fixingMixed, setFixingMixed] = useState(false);
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [consistencyResults, setConsistencyResults] = useState<{ groups: any[]; aiSuggestions: { best: string; reason: string }[] } | null>(null);
  const [scanningSentences, setScanningSentences] = useState(false);
  const [sentenceSplitResults, setSentenceSplitResults] = useState<import("@/lib/arabic-sentence-splitter").SentenceSplitResult[] | null>(null);
  const [newlineCleanResults, setNewlineCleanResults] = useState<import("@/components/editor/NewlineCleanPanel").NewlineCleanResult[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [userGeminiKey, _setUserGeminiKey] = useState(() => {
    try { return localStorage.getItem('userGeminiKey') || ''; } catch { return ''; }
  });
  const setUserGeminiKey = useCallback((key: string) => {
    _setUserGeminiKey(key);
    try { if (key) localStorage.setItem('userGeminiKey', key); else localStorage.removeItem('userGeminiKey'); } catch {}
  }, []);
  const [translationProvider, _setTranslationProvider] = useState<'gemini' | 'mymemory' | 'google'>(() => {
    try { return (localStorage.getItem('translationProvider') as 'gemini' | 'mymemory' | 'google') || 'gemini'; } catch { return 'gemini'; }
  });
  const setTranslationProvider = useCallback((p: 'gemini' | 'mymemory' | 'google') => {
    _setTranslationProvider(p);
    try { localStorage.setItem('translationProvider', p); } catch {}
  }, []);
  const [myMemoryEmail, _setMyMemoryEmail] = useState(() => {
    try { return localStorage.getItem('myMemoryEmail') || ''; } catch { return ''; }
  });
  const setMyMemoryEmail = useCallback((email: string) => {
    _setMyMemoryEmail(email);
    try { if (email) localStorage.setItem('myMemoryEmail', email); else localStorage.removeItem('myMemoryEmail'); } catch {}
  }, []);
  const [myMemoryCharsUsed, setMyMemoryCharsUsed] = useState(() => {
    try {
      const stored = localStorage.getItem('myMemoryCharsUsed');
      const storedDate = localStorage.getItem('myMemoryCharsDate');
      const today = new Date().toDateString();
      if (storedDate === today && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const addMyMemoryChars = useCallback((chars: number) => {
    setMyMemoryCharsUsed(prev => {
      const newVal = prev + chars;
      try {
        localStorage.setItem('myMemoryCharsUsed', String(newVal));
        localStorage.setItem('myMemoryCharsDate', new Date().toDateString());
      } catch {}
      return newVal;
    });
  }, []);


  // === AI Request Counter (daily + monthly) ===
  const [aiRequestsToday, setAiRequestsToday] = useState(() => {
    try {
      const stored = localStorage.getItem('aiRequestsToday');
      const storedDate = localStorage.getItem('aiRequestsDate');
      const today = new Date().toDateString();
      if (storedDate === today && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const [aiRequestsMonth, setAiRequestsMonth] = useState(() => {
    try {
      const stored = localStorage.getItem('aiRequestsMonth');
      const storedMonth = localStorage.getItem('aiRequestsMonthKey');
      const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
      if (storedMonth === currentMonth && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const addAiRequest = useCallback((count: number = 1) => {
    const today = new Date().toDateString();
    const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
    setAiRequestsToday(prev => {
      const newVal = prev + count;
      try {
        localStorage.setItem('aiRequestsToday', String(newVal));
        localStorage.setItem('aiRequestsDate', today);
      } catch {}
      return newVal;
    });
    setAiRequestsMonth(prev => {
      const newVal = prev + count;
      try {
        localStorage.setItem('aiRequestsMonth', String(newVal));
        localStorage.setItem('aiRequestsMonthKey', currentMonth);
      } catch {}
      return newVal;
    });
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const forceSaveRef = useRef<() => Promise<void>>(async () => {});
  const { user } = useAuth();
  const [pendingRecovery, setPendingRecovery] = useState<{ translationCount: number; entryCount: number; lastDate?: string } | null>(null);
  const [hasStoredOriginals, setHasStoredOriginals] = useState(false);
  const [originalsDetectedAsPreviousBuild, setOriginalsDetectedAsPreviousBuild] = useState(false);

  const glossary = useEditorGlossary({
    state, setState, setLastSaved, setCloudSyncing, setCloudStatus, userId: user?.id,
  });
  const { activeGlossary, parseGlossaryMap } = glossary;

  const quality = useEditorQuality({ state });
  const { isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement, qualityStats, needsImproveCount, categoryProgress, translatedCount } = quality;

  const build = useEditorBuild({ state, setState, setLastSaved, arabicNumerals, mirrorPunctuation, gameType: "xenoblade", forceSaveRef });
  const { building, buildProgress, dismissBuildProgress, applyingArabic, buildStats, setBuildStats, buildPreview, showBuildConfirm, setShowBuildConfirm, bdatFileStats, integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity, handleApplyArabicProcessing, handlePreBuild, handleBuild, handleCheckIntegrity } = build;


  // === Protection handlers ===
  const toggleProtection = (key: string) => {
    if (!state) return;
    const newProtected = new Set(state.protectedEntries || []);
    if (newProtected.has(key)) newProtected.delete(key);
    else newProtected.add(key);
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
  };

  const toggleTechnicalBypass = (key: string) => {
    if (!state) return;
    const newBypass = new Set(state.technicalBypass || []);
    if (newBypass.has(key)) newBypass.delete(key);
    else newBypass.add(key);
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
    let count = 0, skippedProtected = 0, skippedTranslated = 0, skippedSame = 0;

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (hasArabicChars(entry.original)) {
        if (newProtected.has(key)) { skippedProtected++; continue; }
        const existing = newTranslations[key]?.trim();
        const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
        if (isAutoDetected) {
          const corrected = unReverseBidi(entry.original);
          if (corrected !== entry.original) {
            newTranslations[key] = corrected;
            newProtected.add(key);
            count++;
          } else { skippedSame++; }
        } else { skippedTranslated++; }
      }
    }

    setState(prev => prev ? { ...prev, translations: newTranslations, protectedEntries: newProtected } : null);
    const parts: string[] = [];
    if (count > 0) parts.push("تم تصحيح: " + count + " نص");
    if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
    if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
    if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);
    setLastSaved((count > 0 ? "✅ " : "⚠️ ") + parts.join(" | "));
    setTimeout(() => setLastSaved(""), 5000);
  };

  // === Load / Save ===
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

  const loadSavedState = useCallback(async () => {
    const stored = await idbGet<EditorState>("editorState");
    if (!stored) return null;
    const validKeys = new Set(stored.entries.map(e => `${e.msbtFile}:${e.index}`));
    const autoTranslations = detectPreTranslated({
      entries: stored.entries,
      translations: stored.translations || {},
      protectedEntries: new Set(),
    });

    // Build legacy key mapping for old sequential keys
    const entriesByFile: Record<string, ExtractedEntry[]> = {};
    for (const entry of stored.entries) {
      const parts = entry.msbtFile.split(':');
      const filename = parts.length >= 2 ? parts[1] : entry.msbtFile;
      if (!entriesByFile[filename]) entriesByFile[filename] = [];
      entriesByFile[filename].push(entry);
    }

    const filteredStored: Record<string, string> = {};
    let legacyConverted = 0;
    for (const [k, v] of Object.entries(stored.translations || {})) {
      if (validKeys.has(k)) {
        filteredStored[k] = v;
      } else {
        // Try legacy key conversion: "bdat-bin:filename.bdat:NUMBER"
        const parts = k.split(':');
        if (parts.length === 3 && !isNaN(parseInt(parts[2], 10))) {
          const filename = parts[1];
          const idx = parseInt(parts[2], 10);
          const fileEntries = entriesByFile[filename];
          if (fileEntries && idx < fileEntries.length) {
            const entry = fileEntries[idx];
            const newKey = `${entry.msbtFile}:${entry.index}`;
            if (!filteredStored[newKey]) {
              filteredStored[newKey] = v;
              legacyConverted++;
            }
          }
        }
      }
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
        if (hasArabicPresentationForms(entry.original)) continue;
        const existingTranslation = mergedTranslations[key]?.trim();
        if (existingTranslation && existingTranslation !== entry.original && existingTranslation !== entry.original.trim()) {
          protectedSet.add(key);
        }
      }
    }
    // === One-time auto-repair: fix ONLY entries where translation has FEWER tags than original ===
    let autoFixCount = 0;
    for (const entry of stored.entries) {
      if (!hasTechnicalTags(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = mergedTranslations[key] || '';
      if (!trans.trim()) continue;
      const origTags = entry.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
      const transTags = trans.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
      if (transTags.length < origTags.length) {
        const fixed = restoreTagsLocally(entry.original, trans);
        if (fixed !== trans) {
          mergedTranslations[key] = fixed;
          autoFixCount++;
        }
      }
    }

    const finalState: EditorState = {
      entries: stored.entries,
      translations: mergedTranslations,
      protectedEntries: protectedSet,
      technicalBypass: bypassSet,
    };

    // Save immediately if we auto-fixed or converted legacy keys
    if (autoFixCount > 0 || legacyConverted > 0) {
      await idbSet("editorState", {
        entries: finalState.entries,
        translations: finalState.translations,
        protectedEntries: Array.from(finalState.protectedEntries || []),
        technicalBypass: Array.from(finalState.technicalBypass || []),
      });
    }

    return { finalState, autoTranslations, autoFixCount, legacyConverted };
  }, [detectPreTranslated]);

  const handleRecoverSession = useCallback(async () => {
    const result = await loadSavedState();
    if (!result) return;
    const { finalState, autoTranslations, autoFixCount, legacyConverted } = result;
    setState(finalState);
    setPendingRecovery(null);

    const autoCount = Object.keys(autoTranslations).length;
    const parts: string[] = [];
    if (autoCount > 0) parts.push(`اكتشاف ${autoCount} نص معرّب مسبقاً`);
    if (autoFixCount > 0) parts.push(`🔧 إصلاح تلقائي لـ ${autoFixCount} رمز تالف`);
    if (legacyConverted > 0) parts.push(`🔄 تحويل ${legacyConverted} مفتاح قديم`);
    setLastSaved(parts.length > 0 ? `تم التحميل + ${parts.join(' + ')}` : "تم التحميل من الحفظ السابق ✅");
  }, [loadSavedState]);

  const handleStartFresh = useCallback(async () => {
    await idbSet("editorState", null);
    setPendingRecovery(null);
    // Load demo data
    const demoEntries: ExtractedEntry[] = [
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name", index: 0, label: "SYS_CharacterName[0].name", original: "Noah", maxBytes: 24 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name", index: 0, label: "SYS_CharacterName[1].name", original: "Mio", maxBytes: 18 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name", index: 0, label: "SYS_CharacterName[2].name", original: "Eunie", maxBytes: 30 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name", index: 0, label: "SYS_CharacterName[3].name", original: "Taion", maxBytes: 30 },
    ];
    setState({
      entries: demoEntries,
      translations: {},
      protectedEntries: new Set(),
      technicalBypass: new Set(),
      isDemo: true,
    });
    setLastSaved("🆕 تم البدء من جديد");
  }, []);

  useEffect(() => {
    const loadState = async () => {
      // Check if stored originals exist
      const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
      if (savedOriginals && Object.keys(savedOriginals).length > 0) {
        setHasStoredOriginals(true);
      }

      const stored = await idbGet<EditorState>("editorState");
      if (stored && stored.entries && stored.entries.length > 0) {
        const isFreshExtraction = !!(stored as any).freshExtraction;
        
        if (isFreshExtraction) {
          // Freshly extracted data — load directly, no recovery dialog
          // Clear the flag so next time recovery dialog shows normally
          const autoTranslations = detectPreTranslated({
            entries: stored.entries,
            translations: stored.translations || {},
            protectedEntries: new Set(),
          });
          const mergedTranslations = { ...autoTranslations, ...(stored.translations || {}) };
          
          // Check if originals contain presentation forms (re-extraction from built file)
          const presentationFormsCount = stored.entries.filter((e: ExtractedEntry) => hasArabicPresentationForms(e.original)).length;
          let finalEntries = stored.entries;
          
          if (presentationFormsCount > 0 && savedOriginals && Object.keys(savedOriginals).length > 0) {
            // Auto-restore originals from saved English texts
            let restoredCount = 0;
            finalEntries = stored.entries.map((entry: ExtractedEntry) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const savedOriginal = savedOriginals[key];
              if (savedOriginal && hasArabicPresentationForms(entry.original)) {
                restoredCount++;
                return { ...entry, original: savedOriginal };
              }
              return entry;
            });
            if (restoredCount > 0) {
              setOriginalsDetectedAsPreviousBuild(true);
              toast({
                title: "🔄 تم استعادة النصوص الأصلية",
                description: `تم اكتشاف ${presentationFormsCount} نص من ملف مبني سابقاً — استُعيد ${restoredCount} نص أصلي إنجليزي`,
                duration: 8000,
              });
            }
          } else if (presentationFormsCount > 0) {
            setOriginalsDetectedAsPreviousBuild(true);
            toast({
              title: "⚠️ ملف مبني سابقاً",
              description: "تم اكتشاف نصوص عربية مُشكَّلة في الأصل. لا توجد نصوص إنجليزية محفوظة للاستعادة — استخرج من الملف الأصلي أولاً ثم أعد البناء.",
              duration: 10000,
            });
          }

          setState({
            entries: finalEntries,
            translations: mergedTranslations,
            protectedEntries: new Set(),
            technicalBypass: new Set(),
            isDemo: false,
          });
          // Remove freshExtraction flag for future loads
          await idbSet("editorState", {
            entries: finalEntries,
            translations: mergedTranslations,
          });
          const autoCount = Object.keys(autoTranslations).length;
          setLastSaved(`تم تحميل ${stored.entries.length} نص مستخرج` + (autoCount > 0 ? ` + اكتشاف ${autoCount} نص معرّب` : ''));
          return;
        }
        
        // Count real translations (not auto-detected)
        const translationCount = Object.values(stored.translations || {}).filter(v => v?.trim()).length;
        if (translationCount > 0) {
          // Show recovery dialog
          setPendingRecovery({
            translationCount,
            entryCount: stored.entries.length,
          });
          return;
        }
        // Entries exist but no translations yet — load them directly
        setState({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(stored.protectedEntries || []),
          technicalBypass: new Set(stored.technicalBypass || []),
          isDemo: false,
        });
        setLastSaved("تم تحميل نصوص مستخرجة");
        return;
      }
      // No saved state — show demo
      const demoEntries: ExtractedEntry[] = [
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name", index: 0, label: "SYS_CharacterName[0].name", original: "Noah", maxBytes: 24 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name", index: 0, label: "SYS_CharacterName[1].name", original: "Mio", maxBytes: 18 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name", index: 0, label: "SYS_CharacterName[2].name", original: "Eunie", maxBytes: 30 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name", index: 0, label: "SYS_CharacterName[3].name", original: "Taion", maxBytes: 30 },
        { msbtFile: "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:0:name", index: 0, label: "SYS_ItemName[0].name", original: "Lucky Clover", maxBytes: 72 },
        { msbtFile: "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:1:name", index: 0, label: "SYS_ItemName[1].name", original: "Nopon Coin", maxBytes: 60 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:0:caption", index: 0, label: "MNU_MainMenu[0].caption", original: "Party", maxBytes: 36 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:1:caption", index: 0, label: "MNU_MainMenu[1].caption", original: "Quests", maxBytes: 42 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:2:caption", index: 0, label: "MNU_MainMenu[2].caption", original: "Map", maxBytes: 24 },
        { msbtFile: "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:0:msg", index: 0, label: "FLD_NpcTalk[0].msg", original: "\uFFF9Press \uE000\uFFFA to speak with \uFFFBNoah\uFFFC", maxBytes: 300 },
        { msbtFile: "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:1:msg", index: 0, label: "FLD_NpcTalk[1].msg", original: "You need \uFFF9\uE002 3 Nopon Coins\uFFFA to unlock this\uFFFB.", maxBytes: 350 },
        { msbtFile: "bdat-bin:QST_QuestName.bdat:QST_QuestName:0:name", index: 0, label: "QST_QuestName[0].name", original: "Beyond the Boundary", maxBytes: 120 },
        { msbtFile: "bdat-bin:QST_QuestName.bdat:QST_QuestName:1:name", index: 0, label: "QST_QuestName[1].name", original: "A Life Sent On", maxBytes: 90 },
      ];
      const demoTranslations: Record<string, string> = {
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name:0": "نوا",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name:0": "ميو",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name:0": "يوني",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name:0": "تايون",
        "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:0:name:0": "البرسيم المحظوظ",
        "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:1:name:0": "عملة النوبون",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:0:caption:0": "الفريق",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:1:caption:0": "المهام",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:2:caption:0": "الخريطة",
        "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:0:msg:0": "اضغط للتحدث مع نوا",
        "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:1:msg:0": "تحتاج 3 عملات نوبون لفتح هذا.",
        "bdat-bin:QST_QuestName.bdat:QST_QuestName:0:name:0": "ما وراء الحدود",
        "bdat-bin:QST_QuestName.bdat:QST_QuestName:1:name:0": "حياة تمضي قُدُماً",
      };
      setState({
        entries: demoEntries,
        translations: demoTranslations,
        protectedEntries: new Set(),
        technicalBypass: new Set(),
        isDemo: true,
      });
      setLastSaved("تم تحميل بيانات تجريبية");
    };
    loadState();
  }, []);

  const saveToIDB = useCallback(async (editorState: EditorState) => {
    await idbSet("editorState", {
      entries: editorState.entries,
      translations: editorState.translations,
      protectedEntries: Array.from(editorState.protectedEntries || []),
      technicalBypass: Array.from(editorState.technicalBypass || []),
    });
    setLastSaved(`آخر حفظ: ${new Date().toLocaleTimeString("ar-SA")}`);
  }, []);

  // Keep a ref to the latest state for forceSave
  const latestStateRef = useRef<EditorState | null>(null);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  // Force-save: flush pending autosave immediately (call before build)
  const forceSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const s = latestStateRef.current;
    if (s) {
      await saveToIDB(s);
      console.log('[FORCE-SAVE] Saved', Object.keys(s.translations).length, 'translation keys to IDB');
    }
  }, [saveToIDB]);

  // Wire the ref so useEditorBuild can call it
  useEffect(() => { forceSaveRef.current = forceSave; }, [forceSave]);

  useEffect(() => {
    if (!state) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToIDB(state), AUTOSAVE_DELAY);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state?.translations, saveToIDB]);

  // === Computed values ===
  const msbtFiles = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.entries.map(e => e.msbtFile));
    return Array.from(set).sort();
  }, [state?.entries]);


  // === Count entries with technical tags ===
  const tagsCount = useMemo(() => {
    if (!state) return 0;
    return state.entries.filter(e => hasTechnicalTags(e.original)).length;
  }, [state?.entries]);

  // === Count fuzzy-matched entries ===
  const fuzzyCount = useMemo(() => {
    if (!state?.fuzzyScores) return 0;
    return Object.keys(state.fuzzyScores).length;
  }, [state?.fuzzyScores]);

  // === Count entries where translation exceeds max_utf8_bytes ===
  const byteOverflowCount = useMemo(() => {
    if (!state) return 0;
    let count = 0;
    for (const e of state.entries) {
      if (e.maxBytes <= 0) continue;
      const key = `${e.msbtFile}:${e.index}`;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      const byteUsed = new TextEncoder().encode(translation).length;
      if (byteUsed > e.maxBytes) count++;
    }
    return count;
  }, [state?.entries, state?.translations]);

  // === Extract unique BDAT table and column names from labels ===
  const bdatTableNames = useMemo(() => {
    if (!state) return [];
    const set = new Set<string>();
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\./);
      if (match) set.add(match[1]);
    }
    return Array.from(set).sort();
  }, [state?.entries]);

  const bdatTableCounts = useMemo(() => {
    if (!state) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\./);
      if (match) {
        counts[match[1]] = (counts[match[1]] || 0) + 1;
      }
    }
    return counts;
  }, [state?.entries]);

  const bdatColumnNames = useMemo(() => {
    if (!state) return [];
    const set = new Set<string>();
    for (const e of state.entries) {
      const match = e.label.match(/\.([^.]+)$/);
      const tblMatch = e.label.match(/^(.+?)\[\d+\]\./);
      if (match && tblMatch) {
        if (filterTable === "all" || tblMatch[1] === filterTable) {
          set.add(match[1]);
        }
      }
    }
    return Array.from(set).sort();
  }, [state?.entries, filterTable]);

  const bdatColumnCounts = useMemo(() => {
    if (!state) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\.(.+)$/);
      if (match) {
        if (filterTable === "all" || match[1] === filterTable) {
          counts[match[2]] = (counts[match[2]] || 0) + 1;
        }
      }
    }
    return counts;
  }, [state?.entries, filterTable]);

  // === Filtered entries ===
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
      const isBdat = /^.+?\[\d+\]\./.test(e.label);
      const sourceFile = e.msbtFile.startsWith('bdat-bin:') ? e.msbtFile.split(':')[1] : e.msbtFile.startsWith('bdat:') ? e.msbtFile.slice(5) : undefined;
      const matchCategory = filterCategory.length === 0 || filterCategory.includes(isBdat ? categorizeBdatTable(e.label, sourceFile, e.original) : categorizeFile(e.msbtFile));
      const matchStatus = 
        filterStatus === "all" || 
        (filterStatus === "translated" && isTranslated) ||
        (filterStatus === "untranslated" && !isTranslated) ||
        (filterStatus === "problems" && qualityStats.problemKeys.has(key)) ||
        (filterStatus === "needs-improve" && isTranslated && needsImprovement(e, translation)) ||
        (filterStatus === "too-short" && isTranslated && isTranslationTooShort(e, translation)) ||
        (filterStatus === "too-long" && isTranslated && isTranslationTooLong(e, translation)) ||
        (filterStatus === "stuck-chars" && isTranslated && hasStuckChars(translation)) ||
        (filterStatus === "mixed-lang" && isTranslated && isMixedLanguage(translation)) ||
        (filterStatus === "has-tags" && hasTechnicalTags(e.original)) ||
        (filterStatus === "damaged-tags" && qualityStats.damagedTagKeys.has(key)) ||
        (filterStatus === "fuzzy" && !!(state.fuzzyScores?.[key])) ||
        (filterStatus === "byte-overflow" && e.maxBytes > 0 && isTranslated && new TextEncoder().encode(translation).length > e.maxBytes);
      const matchTechnical = 
        filterTechnical === "all" ||
        (filterTechnical === "only" && isTechnical) ||
        (filterTechnical === "exclude" && !isTechnical);
      // BDAT table/column filters
      const labelMatch = e.label.match(/^(.+?)\[(\d+)\]\.(.+)$/);
      const matchTable = filterTable === "all" || (labelMatch && labelMatch[1] === filterTable);
      const matchColumn = filterColumn === "all" || (labelMatch && labelMatch[3] === filterColumn);
      return matchSearch && matchFile && matchCategory && matchStatus && matchTechnical && matchTable && matchColumn;
    });
  }, [state, search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn, qualityStats.problemKeys, needsImprovement, isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage]);

  useEffect(() => { setCurrentPage(0); }, [search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);


  // === Translation handlers ===
  const updateTranslation = (key: string, value: string) => {
    if (!state) return;
    const prev = state.translations[key] || '';
    if (prev !== value) {
      setPreviousTranslations(old => ({ ...old, [key]: prev }));
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: value } } : null);
  };

  const handleUndoTranslation = (key: string) => {
    if (previousTranslations[key] !== undefined) {
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: previousTranslations[key] } } : null);
      setPreviousTranslations(old => { const copy = { ...old }; delete copy[key]; return copy; });
    }
  };

  const translation = useEditorTranslation({
    state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
    filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, userGeminiKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest,
  });
  const { translating, translatingSingle, tmStats, glossarySessionStats, handleTranslateSingle, handleAutoTranslate, handleStopTranslate, handleRetranslatePage, handleFixDamagedTags } = translation;

  // === Local (offline) fix for damaged tags — no AI needed ===
  const handleLocalFixDamagedTag = useCallback((entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = state.translations[key] || '';
    if (!translation.trim()) return;
    const fixed = restoreTagsLocally(entry.original, translation);
    if (fixed !== translation) {
      setPreviousTranslations(old => ({ ...old, [key]: translation }));
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: fixed } } : null);
    }
  }, [state, setState, setPreviousTranslations]);

  const handleLocalFixAllDamagedTags = useCallback((damagedTagKeys: Set<string>) => {
    if (!state || damagedTagKeys.size === 0) return;
    const updates: Record<string, string> = {};
    const prevTrans: Record<string, string> = {};
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!damagedTagKeys.has(key)) continue;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      const fixed = restoreTagsLocally(entry.original, translation);
      if (fixed !== translation) {
        prevTrans[key] = translation;
        updates[key] = fixed;
      }
    }
    const fixedCount = Object.keys(updates).length;
    if (fixedCount === 0) {
      setLastSaved("لا توجد رموز تالفة يمكن إصلاحها محلياً");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: "✅ تم الإصلاح المحلي", description: `تم استعادة الرموز في ${fixedCount} نص بدون ذكاء اصطناعي` });
    setLastSaved(`✅ تم إصلاح ${fixedCount} نص محلياً`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, setState, setPreviousTranslations, setLastSaved]);

  // === Accept/Reject fuzzy match handlers ===
  const handleAcceptFuzzy = useCallback((key: string) => {
    if (!state?.fuzzyScores?.[key]) return;
    const newScores = { ...state.fuzzyScores };
    delete newScores[key];
    setState(prev => prev ? { ...prev, fuzzyScores: newScores } : null);
    toast({ title: "✅ تم القبول", description: "تم اعتماد الترجمة المستوردة" });
  }, [state, setState]);

  const handleRejectFuzzy = useCallback((key: string) => {
    if (!state?.fuzzyScores?.[key]) return;
    const newScores = { ...state.fuzzyScores };
    delete newScores[key];
    const newTranslations = { ...state.translations };
    setPreviousTranslations(old => ({ ...old, [key]: newTranslations[key] || '' }));
    delete newTranslations[key];
    setState(prev => prev ? { ...prev, fuzzyScores: newScores, translations: newTranslations } : null);
    toast({ title: "❌ تم الرفض", description: "تم حذف الترجمة المستوردة" });
  }, [state, setState, setPreviousTranslations]);

  const handleAcceptAllFuzzy = useCallback(() => {
    if (!state?.fuzzyScores || Object.keys(state.fuzzyScores).length === 0) return;
    const count = Object.keys(state.fuzzyScores).length;
    setState(prev => prev ? { ...prev, fuzzyScores: {} } : null);
    toast({ title: "✅ تم قبول الكل", description: `تم اعتماد ${count} ترجمة مستوردة` });
  }, [state, setState]);

  const handleRejectAllFuzzy = useCallback(() => {
    if (!state?.fuzzyScores || Object.keys(state.fuzzyScores).length === 0) return;
    const keys = Object.keys(state.fuzzyScores);
    const newTranslations = { ...state.translations };
    const prev: Record<string, string> = {};
    for (const key of keys) {
      prev[key] = newTranslations[key] || '';
      delete newTranslations[key];
    }
    setPreviousTranslations(old => ({ ...old, ...prev }));
    setState(s => s ? { ...s, fuzzyScores: {}, translations: newTranslations } : null);
    toast({ title: "❌ تم رفض الكل", description: `تم حذف ${keys.length} ترجمة مستوردة` });
  }, [state, setState, setPreviousTranslations]);

  // === Redistribute tags at word boundaries for already-fixed translations ===
  const handleRedistributeTags = useCallback(() => {
    if (!state) return;
    const charRegexG = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
    const updates: Record<string, string> = {};
    const prevTrans: Record<string, string> = {};
    for (const entry of state.entries) {
      if (!hasTechnicalTags(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = state.translations[key] || '';
      if (!trans.trim()) continue;
      // Strip ALL tags from translation first, then let restoreTagsLocally
      // reinsert them at correct word boundaries from scratch
      const strippedTrans = trans.replace(charRegexG, '');
      if (!strippedTrans.trim()) continue;
      const fixed = restoreTagsLocally(entry.original, strippedTrans);
      if (fixed !== trans) {
        prevTrans[key] = trans;
        updates[key] = fixed;
      }
    }
    const count = Object.keys(updates).length;
    if (count === 0) {
      toast({ title: "ℹ️ لا تغيير", description: "جميع الرموز موزعة بشكل صحيح بالفعل" });
      return;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: "✅ تم إعادة التوزيع", description: `تم إعادة توزيع الرموز في ${count} نص عند حدود الكلمات` });
    setLastSaved(`✅ إعادة توزيع ${count} نص`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, setState, setPreviousTranslations, setLastSaved]);

  // === Review handlers ===
  const handleReviewTranslations = async () => {
    if (!state) return;
    setReviewing(true);
    setReviewResults(null);
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { setReviewResults({ issues: [], summary: { total: 0, errors: 0, warnings: 0, checked: 0 } }); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      setReviewResults(await response.json());
    } catch (err) {
      setTranslateProgress(`❌ خطأ في المراجعة: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally { setReviewing(false); }
  };

  const handleSuggestShorterTranslations = async () => {
    if (!state || !reviewResults) return;
    setSuggestingShort(true);
    setShortSuggestions(null);
    try {
      const reviewEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'suggest-short' }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      setShortSuggestions(data.suggestions || []);
    } catch { setShortSuggestions([]); }
    finally { setSuggestingShort(false); }
  };

  const handleApplyShorterTranslation = (key: string, suggested: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: suggested } } : null);
  };

  const handleApplyAllShorterTranslations = () => {
    if (!state || !shortSuggestions) return;
    const updates: Record<string, string> = {};
    shortSuggestions.forEach((s) => { updates[s.key] = s.suggested; });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setShortSuggestions(null);
    setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} اقتراح قصير`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  // === Fix handlers ===
  const handleFixAllStuckCharacters = () => {
    if (!state) return;
    let fixedCount = 0;
    const updates: Record<string, string> = {};
    for (const [key, translation] of Object.entries(state.translations)) {
      if (translation?.trim() && hasArabicPresentationForms(translation)) {
        const fixed = removeArabicPresentationForms(translation);
        if (fixed !== translation) { updates[key] = fixed; fixedCount++; }
      }
    }
    if (fixedCount === 0) { setLastSaved("لا توجد ترجمات بها أحرف ملتصقة"); setTimeout(() => setLastSaved(""), 3000); return; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ تم إصلاح ${fixedCount} ترجمة من الأحرف الملتصقة`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleFixMixedLanguage = async () => {
    if (!state) return;
    setFixingMixed(true);
    setTranslateProgress("🌐 جاري إصلاح النصوص المختلطة...");
    try {
      const mixedEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; const t = state.translations[key]; return t?.trim() && isMixedLanguage(t); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));
      if (mixedEntries.length === 0) { setTranslateProgress("لا توجد نصوص مختلطة للإصلاح"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const BATCH = 20;
      const allUpdates: Record<string, string> = {};
      let processed = 0;
      for (let i = 0; i < mixedEntries.length; i += BATCH) {
        const batch = mixedEntries.slice(i, i + BATCH);
        setTranslateProgress(`🌐 إصلاح النصوص المختلطة... ${processed}/${mixedEntries.length}`);
        const response = await fetch(`${supabaseUrl}/functions/v1/fix-mixed-language`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batch, glossary: activeGlossary }),
        });
        if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
        const data = await response.json();
        if (data.translations) {
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
      if (fixedCount > 0) setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...allUpdates } } : null);
      setTranslateProgress(`✅ تم إصلاح ${fixedCount} ترجمة مختلطة اللغة`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally { setFixingMixed(false); }
  };

  // === File IO (extracted to useEditorFileIO) ===
  const filterLabel = filterCategory.length > 0 ? filterCategory.join('+')
    : filterFile !== "all" ? filterFile
    : "";

  // === Clear translations (with undo) ===
  const isFilterActive = filterLabel !== "";
  const [clearUndoBackup, setClearUndoBackup] = useState<Record<string, string> | null>(null);
  const clearUndoTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClearTranslations = useCallback((scope: 'all' | 'filtered') => {
    if (!state) return;
    // Save backup for undo
    const backup = { ...state.translations };
    setClearUndoBackup(backup);
    // Clear previous undo timer
    if (clearUndoTimerRef.current) clearTimeout(clearUndoTimerRef.current);
    clearUndoTimerRef.current = setTimeout(() => setClearUndoBackup(null), 15000);

    if (scope === 'all') {
      setState(prev => prev ? { ...prev, translations: {} } : null);
      setLastSaved(`🗑️ تم مسح جميع الترجمات (${Object.keys(state.translations).length})`);
    } else {
      const keysToRemove = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      const newTranslations = { ...state.translations };
      let removed = 0;
      for (const key of keysToRemove) {
        if (newTranslations[key]?.trim()) {
          delete newTranslations[key];
          removed++;
        }
      }
      setState(prev => prev ? { ...prev, translations: newTranslations } : null);
      setLastSaved(`🗑️ تم مسح ${removed} ترجمة (${filterLabel || 'القسم المحدد'})`);
    }
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, filteredEntries, filterLabel]);

  const handleUndoClear = useCallback(() => {
    if (!clearUndoBackup) return;
    setState(prev => prev ? { ...prev, translations: clearUndoBackup } : null);
    setClearUndoBackup(null);
    if (clearUndoTimerRef.current) clearTimeout(clearUndoTimerRef.current);
    setLastSaved("↩️ تم التراجع عن المسح واستعادة الترجمات ✅");
    setTimeout(() => setLastSaved(""), 4000);
  }, [clearUndoBackup]);

  const fileIO = useEditorFileIO({ state, setState, setLastSaved, filteredEntries, filterLabel });
  const { normalizeArabicPresentationForms } = fileIO;

  // === Improve translations ===
  const handleImproveTranslations = async () => {
    if (!state) return;
    setImprovingTranslations(true); setImproveResults(null);
    try {
      const translatedEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (translatedEntries.length === 0) { setTranslateProgress("⚠️ لا توجد ترجمات لتحسينها في النطاق المحدد"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      setTranslateProgress(`جاري تحسين ${translatedEntries.length} ترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: translatedEntries, glossary: activeGlossary, action: 'improve' }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      if (improvements.length === 0) { setTranslateProgress("✅ جميع الترجمات ممتازة — لا تحتاج تحسين!"); }
      else { setTranslateProgress(`✅ تم اقتراح تحسينات لـ ${improvements.length} ترجمة`); setImproveResults(improvements); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setImprovingTranslations(false); }
  };

  const handleApplyImprovement = (key: string, improved: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: improved } } : null);
  };

  const handleApplyAllImprovements = () => {
    if (!state || !improveResults) return;
    const updates: Record<string, string> = {};
    improveResults.forEach((item) => { if (item.improvedBytes <= item.maxBytes || item.maxBytes === 0) updates[item.key] = item.improved; });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setImproveResults(null);
    setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} تحسين`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleImproveSingleTranslation = async (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = state.translations[key];
    if (!translation?.trim()) { setTranslateProgress("⚠️ لا توجد ترجمة لتحسينها"); setTimeout(() => setTranslateProgress(""), 3000); return; }
    setImprovingTranslations(true); setImproveResults(null);
    try {
      setTranslateProgress(`جاري تحسين الترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key, original: entry.original, translation, maxBytes: entry.maxBytes || 0 }], glossary: activeGlossary, action: 'improve' }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      if (improvements.length === 0) setTranslateProgress("✅ هذه الترجمة ممتازة — لا تحتاج تحسين!");
      else { setTranslateProgress(`✅ تم اقتراح تحسين لهذه الترجمة`); setImproveResults(improvements); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setImprovingTranslations(false); }
  };

  // === Consistency check ===
  const handleCheckConsistency = async () => {
    if (!state) return;
    setCheckingConsistency(true); setConsistencyResults(null);
    try {
      const translatedEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], file: e.msbtFile }));
      if (translatedEntries.length === 0) { setTranslateProgress("⚠️ لا توجد ترجمات للفحص"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      setTranslateProgress(`جاري فحص اتساق ${translatedEntries.length} ترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/check-consistency`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: translatedEntries, glossary: activeGlossary }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      if (data.groups?.length === 0) { setTranslateProgress("✅ جميع المصطلحات متسقة — لا توجد تناقضات!"); }
      else { setTranslateProgress(`⚠️ تم اكتشاف ${data.groups?.length || 0} مصطلح غير متسق`); setConsistencyResults(data); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في فحص الاتساق: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setCheckingConsistency(false); }
  };

  const handleApplyConsistencyFix = (groupIndex: number, bestTranslation: string) => {
    if (!consistencyResults || !state) return;
    const group = consistencyResults.groups[groupIndex];
    if (!group) return;
    const updates: Record<string, string> = {};
    for (const v of group.variants) { updates[v.key] = bestTranslation; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    // Remove this group from results
    const newGroups = consistencyResults.groups.filter((_, i) => i !== groupIndex);
    const newSuggestions = consistencyResults.aiSuggestions.filter((_, i) => i !== groupIndex);
    setConsistencyResults({ groups: newGroups, aiSuggestions: newSuggestions });
    setLastSaved(`✅ تم توحيد ترجمة "${group.term}" في ${group.variants.length} موضع`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleApplyAllConsistencyFixes = () => {
    if (!consistencyResults || !state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    consistencyResults.groups.forEach((group, i) => {
      const best = consistencyResults.aiSuggestions[i]?.best;
      if (best) {
        for (const v of group.variants) { updates[v.key] = best; }
        count++;
      }
    });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setConsistencyResults(null);
    setLastSaved(`✅ تم توحيد ${count} مصطلح تلقائياً`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  // === Cloud save/load ===
  const handleCloudSave = async () => {
    if (!state || !user) return;
    setCloudSyncing(true); setCloudStatus("جاري الحفظ في السحابة...");
    try {
      const translated = Object.values(state.translations).filter(v => v.trim() !== '').length;
      const { data: existing } = await supabase.from('translation_projects').select('id').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('translation_projects').update({ translations: state.translations, entry_count: state.entries.length, translated_count: translated }).eq('id', existing[0].id);
      } else {
        await supabase.from('translation_projects').insert({ user_id: user.id, translations: state.translations, entry_count: state.entries.length, translated_count: translated });
      }
      setCloudStatus("☁️ تم الحفظ في السحابة بنجاح!");
    } catch (err) { setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في الحفظ'}`); }
    finally { setCloudSyncing(false); setTimeout(() => setCloudStatus(""), 4000); }
  };

  const handleCloudLoad = async () => {
    if (!user) return;
    setCloudSyncing(true); setCloudStatus("جاري التحميل من السحابة...");
    try {
      const { data, error } = await supabase.from('translation_projects').select('translations').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { setCloudStatus("لا توجد ترجمات محفوظة في السحابة"); setTimeout(() => setCloudStatus(""), 3000); return; }
      const cloudTranslations = data.translations as Record<string, string>;
      setState(prev => { if (!prev) return null; return { ...prev, translations: { ...prev.translations, ...cloudTranslations } }; });
      setCloudStatus(`☁️ تم تحميل ${Object.keys(cloudTranslations).length} ترجمة من السحابة`);
    } catch (err) { setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في التحميل'}`); }
    finally { setCloudSyncing(false); setTimeout(() => setCloudStatus(""), 4000); }
  };


  const loadDemoBdatData = useCallback(() => {
    const tableData: { table: string; cols: string[]; rows: number; texts: Record<string, string[]> }[] = [
      { table: "MNU_Msg", cols: ["Label", "Help"], rows: 12, texts: {
        Label: ["Confirm", "Cancel", "OK", "Back", "Next", "Save", "Load", "Options", "Quit", "Resume", "Retry", "Settings"],
        Help: ["Press A to confirm.", "Press B to cancel.", "Select an option.", "Open the menu.", "Change settings."],
      }},
      { table: "CHR_Dr", cols: ["Name", "Title", "Description"], rows: 10, texts: {
        Name: ["Noah", "Mio", "Eunie", "Taion", "Lanz", "Sena", "Riku", "Manana", "Ashera", "Zeon"],
        Title: ["Off-Seer of Keves", "Off-Seer of Agnus", "Healer of Colony 9", "Tactician of Agnus", "Defender of Colony 9"],
        Description: ["A soldier from Keves who plays the flute.", "A soldier from Agnus who plays the flute.", "Noah's childhood friend."],
      }},
      { table: "BTL_Arts", cols: ["Name", "Description"], rows: 15, texts: {
        Name: ["Sword Strike", "Air Slash", "Edge Thrust", "Shadow Eye", "Starfall", "Ground Beat", "Mega Spinning Edge", "Wide Slash", "Power Smash", "Butterfly Blade"],
        Description: ["A basic attack dealing physical damage.", "A wide-range slash hitting multiple enemies.", "An accurate thrust with high critical rate."],
      }},
      { table: "ENE_Monster", cols: ["Name", "Location"], rows: 8, texts: {
        Name: ["Territorial Rotbart", "Gogol", "Krabble", "Bunnit", "Feris", "Tirkin", "Sauros", "Igna"],
        Location: ["Aetia Region", "Fornis Region", "Pentelas Region", "Cadensia Region"],
      }},
      { table: "ITM_Equipment", cols: ["Name", "Effect"], rows: 10, texts: {
        Name: ["Steel Blade", "Silver Shield", "Power Ring", "Speed Boots", "Guard Crest", "Attack Charm", "HP Bangle", "Evasion Gem", "Critical Scope", "Auto-Heal Ring"],
        Effect: ["Increases attack power by 10%.", "Reduces damage taken by 15%.", "Boosts movement speed.", "Restores HP gradually."],
      }},
      { table: "QST_MainStory", cols: ["Title", "Objective"], rows: 8, texts: {
        Title: ["The Vanishing Flame", "Path to Swordmarch", "Colony 4 Liberation", "The Cloudkeep", "Origin", "The Last Chapter", "Bonds of Friendship", "A New Future"],
        Objective: ["Head to the battlefield.", "Defeat the enemy commander.", "Liberate Colony 4.", "Reach the top of Cloudkeep."],
      }},
      { table: "FLD_MapList", cols: ["Name", "Region"], rows: 8, texts: {
        Name: ["Colony 9", "Millick Meadows", "Alfeto Valley", "Great Cotte Falls", "Maktha Wildwood", "Erythia Sea", "Keves Castle", "Origin"],
        Region: ["Aetia Region", "Fornis Region", "Pentelas Region", "Cadensia Region"],
      }},
      { table: "SKL_Skill", cols: ["Name", "Description"], rows: 8, texts: {
        Name: ["HP Up", "Strength Up", "Agility Up", "Critical Up", "Ether Defense Up", "Arts Heal", "Power Charge", "Quick Step"],
        Description: ["Increases max HP by 10%.", "Increases physical attack.", "Increases agility.", "Increases critical hit rate."],
      }},
      { table: "GEM_Gem", cols: ["Name", "Effect"], rows: 6, texts: {
        Name: ["Steel Protection", "Steady Striker", "Swelling Scourge", "Disperse Bloodlust", "Lifebearer", "Ultimate Counter"],
        Effect: ["Reduces damage taken.", "Increases auto-attack speed.", "Boosts damage over time.", "Distributes aggro."],
      }},
      { table: "JOB_Class", cols: ["Name", "Role", "Description"], rows: 6, texts: {
        Name: ["Swordfighter", "Zephyr", "Medic Gunner", "Tactician", "Heavy Guard", "Martial Artist"],
        Role: ["Attacker", "Defender", "Healer", "Attacker", "Defender", "Attacker"],
        Description: ["A balanced attacker class.", "An agile defender class.", "A healing specialist.", "A tactical support class."],
      }},
      { table: "TIP_Tutorial", cols: ["Title", "Content"], rows: 6, texts: {
        Title: ["Basic Controls", "Combat Basics", "Chain Attacks", "Interlinks", "Gem Crafting", "Class Change"],
        Content: ["Use the left stick to move.", "Press A to auto-attack.", "Fill the chain gauge to unleash.", "Press up on D-pad to interlink."],
      }},
      { table: "MSG_NpcTalk", cols: ["Speaker", "Dialogue"], rows: 10, texts: {
        Speaker: ["Village Elder", "Merchant", "Guard", "Child", "Traveler", "Blacksmith", "Innkeeper", "Scholar", "Farmer", "Soldier"],
        Dialogue: ["Welcome, traveler.", "Care to see my wares?", "Halt! State your business.", "Wanna play?", "The road ahead is dangerous."],
      }},
      // Column-name categorization test entries (generic table prefixes)
      { table: "RSC_Data", cols: ["WindowTitle", "BtnLabel"], rows: 3, texts: {
        WindowTitle: ["Inventory Window", "Status Window", "Map Window"],
        BtnLabel: ["Open", "Close", "Toggle"],
      }},
      { table: "DAT_Info", cols: ["TaskSummary", "QuestPurpose"], rows: 3, texts: {
        TaskSummary: ["Defeat 5 monsters", "Collect 3 herbs", "Escort the NPC"],
        QuestPurpose: ["Help the colony", "Gather supplies", "Defend the camp"],
      }},
      { table: "WLD_Geo", cols: ["LandmarkName", "ColonyArea"], rows: 3, texts: {
        LandmarkName: ["Great Cotte Falls", "Alfeto Valley", "Maktha Wildwood"],
        ColonyArea: ["Colony 9 Area", "Colony 4 Area", "Colony Gamma Area"],
      }},
      { table: "CFG_Option", cols: ["VoiceSetting", "DisplayMode"], rows: 3, texts: {
        VoiceSetting: ["Japanese Voice", "English Voice", "No Voice"],
        DisplayMode: ["Full Screen", "Windowed", "Borderless"],
      }},
    ];
    const entries: ExtractedEntry[] = [];
    let idx = 0;
    for (const { table, cols, rows, texts } of tableData) {
      for (let row = 0; row < rows; row++) {
        for (const col of cols) {
          const t = texts[col] || ["Sample text"];
          entries.push({ msbtFile: "bdat", index: idx++, label: `${table}[${row}].${col}`, original: t[row % t.length], maxBytes: 0 });
        }
      }
    }
    setState({ entries, translations: {}, protectedEntries: new Set(), technicalBypass: new Set() });
    setLastSaved("✅ تم تحميل بيانات BDAT تجريبية");
    setTimeout(() => setLastSaved(""), 3000);
  }, []);

  const handleBulkReplace = useCallback((replacements: Record<string, string>) => {
    if (!state) return;
    const prev: Record<string, string> = {};
    for (const key of Object.keys(replacements)) {
      prev[key] = state.translations[key] || '';
    }
    setPreviousTranslations(p => ({ ...p, ...prev }));
    setState(s => s ? { ...s, translations: { ...s.translations, ...replacements } } : null);
    setLastSaved(`✅ تم استبدال ${Object.keys(replacements).length} نص`);
    setTimeout(() => setLastSaved(""), 3000);
  }, [state]);




  // === Restore original English texts from IndexedDB ===
  const handleRestoreOriginals = useCallback(async () => {
    if (!state) return;
    const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
    if (!savedOriginals || Object.keys(savedOriginals).length === 0) {
      setLastSaved("⚠️ لا توجد نصوص أصلية محفوظة");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    let restoredCount = 0;
    const newEntries = state.entries.map(entry => {
      const key = `${entry.msbtFile}:${entry.index}`;
      const savedOriginal = savedOriginals[key];
      if (savedOriginal && savedOriginal !== entry.original) {
        restoredCount++;
        return { ...entry, original: savedOriginal };
      }
      return entry;
    });
    if (restoredCount > 0) {
      setState(prev => prev ? { ...prev, entries: newEntries } : null);
      setOriginalsDetectedAsPreviousBuild(false);
      setLastSaved(`✅ تم استعادة ${restoredCount} نص أصلي إنجليزي`);
    } else {
      setLastSaved("ℹ️ النصوص الأصلية متطابقة — لا حاجة للاستعادة");
    }
    setTimeout(() => setLastSaved(""), 5000);
  }, [state]);

  // === Remove all Arabic diacritics (tashkeel) from translations ===
  const handleRemoveAllDiacritics = useCallback(() => {
    if (!state) return;
    const diacriticsRegex = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
    const newTranslations = { ...state.translations };
    let count = 0;
    for (const [key, val] of Object.entries(newTranslations)) {
      if (val && diacriticsRegex.test(val)) {
        newTranslations[key] = val.replace(diacriticsRegex, '');
        count++;
      }
    }
    if (count > 0) {
      setState(prev => prev ? { ...prev, translations: newTranslations } : null);
      setLastSaved(`✅ تم إزالة التشكيلات من ${count} ترجمة`);
    } else {
      setLastSaved("ℹ️ لا توجد تشكيلات لإزالتها");
    }
    setTimeout(() => setLastSaved(""), 4000);
  }, [state]);

  // === Newline & Symbol Clean (remove \n, \., \:, \-, \\, and standalone n . \ : -) ===
  const handleScanNewlines = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineCleanPanel").NewlineCleanResult[] = [];
    // Pattern: backslash+char combos OR standalone stray symbols (n . \ : -)
    // Standalone n only when surrounded by spaces or at start/end
    const cleanupPattern = /\\[n.:\-\\r]|(?<=\s|^)[n.:\\\-](?=\s|$)/g;
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      if (cleanupPattern.test(value)) {
        cleanupPattern.lastIndex = 0; // reset regex
        const count = (value.match(cleanupPattern) || []).length;
        const after = value.replace(cleanupPattern, ' ').replace(/ {2,}/g, ' ').trim();
        if (after !== value) {
          results.push({ key, before: value, after, count, status: 'pending' });
        }
        cleanupPattern.lastIndex = 0;
      }
    }
    setNewlineCleanResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لم يتم اكتشاف أي رموز غير مرغوبة في الترجمات");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state]);

  const handleApplyNewlineClean = useCallback((key: string) => {
    if (!state || !newlineCleanResults) return;
    const item = newlineCleanResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNewlineCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, newlineCleanResults]);

  const handleRejectNewlineClean = useCallback((key: string) => {
    setNewlineCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllNewlineCleans = useCallback(() => {
    if (!state || !newlineCleanResults) return;
    const pending = newlineCleanResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNewlineCleanResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تنظيف ${pending.length} ترجمة من الرموز غير المرغوبة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, newlineCleanResults]);

  // === Sentence Splitter ===
  const handleScanMergedSentences = useCallback(() => {
    if (!state) return;
    setScanningSentences(true);
    const results = scanMergedTranslations(state.translations, state.entries);
    setSentenceSplitResults(results);
    setSentenceSplitResults(results);
    setScanningSentences(false);
    if (results.length === 0) {
      setLastSaved("✅ لم يتم اكتشاف جمل مندمجة");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state]);

  const handleApplySentenceSplit = useCallback((key: string) => {
    if (!state || !sentenceSplitResults) return;
    const item = sentenceSplitResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setSentenceSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, sentenceSplitResults]);

  const handleRejectSentenceSplit = useCallback((key: string) => {
    setSentenceSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllSentenceSplits = useCallback(() => {
    if (!state || !sentenceSplitResults) return;
    const pending = sentenceSplitResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setSentenceSplitResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تطبيق فصل ${pending.length} جملة مندمجة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, sentenceSplitResults]);

  return {
    // State
    state, search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn, showFindReplace, userGeminiKey, translationProvider, myMemoryEmail, myMemoryCharsUsed, aiRequestsToday, aiRequestsMonth,
    pendingRecovery, handleRecoverSession, handleStartFresh,
    hasStoredOriginals, originalsDetectedAsPreviousBuild,
    building, buildProgress, dismissBuildProgress, translating, translateProgress,
    lastSaved, cloudSyncing, cloudStatus,
    reviewing, reviewResults, tmStats, glossarySessionStats,
    suggestingShort, shortSuggestions,
    quickReviewMode, quickReviewIndex,
    showQualityStats, translatingSingle,
    previousTranslations, currentPage,
    showRetranslateConfirm, arabicNumerals, mirrorPunctuation,
    applyingArabic, improvingTranslations, improveResults,
    fixingMixed, filtersOpen, buildStats, buildPreview, showBuildConfirm, bdatFileStats,
    checkingConsistency, consistencyResults,
    scanningSentences, sentenceSplitResults, newlineCleanResults,
    categoryProgress, qualityStats, needsImproveCount, translatedCount, tagsCount, fuzzyCount, byteOverflowCount,
    bdatTableNames, bdatColumnNames, bdatTableCounts, bdatColumnCounts,
    ...glossary,
    msbtFiles, filteredEntries, paginatedEntries, totalPages,
    user,

    // Setters
    setSearch, setFilterFile, setFilterCategory, setFilterStatus, setFilterTechnical, setFilterTable, setFilterColumn,
    setFiltersOpen, setShowQualityStats, setQuickReviewMode, setQuickReviewIndex, setShowFindReplace,
    setCurrentPage, setShowRetranslateConfirm,
    setArabicNumerals, setMirrorPunctuation, setUserGeminiKey, setTranslationProvider, setMyMemoryEmail,
    setReviewResults, setShortSuggestions, setImproveResults, setBuildStats, setShowBuildConfirm,
    setConsistencyResults, setSentenceSplitResults, setNewlineCleanResults,

    // Handlers
    toggleProtection, toggleTechnicalBypass,
    handleProtectAllArabic, handleFixReversed, handleFixAllReversed,
    updateTranslation, handleUndoTranslation,
    handleTranslateSingle, handleAutoTranslate, handleStopTranslate,
    handleRetranslatePage, handleFixDamagedTags, handleLocalFixDamagedTag, handleLocalFixAllDamagedTags, handleRedistributeTags, handleReviewTranslations,
    handleSuggestShorterTranslations, handleApplyShorterTranslation, handleApplyAllShorterTranslations,
    handleFixAllStuckCharacters, handleFixMixedLanguage,
    ...fileIO,
    handleImproveTranslations, handleApplyImprovement, handleApplyAllImprovements,
    handleImproveSingleTranslation,
    handleCheckConsistency, handleApplyConsistencyFix, handleApplyAllConsistencyFixes,
    handleAcceptFuzzy, handleRejectFuzzy, handleAcceptAllFuzzy, handleRejectAllFuzzy,
    handleCloudSave, handleCloudLoad,
    handleApplyArabicProcessing, handlePreBuild, handleBuild, handleBulkReplace, loadDemoBdatData, handleCheckIntegrity, handleRestoreOriginals, handleRemoveAllDiacritics,
    handleScanMergedSentences, handleApplySentenceSplit, handleRejectSentenceSplit, handleApplyAllSentenceSplits,
    handleScanNewlines, handleApplyNewlineClean, handleRejectNewlineClean, handleApplyAllNewlineCleans,
    handleClearTranslations, handleUndoClear, clearUndoBackup, isFilterActive,
    integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity,

    // Quality helpers
    isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement,
  };
}
