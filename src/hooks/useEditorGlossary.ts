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
          const text = await file.text();
          newTerms += (newTerms ? '\n' : '') + text;
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
        const newCount = newTerms.split('\n').filter(l => l.includes('=')).length;
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
      const text = await response.text();
      const newCount = text.split('\n').filter(l => l.includes('=')).length;
      if (replace) {
        setState(prev => prev ? { ...prev, glossary: text } : null);
      } else {
        setState(prev => prev ? mergeGlossaryText(prev, text) : null);
      }
      setLastSaved(`📖 تم ${replace ? 'تحميل' : 'دمج'} ${name} (${newCount} مصطلح)`);
      setTimeout(() => setLastSaved(""), 3000);
    } catch { alert(`خطأ في تحميل ${name}`); }
  }, [setState, setLastSaved]);

  const handleLoadDefaultGlossary = useCallback(() => loadGlossary('/zelda-glossary.txt', 'القاموس الافتراضي', true), [loadGlossary]);
  const handleLoadTOTKGlossary = useCallback(() => loadGlossary('/zelda-totk-glossary.txt', 'قاموس TOTK'), [loadGlossary]);
  const handleLoadTOTKItemsGlossary = useCallback(() => loadGlossary('/zelda-totk-items-glossary.txt', 'قاموس العناصر'), [loadGlossary]);
  const handleLoadMaterialsGlossary = useCallback(() => loadGlossary('/zelda-materials-glossary.txt', 'قاموس المواد والأسلحة'), [loadGlossary]);
  const handleLoadUIGlossary = useCallback(() => loadGlossary('/zelda-ui-glossary.txt', 'قاموس الواجهة والقوائم'), [loadGlossary]);
  const handleLoadLocationsGlossary = useCallback(() => loadGlossary('/zelda-locations-characters-glossary.txt', 'قاموس المواقع والشخصيات'), [loadGlossary]);

  const handleLoadAllGlossaries = async () => {
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        fetch('/zelda-glossary.txt'),
        fetch('/zelda-totk-glossary.txt'),
        fetch('/zelda-totk-items-glossary.txt'),
        fetch('/zelda-materials-glossary.txt'),
        fetch('/zelda-ui-glossary.txt'),
        fetch('/zelda-locations-characters-glossary.txt'),
      ]);
      if (!r1.ok || !r2.ok || !r3.ok || !r4.ok || !r5.ok || !r6.ok) throw new Error('فشل تحميل أحد القواميس');
      const [t1, t2, t3, t4, t5, t6] = await Promise.all([r1.text(), r2.text(), r3.text(), r4.text(), r5.text(), r6.text()]);
      const combined = t1 + '\n' + t2 + '\n' + t3 + '\n' + t4 + '\n' + t5 + '\n' + t6;
      setState(prev => prev ? mergeGlossaryText(prev, combined) : null);
      const totalTerms = combined.split('\n').filter(l => l.includes('=')).length;
      setLastSaved(`📖 تم تحميل جميع القواميس (${totalTerms} مصطلح)`);
      setTimeout(() => setLastSaved(""), 3000);
    } catch { alert('خطأ في تحميل القواميس'); }
  };

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

  return {
    glossaryEnabled, setGlossaryEnabled,
    glossaryTermCount, activeGlossary,
    parseGlossaryMap,
    handleImportGlossary,
    handleLoadDefaultGlossary, handleLoadTOTKGlossary, handleLoadTOTKItemsGlossary,
    handleLoadMaterialsGlossary, handleLoadUIGlossary, handleLoadLocationsGlossary,
    handleLoadAllGlossaries,
    handleSaveGlossaryToCloud, handleLoadGlossaryFromCloud,
  };
}
