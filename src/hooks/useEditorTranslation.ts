import { useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  ExtractedEntry, EditorState, AI_BATCH_SIZE,
  categorizeFile, categorizeBdatTable, isTechnicalText, hasTechnicalTags,
} from "@/components/editor/types";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";

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
  userGeminiKey: string;
  translationProvider: 'gemini' | 'mymemory' | 'google';
  myMemoryEmail: string;
  addMyMemoryChars: (chars: number) => void;
  addAiRequest: (count?: number) => void;
}

export function useEditorTranslation({
  state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
  filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, userGeminiKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest,
}: UseEditorTranslationProps) {
  const [translating, setTranslating] = useState(false);
  const [translatingSingle, setTranslatingSingle] = useState<string | null>(null);
  const [tmStats, setTmStats] = useState<{ reused: number; sent: number } | null>(null);
  const [glossarySessionStats, setGlossarySessionStats] = useState<{
    directMatches: number; lockedTerms: number; contextTerms: number;
    batchesCompleted: number; totalBatches: number; textsTranslated: number; freeTranslations: number;
  }>({ directMatches: 0, lockedTerms: 0, contextTerms: 0, batchesCompleted: 0, totalBatches: 0, textsTranslated: 0, freeTranslations: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Auto-fix: restore protected tags then restore any remaining missing tags */
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
      }
      fixed[key] = result;
    }
    return fixed;
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

    // Save previous translations for undo when re-translating
    if (forceRetranslate) {
      const prevTrans: Record<string, string> = {};
      for (const e of candidates) {
        const key = `${e.msbtFile}:${e.index}`;
        if (state.translations[key]?.trim()) {
          prevTrans[key] = state.translations[key];
        }
      }
      if (Object.keys(prevTrans).length > 0) {
        setPreviousTranslations(old => ({ ...old, ...prevTrans }));
      }
    }

    const untranslated = candidates;

    let needsAI: typeof untranslated;
    let tmCount = 0;
    let glossaryCount = 0;

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
      const afterTM: typeof untranslated = [];
      for (const e of untranslated) {
        const norm = e.original.trim().toLowerCase();
        const cached = tmMap.get(norm);
        if (cached) { tmReused[`${e.msbtFile}:${e.index}`] = cached; }
        else { afterTM.push(e); }
      }

      const glossaryMap = parseGlossaryMap(activeGlossary);
      const glossaryReused: Record<string, string> = {};
      const remaining: typeof untranslated = [];
      for (const e of afterTM) {
        const norm = e.original.trim().toLowerCase();
        const glossaryHit = glossaryMap.get(norm);
        if (glossaryHit) { glossaryReused[`${e.msbtFile}:${e.index}`] = glossaryHit; }
        else { remaining.push(e); }
      }

      const freeTranslations = { ...tmReused, ...glossaryReused };
      if (Object.keys(freeTranslations).length > 0) {
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...freeTranslations } } : null);
      }
      tmCount = Object.keys(tmReused).length;
      glossaryCount = Object.keys(glossaryReused).length;
      const totalFree = tmCount + glossaryCount;
      setTmStats({ reused: totalFree, sent: 0 });
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
    } else {
      // AI mode: send everything directly to AI, skip TM/Glossary
      needsAI = untranslated;
      setTmStats({ reused: 0, sent: needsAI.length });
      if (needsAI.length === 0) {
        setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة`);
        setTimeout(() => setTranslateProgress(""), 5000);
        return;
      }
    }

    setTranslating(true);
    const totalBatches = Math.ceil(needsAI.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    setGlossarySessionStats(prev => ({ ...prev, batchesCompleted: 0, totalBatches, textsTranslated: 0, freeTranslations: 0 }));
    abortControllerRef.current = new AbortController();

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const batch = needsAI.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔄 ترجمة صفحة: الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

        // Send original text directly — server handles tag protection (no double protection)
        const entries = batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
        }));
        // No context sent for page translation — prevents context leakage from outside the filter

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
        const batchTranslated = data.translations ? Object.keys(data.translations).length : 0;
        setGlossarySessionStats(prev => ({ ...prev, batchesCompleted: b + 1, textsTranslated: prev.textsTranslated + batchTranslated }));
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          allTranslations = { ...allTranslations, ...fixedTranslations };
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
        }
      }
      if (!abortControllerRef.current?.signal.aborted) {
        const total = Object.keys(allTranslations).length;
        setTranslateProgress(`✅ تم ترجمة ${total} نص في الصفحة الحالية${tmCount > 0 ? ` + ${tmCount} من الذاكرة` : ''}${glossaryCount > 0 ? ` + ${glossaryCount} من القاموس` : ''}`);
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

  return {
    translating,
    translatingSingle,
    tmStats,
    glossarySessionStats,
    handleTranslateSingle,
    handleAutoTranslate,
    handleTranslatePage,
    handleStopTranslate,
    handleRetranslatePage,
    handleFixDamagedTags,
  };
}
