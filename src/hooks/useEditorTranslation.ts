import { useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  ExtractedEntry, EditorState, AI_BATCH_SIZE, PAGE_SIZE,
  categorizeFile, categorizeBdatTable, isTechnicalText, hasTechnicalTags,
} from "@/components/editor/types";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { fixTagBracketsStrict } from "@/lib/tag-bracket-fix";

interface UseEditorTranslationProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  setTranslateProgress: (msg: string) => void;
  setPreviousTranslations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTranslation: (key: string, value: string) => void;
  filterCategory: string[];
  activeGlossary: string;
  parseGlossaryMap: (glossary: string) => Map<string, string>;
  paginatedEntries: ExtractedEntry[];
  filteredEntries: ExtractedEntry[];
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  userGeminiKey: string;
  translationProvider: 'gemini' | 'mymemory' | 'google';
  myMemoryEmail: string;
  addMyMemoryChars: (chars: number) => void;
  addAiRequest: (count?: number) => void;
}

export function useEditorTranslation({
  state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
  filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, filteredEntries, totalPages, setCurrentPage, userGeminiKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest,
}: UseEditorTranslationProps) {
  const [translating, setTranslating] = useState(false);
  const [translatingSingle, setTranslatingSingle] = useState<string | null>(null);
  const [tmStats, setTmStats] = useState<{ reused: number; sent: number } | null>(null);
  const [glossarySessionStats, setGlossarySessionStats] = useState<{
    directMatches: number; lockedTerms: number; contextTerms: number;
    batchesCompleted: number; totalBatches: number; textsTranslated: number; freeTranslations: number;
  }>({ directMatches: 0, lockedTerms: 0, contextTerms: 0, batchesCompleted: 0, totalBatches: 0, textsTranslated: 0, freeTranslations: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Page translation compare state
  const [pendingPageTranslations, setPendingPageTranslations] = useState<Record<string, string> | null>(null);
  const [oldPageTranslations, setOldPageTranslations] = useState<Record<string, string>>({});
  const [pageTranslationOriginals, setPageTranslationOriginals] = useState<Record<string, string>>({});
  const [showPageCompare, setShowPageCompare] = useState(false);

  const applyPendingTranslations = (selectedKeys?: Set<string>) => {
    if (!state || !pendingPageTranslations) return;
    const toApply: Record<string, string> = {};
    for (const [key, val] of Object.entries(pendingPageTranslations)) {
      if (!selectedKeys || selectedKeys.has(key)) {
        toApply[key] = val;
      }
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...toApply } } : null);
    setPendingPageTranslations(null);
    setOldPageTranslations({});
    setPageTranslationOriginals({});
    setShowPageCompare(false);
  };

  const discardPendingTranslations = () => {
    setPendingPageTranslations(null);
    setOldPageTranslations({});
    setPageTranslationOriginals({});
    setShowPageCompare(false);
  };

  /** Auto-fix: restore protected tags, fix broken brackets, then restore any remaining missing tags */
  const autoFixTags = (translations: Record<string, string>, protectedMap?: Map<string, ReturnType<typeof protectTags>>): Record<string, string> => {
    if (!state) return translations;
    const fixed: Record<string, string> = {};
    for (const [key, trans] of Object.entries(translations)) {
      let result = trans;
      // First restore protected tag placeholders
      const p = protectedMap?.get(key);
      if (p && p.tags.length > 0) {
        result = restoreTags(result, p.tags);
      }
      // Then restore any remaining missing tags
      const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
      if (entry && hasTechnicalTags(entry.original)) {
        result = restoreTagsLocally(entry.original, result);
        // Fix broken brackets around [Tag:Value] tags
        result = autoFixTagBrackets(entry.original, result);
      }
      fixed[key] = result;
    }
    return fixed;
  };

  /** Fix broken/reversed/orphan brackets around [Tag:Value] technical tags */
  const autoFixTagBrackets = (original: string, translation: string): string => {
    return fixTagBracketsStrict(original, translation).text;
  };

  const handleTranslateSingle = async (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    setTranslatingSingle(key);
    try {
      const glossaryMap = parseGlossaryMap(activeGlossary);
      const originalNorm = entry.original.trim().toLowerCase();
      const glossaryHit = glossaryMap.get(originalNorm);
      if (glossaryHit) {
        updateTranslation(key, glossaryHit);
        setLastSaved(`📖 ترجمة مباشرة من القاموس (بدون ذكاء اصطناعي)`);
        setTimeout(() => setLastSaved(""), 3000);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const idx = state.entries.indexOf(entry);
      const contextEntries = [-2, -1, 1, 2]
        .map(offset => state.entries[idx + offset])
        .filter(n => n && state.translations[`${n.msbtFile}:${n.index}`]?.trim())
        .map(n => ({ key: `${n.msbtFile}:${n.index}`, original: n.original, translation: state.translations[`${n.msbtFile}:${n.index}`] }));

      // Protect tags before sending to AI
      const protected_ = protectTags(entry.original);
      const textToSend = protected_.tags.length > 0 ? protected_.cleanText : entry.original;

      const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key, original: textToSend }], glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries : undefined, userApiKey: userGeminiKey || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      addAiRequest(1);
      if (data.charsUsed) addMyMemoryChars(data.charsUsed);
      if (data.translations && data.translations[key]) {
        // Restore protected tags first, then auto-fix any remaining
        let translated = data.translations[key];
        if (protected_.tags.length > 0) {
          translated = restoreTags(translated, protected_.tags);
        }
        if (hasTechnicalTags(entry.original)) {
          translated = restoreTagsLocally(entry.original, translated);
          translated = autoFixTagBrackets(entry.original, translated);
        }
        updateTranslation(key, translated);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
      console.error('Single translate error:', err);
      toast({ title: "❌ فشل الترجمة", description: errMsg, variant: "destructive" });
    }
    finally { setTranslatingSingle(null); }
  };

  /** Categorize an entry using the correct function (BDAT vs MSBT) */
  const categorizeEntry = (e: ExtractedEntry): string => {
    const isBdat = /^.+?\[\d+\]\./.test(e.label);
    if (isBdat) {
      const sourceFile = e.msbtFile.startsWith('bdat-bin:') ? e.msbtFile.split(':')[1] : e.msbtFile.startsWith('bdat:') ? e.msbtFile.slice(5) : undefined;
      return categorizeBdatTable(e.label, sourceFile, e.original);
    }
    return categorizeFile(e.msbtFile);
  };

  const handleAutoTranslate = async () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0, skipCategory = 0;
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory.length === 0 || filterCategory.includes(categorizeEntry(e));
      if (!matchCategory) { skipCategory++; return false; }
      if (!e.original.trim()) { skipEmpty++; return false; }
      if (arabicRegex.test(e.original)) { skipArabic++; return false; }
      if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) { skipTechnical++; return false; }
      if (state.translations[key]?.trim()) { skipTranslated++; return false; }
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

    // Translation Memory
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
    const afterTM: typeof untranslated = [];
    for (const e of untranslated) {
      const norm = e.original.trim().toLowerCase();
      const cached = tmMap.get(norm);
      if (cached) { tmReused[`${e.msbtFile}:${e.index}`] = cached; }
      else { afterTM.push(e); }
    }

    // Glossary direct translation (free, no AI)
    const glossaryMap = parseGlossaryMap(activeGlossary);
    const glossaryReused: Record<string, string> = {};
    const needsAI: typeof untranslated = [];
    for (const e of afterTM) {
      const norm = e.original.trim().toLowerCase();
      const glossaryHit = glossaryMap.get(norm);
      if (glossaryHit) { glossaryReused[`${e.msbtFile}:${e.index}`] = glossaryHit; }
      else { needsAI.push(e); }
    }

    const freeTranslations = { ...tmReused, ...glossaryReused };
    if (Object.keys(freeTranslations).length > 0) {
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...freeTranslations } } : null);
    }
    const tmCount = Object.keys(tmReused).length;
    const glossaryCount = Object.keys(glossaryReused).length;
    setTmStats({ reused: tmCount + glossaryCount, sent: needsAI.length });
    if (needsAI.length === 0) {
      const parts: string[] = [];
      if (tmCount > 0) parts.push(`${tmCount} من الذاكرة`);
      if (glossaryCount > 0) parts.push(`${glossaryCount} من القاموس 📖`);
      setTranslateProgress(`✅ تم ترجمة ${tmCount + glossaryCount} نص مجاناً (${parts.join(' + ')}) — لا حاجة للذكاء الاصطناعي!`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    const totalBatches = Math.ceil(needsAI.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    const totalGlossaryStats = { directMatches: 0, lockedTerms: 0, contextTerms: 0 };
    const freeCount = Object.keys(freeTranslations).length;
    setGlossarySessionStats({ directMatches: 0, lockedTerms: 0, contextTerms: 0, batchesCompleted: 0, totalBatches, textsTranslated: 0, freeTranslations: freeCount });
    abortControllerRef.current = new AbortController();

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const batch = needsAI.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔄 ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

        // Send original text directly — server handles tag protection
        const entries = batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
        }));
        // Build context: nearby entries only (limited to 8 to prevent context leakage)
        const contextEntries: { key: string; original: string; translation?: string }[] = [];
        const contextKeys = new Set<string>();
        for (const e of batch) {
          const idx = state.entries.indexOf(e);
          for (const offset of [-1, 1]) {
            const neighbor = state.entries[idx + offset];
            if (neighbor) {
              const nKey = `${neighbor.msbtFile}:${neighbor.index}`;
              if (!contextKeys.has(nKey) && state.translations[nKey]?.trim()) {
                contextKeys.add(nKey);
                contextEntries.push({ key: nKey, original: neighbor.original, translation: state.translations[nKey] });
              }
            }
          }
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
           body: JSON.stringify({ entries, glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries.slice(0, 8) : undefined, userApiKey: userGeminiKey || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        // Accumulate glossary stats
        if (data.glossaryStats) {
          totalGlossaryStats.directMatches += data.glossaryStats.directMatches || 0;
          totalGlossaryStats.lockedTerms += data.glossaryStats.lockedTerms || 0;
          totalGlossaryStats.contextTerms += data.glossaryStats.contextTerms || 0;
        }
        // Update live session stats
        const batchTranslated = data.translations ? Object.keys(data.translations).length : 0;
        setGlossarySessionStats(prev => ({
          ...prev,
          directMatches: totalGlossaryStats.directMatches,
          lockedTerms: totalGlossaryStats.lockedTerms,
          contextTerms: totalGlossaryStats.contextTerms,
          batchesCompleted: b + 1,
          textsTranslated: prev.textsTranslated + batchTranslated,
        }));
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          allTranslations = { ...allTranslations, ...fixedTranslations };
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
        }
      }
      if (!abortControllerRef.current?.signal.aborted) {
        const total = Object.keys(allTranslations).length;
        const glossaryParts: string[] = [];
        if (totalGlossaryStats.directMatches > 0) glossaryParts.push(`📖 ${totalGlossaryStats.directMatches} مطابقة مباشرة`);
        if (totalGlossaryStats.lockedTerms > 0) glossaryParts.push(`🔒 ${totalGlossaryStats.lockedTerms} مصطلح مُقفَل`);
        if (totalGlossaryStats.contextTerms > 0) glossaryParts.push(`📋 ${totalGlossaryStats.contextTerms} مصطلح سياقي`);
        const glossaryInfo = glossaryParts.length > 0 ? ` | القاموس: ${glossaryParts.join(' + ')}` : '';
        setTranslateProgress(`✅ تم ترجمة ${total} نص بنجاح${tmCount > 0 ? ` + ${tmCount} من الذاكرة` : ''}${glossaryInfo}`);
        setTimeout(() => setTranslateProgress(""), 8000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setTranslateProgress("⏹️ تم إيقاف الترجمة يدوياً");
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

  const handleStopTranslate = () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };

  const handleRetranslatePage = async () => {
    if (!state) return;
    const entriesToRetranslate = paginatedEntries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return state.translations[key]?.trim() && !isTechnicalText(e.original);
    });
    if (entriesToRetranslate.length === 0) {
      setTranslateProgress("⚠️ لا توجد ترجمات في هذه الصفحة لإعادة ترجمتها");
      setTimeout(() => setTranslateProgress(""), 3000);
      return;
    }
    const prevTrans: Record<string, string> = {};
    for (const e of entriesToRetranslate) {
      const key = `${e.msbtFile}:${e.index}`;
      prevTrans[key] = state.translations[key] || '';
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setTranslating(true);
    abortControllerRef.current = new AbortController();
    try {
      const totalBatches = Math.ceil(entriesToRetranslate.length / AI_BATCH_SIZE);
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف إعادة الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const batch = entriesToRetranslate.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔄 إعادة ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);
        const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
        const contextEntries: { key: string; original: string; translation?: string }[] = [];
        const contextKeys = new Set<string>();
        for (const e of batch) {
          const idx = state.entries.indexOf(e);
          for (const offset of [-2, -1, 1, 2]) {
            const neighbor = state.entries[idx + offset];
            if (neighbor) {
              const nKey = `${neighbor.msbtFile}:${neighbor.index}`;
              if (!contextKeys.has(nKey) && state.translations[nKey]?.trim()) {
                contextKeys.add(nKey);
                contextEntries.push({ key: nKey, original: neighbor.original, translation: state.translations[nKey] });
              }
            }
          }
        }
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
           body: JSON.stringify({ entries, glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries.slice(0, 10) : undefined, userApiKey: userGeminiKey || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
        }
      }
      setTranslateProgress(`✅ تم إعادة ترجمة ${entriesToRetranslate.length} نص في هذه الصفحة`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } finally { setTranslating(false); }
  };

  const handleFixDamagedTags = async (damagedTagKeys: Set<string>) => {
    if (!state || damagedTagKeys.size === 0) return;
    const entriesToFix = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return damagedTagKeys.has(key);
    });
    if (entriesToFix.length === 0) return;

    // Save previous translations for undo
    const prevTrans: Record<string, string> = {};
    for (const e of entriesToFix) {
      const key = `${e.msbtFile}:${e.index}`;
      prevTrans[key] = state.translations[key] || '';
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));

    setTranslating(true);
    abortControllerRef.current = new AbortController();
    let fixedCount = 0;
    try {
      const totalBatches = Math.ceil(entriesToFix.length / AI_BATCH_SIZE);
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) break;
        const batch = entriesToFix.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔧 إصلاح الرموز التالفة ${b + 1}/${totalBatches} (${batch.length} نص)...`);
        const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
           body: JSON.stringify({ entries, glossary: activeGlossary, userApiKey: userGeminiKey || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          fixedCount += Object.keys(fixedTranslations).length;
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
        }
      }
      setTranslateProgress(`✅ تم إصلاح ${fixedCount} نص تالف بنجاح`);
      toast({ title: "✅ تم الإصلاح", description: `تم إصلاح ${fixedCount} نص تالف وإعادة ترجمته بنجاح` });
      setTimeout(() => setTranslateProgress(""), 5000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'غير معروف';
        setTranslateProgress(`❌ خطأ: ${msg}`);
        toast({ title: "❌ فشل الإصلاح", description: msg, variant: "destructive" });
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } finally { setTranslating(false); }
  };

  const handleTranslatePage = async (forceRetranslate = false, memoryOnly = false) => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0;
    const candidates = paginatedEntries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      if (!e.original.trim()) { skipEmpty++; return false; }
      if (arabicRegex.test(e.original)) { skipArabic++; return false; }
      if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) { skipTechnical++; return false; }
      if (!forceRetranslate && state.translations[key]?.trim()) { skipTranslated++; return false; }
      return true;
    });

    // If no untranslated entries and there are translated ones, ask user to re-translate
    if (candidates.length === 0 && skipTranslated > 0 && !forceRetranslate) {
      const confirmed = window.confirm(
        `✅ الصفحة مترجمة بالكامل (${skipTranslated} نص مترجم).\n\nهل تريد إعادة ترجمتها؟`
      );
      if (confirmed) {
        return handleTranslatePage(true, memoryOnly);
      }
      return;
    }

    if (candidates.length === 0) {
      const reasons: string[] = [];
      if (skipArabic > 0) reasons.push(`${skipArabic} نص عربي أصلاً`);
      if (skipTechnical > 0) reasons.push(`${skipTechnical} نص تقني`);
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة في هذه الصفحة${reasons.length > 0 ? ` (${reasons.join('، ')})` : ''}`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // Save previous translations for comparison
    const oldTrans: Record<string, string> = {};
    const originalsMap: Record<string, string> = {};
    for (const e of candidates) {
      const key = `${e.msbtFile}:${e.index}`;
      oldTrans[key] = state.translations[key] || '';
      originalsMap[key] = e.original;
    }

    if (memoryOnly) {
      // Memory-only mode: use TM + Glossary, skip AI entirely
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
      const afterTM: typeof candidates = [];
      for (const e of candidates) {
        const norm = e.original.trim().toLowerCase();
        const cached = tmMap.get(norm);
        if (cached) { tmReused[`${e.msbtFile}:${e.index}`] = cached; }
        else { afterTM.push(e); }
      }

      const glossaryMap = parseGlossaryMap(activeGlossary);
      const glossaryReused: Record<string, string> = {};
      const remaining: typeof candidates = [];
      for (const e of afterTM) {
        const norm = e.original.trim().toLowerCase();
        const glossaryHit = glossaryMap.get(norm);
        if (glossaryHit) { glossaryReused[`${e.msbtFile}:${e.index}`] = glossaryHit; }
        else { remaining.push(e); }
      }

      const freeTranslations = { ...tmReused, ...glossaryReused };
      const totalFree = Object.keys(freeTranslations).length;
      if (totalFree > 0) {
        // Show compare dialog for memory-only too
        setOldPageTranslations(oldTrans);
        setPageTranslationOriginals(originalsMap);
        setPendingPageTranslations(freeTranslations);
        setShowPageCompare(true);
      }
      const tmCount = Object.keys(tmReused).length;
      const glossaryCount = Object.keys(glossaryReused).length;
      setTmStats({ reused: tmCount + glossaryCount, sent: 0 });
      const parts: string[] = [];
      if (tmCount > 0) parts.push(`${tmCount} من الذاكرة`);
      if (glossaryCount > 0) parts.push(`${glossaryCount} من القاموس 📖`);
      if (remaining.length > 0) {
        setTranslateProgress(`✅ تم ترجمة ${totalFree} نص مجاناً (${parts.join(' + ')}) — تم تخطي ${remaining.length} نص (بدون ذكاء اصطناعي)`);
      } else {
        setTranslateProgress(`✅ تم ترجمة ${totalFree} نص مجاناً (${parts.join(' + ')}) — لا حاجة للذكاء الاصطناعي!`);
      }
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // AI mode: translate one-by-one for maximum accuracy
    const needsAI = candidates;
    setTmStats({ reused: 0, sent: needsAI.length });
    if (needsAI.length === 0) {
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    const allTranslations: Record<string, string> = {};
    abortControllerRef.current = new AbortController();

    try {
      for (let i = 0; i < needsAI.length; i++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const entry = needsAI[i];
        const key = `${entry.msbtFile}:${entry.index}`;
        setTranslateProgress(`🔄 ترجمة ${i + 1}/${needsAI.length}...`);

        // Build context from neighboring entries (like handleTranslateSingle)
        const idx = state.entries.indexOf(entry);
        const contextEntries: { key: string; original: string; translation?: string }[] = [];
        for (const offset of [-2, -1, 1, 2]) {
          const neighbor = state.entries[idx + offset];
          if (neighbor) {
            const nKey = `${neighbor.msbtFile}:${neighbor.index}`;
            // Use already-translated entries from this session or existing translations
            const trans = allTranslations[nKey] || state.translations[nKey];
            if (trans?.trim()) {
              contextEntries.push({ key: nKey, original: neighbor.original, translation: trans });
            }
          }
        }

        // Protect tags before sending
        const protected_ = protectTags(entry.original);
        const textToSend = protected_.tags.length > 0 ? protected_.cleanText : entry.original;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            entries: [{ key, original: textToSend }],
            glossary: activeGlossary,
            context: contextEntries.length > 0 ? contextEntries : undefined,
            userApiKey: userGeminiKey || undefined,
            provider: translationProvider,
            myMemoryEmail: myMemoryEmail || undefined,
          }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations && data.translations[key]) {
          let translated = data.translations[key];
          if (protected_.tags.length > 0) {
            translated = restoreTags(translated, protected_.tags);
          }
          if (hasTechnicalTags(entry.original)) {
            translated = restoreTagsLocally(entry.original, translated);
            translated = autoFixTagBrackets(entry.original, translated);
          }
          allTranslations[key] = translated;
        }
      }

      // Show compare dialog instead of applying immediately
      if (Object.keys(allTranslations).length > 0) {
        setOldPageTranslations(oldTrans);
        setPageTranslationOriginals(originalsMap);
        setPendingPageTranslations(allTranslations);
        setShowPageCompare(true);
        setTranslateProgress(`✅ تم ترجمة ${Object.keys(allTranslations).length} نص — راجع النتائج`);
        setTimeout(() => setTranslateProgress(""), 5000);
      } else if (!abortControllerRef.current?.signal.aborted) {
        setTranslateProgress(`⚠️ لم يتم ترجمة أي نص`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Show what we have so far
        if (Object.keys(allTranslations).length > 0) {
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(allTranslations);
          setShowPageCompare(true);
          setTranslateProgress(`⏹️ تم إيقاف الترجمة — ${Object.keys(allTranslations).length} نص جاهز للمراجعة`);
        } else {
          setTranslateProgress("⏹️ تم إيقاف الترجمة يدوياً");
        }
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        // Show what we have so far even on error
        if (Object.keys(allTranslations).length > 0) {
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(allTranslations);
          setShowPageCompare(true);
        }
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg}${Object.keys(allTranslations).length > 0 ? ` (${Object.keys(allTranslations).length} نص جاهز للمراجعة)` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const handleTranslateAllPages = async (memoryOnly = false) => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    const allPages = totalPages;
    
    // Find the first page that has untranslated entries
    let startPage = -1;
    for (let p = 0; p < allPages; p++) {
      const pageEntries = filteredEntries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      const hasUntranslated = pageEntries.some(e => {
        const key = `${e.msbtFile}:${e.index}`;
        if (!e.original.trim()) return false;
        if (arabicRegex.test(e.original)) return false;
        if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) return false;
        if (state.translations[key]?.trim()) return false;
        return true;
      });
      if (hasUntranslated) { startPage = p; break; }
    }

    if (startPage === -1) {
      setTranslateProgress("✅ جميع الصفحات مترجمة بالكامل!");
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    abortControllerRef.current = new AbortController();
    let totalTranslated = 0;
    let pagesCompleted = 0;

    try {
      for (let p = startPage; p < allPages; p++) {
        if (abortControllerRef.current.signal.aborted) break;

        const pageEntries = filteredEntries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
        const candidates = pageEntries.filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          if (!e.original.trim()) return false;
          if (arabicRegex.test(e.original)) return false;
          if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) return false;
          if (state.translations[key]?.trim()) return false;
          return true;
        });

        if (candidates.length === 0) {
          pagesCompleted++;
          continue;
        }

        // Navigate to this page visually
        setCurrentPage(() => p);
        setTranslateProgress(`📄 صفحة ${p + 1}/${allPages} — ترجمة ${candidates.length} نص...`);

        if (memoryOnly) {
          // Memory-only: TM + Glossary
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
          const glossaryMap = parseGlossaryMap(activeGlossary);
          const freeTranslations: Record<string, string> = {};
          for (const e of candidates) {
            const norm = e.original.trim().toLowerCase();
            const key = `${e.msbtFile}:${e.index}`;
            const cached = tmMap.get(norm);
            if (cached) { freeTranslations[key] = cached; continue; }
            const glossaryHit = glossaryMap.get(norm);
            if (glossaryHit) { freeTranslations[key] = glossaryHit; }
          }
          if (Object.keys(freeTranslations).length > 0) {
            setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...freeTranslations } } : null);
            totalTranslated += Object.keys(freeTranslations).length;
          }
        } else {
          // AI mode: translate one-by-one
          for (let i = 0; i < candidates.length; i++) {
            if (abortControllerRef.current.signal.aborted) break;
            const entry = candidates[i];
            const key = `${entry.msbtFile}:${entry.index}`;
            setTranslateProgress(`📄 صفحة ${p + 1}/${allPages} — ترجمة ${i + 1}/${candidates.length}...`);

            const idx = state.entries.indexOf(entry);
            const contextEntries: { key: string; original: string; translation?: string }[] = [];
            for (const offset of [-2, -1, 1, 2]) {
              const neighbor = state.entries[idx + offset];
              if (neighbor) {
                const nKey = `${neighbor.msbtFile}:${neighbor.index}`;
                const trans = state.translations[nKey];
                if (trans?.trim()) {
                  contextEntries.push({ key: nKey, original: neighbor.original, translation: trans });
                }
              }
            }

            const protected_ = protectTags(entry.original);
            const textToSend = protected_.tags.length > 0 ? protected_.cleanText : entry.original;

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
              signal: abortControllerRef.current.signal,
              body: JSON.stringify({
                entries: [{ key, original: textToSend }],
                glossary: activeGlossary,
                context: contextEntries.length > 0 ? contextEntries : undefined,
                userApiKey: userGeminiKey || undefined,
                provider: translationProvider,
                myMemoryEmail: myMemoryEmail || undefined,
              }),
            });
            if (!response.ok) throw new Error(`خطأ ${response.status}`);
            const data = await response.json();
            addAiRequest(1);
            if (data.charsUsed) addMyMemoryChars(data.charsUsed);
            if (data.translations && data.translations[key]) {
              let translated = data.translations[key];
              if (protected_.tags.length > 0) {
                translated = restoreTags(translated, protected_.tags);
              }
              if (hasTechnicalTags(entry.original)) {
                translated = restoreTagsLocally(entry.original, translated);
                translated = autoFixTagBrackets(entry.original, translated);
              }
              setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: translated } } : null);
              totalTranslated++;
            }
          }
        }
        pagesCompleted++;
      }

      if (!abortControllerRef.current?.signal.aborted) {
        setTranslateProgress(`✅ تم ترجمة ${totalTranslated} نص في ${pagesCompleted} صفحة بنجاح!`);
        setTimeout(() => setTranslateProgress(""), 8000);
      } else {
        setTranslateProgress(`⏹️ تم إيقاف الترجمة — ${totalTranslated} نص تمت ترجمته في ${pagesCompleted} صفحة`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setTranslateProgress(`⏹️ تم إيقاف الترجمة — ${totalTranslated} نص تمت ترجمته`);
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg} (${totalTranslated} نص تمت ترجمته قبل الخطأ)`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  return {
    translating,
    translatingSingle,
    tmStats,
    glossarySessionStats,
    pendingPageTranslations,
    oldPageTranslations,
    pageTranslationOriginals,
    showPageCompare,
    applyPendingTranslations,
    discardPendingTranslations,
    handleTranslateSingle,
    handleAutoTranslate,
    handleTranslatePage,
    handleTranslateAllPages,
    handleStopTranslate,
    handleRetranslatePage,
    handleFixDamagedTags,
  };
}
