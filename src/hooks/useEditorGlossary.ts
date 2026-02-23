import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EditorState } from "@/components/editor/types";

interface UseEditorGlossaryProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  setCloudSyncing: (v: boolean) => void;
  setCloudStatus: (msg: string) => void;
  userId?: string;
}

export function useEditorGlossary({
  state, setState, setLastSaved, setCloudSyncing, setCloudStatus, userId,
}: UseEditorGlossaryProps) {
  const [glossaryEnabled, setGlossaryEnabled] = useState(true);

  // === Computed ===
  const glossaryTermCount = useMemo(() => {
    if (!state?.glossary?.trim()) return 0;
    return state.glossary.split('\n').filter(l => {
      const t = l.trim();
      return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('=');
    }).length;
  }, [state?.glossary]);

  const activeGlossary = glossaryEnabled ? (state?.glossary || '') : '';

  // === Parse glossary into lookup map ===
  const parseGlossaryMap = useCallback((glossaryText: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!glossaryText?.trim()) return map;
    for (const line of glossaryText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const eng = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const arb = trimmed.slice(eqIdx + 1).trim();
      if (eng && arb) map.set(eng, arb);
    }
    return map;
  }, []);

  // === Merge helper ===
  const mergeGlossaryText = (prev: EditorState, newText: string): EditorState => {
    const existing = prev.glossary?.trim() || '';
    const merged = existing ? existing + '\n' + newText : newText;
    const seen = new Map<string, string>();
    for (const line of merged.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      seen.set(key, trimmed);
    }
    return { ...prev, glossary: Array.from(seen.values()).join('\n') };
  };

  // === Import from file ===
  const handleImportGlossary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      try {
        let newTerms = '';
        for (const file of Array.from(files)) {
          const rawText = await file.text();
          // Trim trailing spaces from each line
          const cleaned = rawText.split('\n').map(l => l.trimEnd()).join('\n');
          newTerms += (newTerms ? '\n' : '') + cleaned;
        }
        setState(prev => {
          if (!prev) return null;
          const existing = prev.glossary?.trim() || '';
          const merged = existing ? existing + '\n' + newTerms : newTerms;
          const seen = new Map<string, string>();
          for (const line of merged.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx < 1) continue;
            const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
            seen.set(key, trimmed);
          }
          return { ...prev, glossary: Array.from(seen.values()).join('\n') };
        });
        const fileNames = Array.from(files).map(f => f.name).join('، ');
        const newCount = newTerms.split('\n').filter(l => {
          const t = l.trim();
          return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('=');
        }).length;
        setLastSaved(`📖 تم دمج ${newCount} مصطلح من (${fileNames})`);
        setTimeout(() => setLastSaved(""), 4000);
      } catch { alert('خطأ في قراءة الملف'); }
    };
    input.click();
  };

  // === Load from URL ===
  const loadGlossary = useCallback(async (url: string, name: string, replace = false) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('فشل تحميل القاموس');
      const rawText = await response.text();
      // Clean glossary lines: trim trailing spaces, remove useless technical-only entries
      const cleanedText = rawText.split('\n').map(line => {
        const trimmed = line.trimEnd();
        // Skip pure technical entries like #[ML:...], +=+, -=-, .=., etc.
        if (/^[#%+=\-.\\/;:]+\s*=\s*[#%+=\-.\\/;:]+\s*$/.test(trimmed)) return null;
        if (/^#\[ML:/.test(trimmed)) return null;
        if (/^\+\[ML:/.test(trimmed)) return null;
        return trimmed;
      }).filter(l => l !== null).join('\n');
      const newCount = cleanedText.split('\n').filter(l => { const t = l.trim(); return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('='); }).length;
      if (replace) {
        setState(prev => prev ? { ...prev, glossary: cleanedText } : null);
      } else {
        setState(prev => prev ? mergeGlossaryText(prev, cleanedText) : null);
      }
      setLastSaved(`📖 تم ${replace ? 'تحميل' : 'دمج'} ${name} (${newCount} مصطلح)`);
      setTimeout(() => setLastSaved(""), 3000);
    } catch { alert(`خطأ في تحميل ${name}`); }
  }, [setState, setLastSaved]);

  const handleLoadXC3Glossary = useCallback(() => loadGlossary('/xc3-glossary.txt', 'قاموس Xenoblade Chronicles 3', true), [loadGlossary]);
  const handleLoadUIMenusGlossary = useCallback(() => loadGlossary('/xc3-ui-menus-glossary.txt', 'قاموس القوائم والواجهة', false), [loadGlossary]);

  // === Cloud glossary ===
  const handleSaveGlossaryToCloud = async () => {
    if (!state || !userId || !state.glossary) { setCloudStatus('❌ لا يوجد قاموس لحفظه'); setTimeout(() => setCloudStatus(""), 3000); return; }
    setCloudSyncing(true); setCloudStatus('جاري حفظ القاموس...');
    try {
      const { error } = await supabase.from('glossaries').insert({ user_id: userId, name: 'قاموسي', content: state.glossary }).select().single();
      if (error) throw error;
      setCloudStatus(`✅ تم حفظ القاموس في السحابة (${state.glossary.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) { console.error('خطأ في حفظ القاموس:', error); setCloudStatus('❌ فشل حفظ القاموس في السحابة'); setTimeout(() => setCloudStatus(""), 3000); }
    finally { setCloudSyncing(false); }
  };

  const handleLoadGlossaryFromCloud = async () => {
    if (!userId) { setCloudStatus('❌ يجب تسجيل الدخول أولاً'); setTimeout(() => setCloudStatus(""), 3000); return; }
    setCloudSyncing(true); setCloudStatus('جاري تحميل القاموس من السحابة...');
    try {
      const { data, error } = await supabase.from('glossaries').select('content').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { setCloudStatus('❌ لم يتم العثور على قاموس محفوظ'); setTimeout(() => setCloudStatus(""), 3000); return; }
      setState(prev => prev ? { ...prev, glossary: data.content } : null);
      setCloudStatus(`✅ تم تحميل القاموس من السحابة (${data.content.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) { console.error('خطأ في تحميل القاموس من السحابة:', error); setCloudStatus('❌ فشل تحميل القاموس من السحابة'); setTimeout(() => setCloudStatus(""), 3000); }
    finally { setCloudSyncing(false); }
  };

  // === Generate glossary from single-word/phrase completed translations ===
  const handleGenerateGlossaryFromTranslations = useCallback(() => {
    if (!state?.translations || !state?.entries) return;

    const existingMap = parseGlossaryMap(state.glossary || '');
    let newTerms = 0;
    const lines: string[] = [];

    for (const [key, translation] of Object.entries(state.translations)) {
      if (!translation?.trim()) continue;
      const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
      if (!entry) continue;
      const original = entry.original.trim();
      if (!original) continue;

      // Only single-word or short single-phrase entries (no line breaks, reasonable length)
      // Skip entries with control codes like [ML:...] or {color...}
      if (original.includes('\n') || original.includes('[ML:') || original.includes('{')) continue;
      // Max ~60 chars to keep it to short terms/phrases
      if (original.length > 60) continue;

      const normKey = original.toLowerCase();
      if (existingMap.has(normKey)) continue; // already in glossary

      lines.push(`${original}=${translation.trim()}`);
      newTerms++;
    }

    if (newTerms === 0) {
      setLastSaved('📖 لا توجد ترجمات جديدة قصيرة لإضافتها للقاموس');
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    // Merge into existing glossary
    const newText = lines.join('\n');
    setState(prev => {
      if (!prev) return null;
      const existing = prev.glossary?.trim() || '';
      const merged = existing ? existing + '\n' + newText : newText;
      // Deduplicate
      const seen = new Map<string, string>();
      for (const line of merged.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 1) continue;
        const k = trimmed.slice(0, eqIdx).trim().toLowerCase();
        seen.set(k, trimmed);
      }
      return { ...prev, glossary: Array.from(seen.values()).join('\n') };
    });

    setLastSaved(`📖 تم إنشاء ${newTerms} مصطلح جديد من الترجمات المكتملة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, parseGlossaryMap, setState, setLastSaved]);

  return {
    glossaryEnabled, setGlossaryEnabled,
    glossaryTermCount, activeGlossary,
    parseGlossaryMap,
    handleImportGlossary, handleLoadXC3Glossary, handleLoadUIMenusGlossary,
    handleSaveGlossaryToCloud, handleLoadGlossaryFromCloud,
    handleGenerateGlossaryFromTranslations,
  };
}
