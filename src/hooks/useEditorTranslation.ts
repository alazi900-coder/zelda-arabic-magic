import { useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  ExtractedEntry, EditorState, AI_BATCH_SIZE,
  categorizeFile, isTechnicalText,
} from "@/components/editor/types";

interface UseEditorTranslationProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  setTranslateProgress: (msg: string) => void;
  setPreviousTranslations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTranslation: (key: string, value: string) => void;
  filterCategory: string;
  activeGlossary: string;
  parseGlossaryMap: (glossary: string) => Map<string, string>;
  paginatedEntries: ExtractedEntry[];
  userGeminiKey: string;
}

export function useEditorTranslation({
  state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
  filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, userGeminiKey,
}: UseEditorTranslationProps) {
  const [translating, setTranslating] = useState(false);
  const [translatingSingle, setTranslatingSingle] = useState<string | null>(null);
  const [tmStats, setTmStats] = useState<{ reused: number; sent: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

      const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key, original: entry.original }], glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries : undefined, userApiKey: userGeminiKey || undefined }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      if (data.translations && data.translations[key]) updateTranslation(key, data.translations[key]);
    } catch (err) { console.error('Single translate error:', err); }
    finally { setTranslatingSingle(null); }
  };

  const handleAutoTranslate = async () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0, skipCategory = 0;
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
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
          body: JSON.stringify({ entries, glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries.slice(0, 10) : undefined, userApiKey: userGeminiKey || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        if (data.translations) {
          allTranslations = { ...allTranslations, ...data.translations };
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...data.translations } } : null);
        }
      }
      if (!abortControllerRef.current?.signal.aborted) {
        const total = Object.keys(allTranslations).length;
        setTranslateProgress(`✅ تم ترجمة ${total} نص بنجاح${tmCount > 0 ? ` + ${tmCount} من الذاكرة` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
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
          body: JSON.stringify({ entries, glossary: activeGlossary, context: contextEntries.length > 0 ? contextEntries.slice(0, 10) : undefined, userApiKey: userGeminiKey || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        if (data.translations) {
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...data.translations } } : null);
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
          body: JSON.stringify({ entries, glossary: activeGlossary, userApiKey: userGeminiKey || undefined }),
        });
        if (!response.ok) throw new Error(`خطأ ${response.status}`);
        const data = await response.json();
        if (data.translations) {
          fixedCount += Object.keys(data.translations).length;
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...data.translations } } : null);
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

  return {
    translating,
    translatingSingle,
    tmStats,
    handleTranslateSingle,
    handleAutoTranslate,
    handleStopTranslate,
    handleRetranslatePage,
    handleFixDamagedTags,
  };
}
