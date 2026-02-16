import { useCallback } from "react";
import { removeArabicPresentationForms } from "@/lib/arabic-processing";
import type { EditorState } from "@/components/editor/types";
import { hasArabicChars, unReverseBidi } from "@/components/editor/types";

interface UseEditorFileIOProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: React.Dispatch<React.SetStateAction<string>>;
}

function normalizeArabicPresentationForms(text: string): string {
  if (!text) return text;
  return removeArabicPresentationForms(text);
}

function escapeCSV(text: string): string {
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function useEditorFileIO({ state, setState, setLastSaved }: UseEditorFileIOProps) {

  const handleExportTranslations = () => {
    if (!state) return;
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
        const cleanedImported: Record<string, string> = {};
        for (const [key, value] of Object.entries(imported)) {
          cleanedImported[key] = normalizeArabicPresentationForms(value);
        }
        setState(prev => { if (!prev) return null; return { ...prev, translations: { ...prev.translations, ...cleanedImported } }; });
        setLastSaved(`✅ تم استيراد ${Object.keys(imported).length} ترجمة وتنظيفها`);
        setTimeout(() => {
          setState(prevState => {
            if (!prevState) return null;
            const newTranslations = { ...prevState.translations };
            const newProtected = new Set(prevState.protectedEntries || []);
            let count = 0;
            for (const entry of prevState.entries) {
              const key = `${entry.msbtFile}:${entry.index}`;
              if (hasArabicChars(entry.original)) {
                if (newProtected.has(key)) continue;
                const existing = newTranslations[key]?.trim();
                const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
                if (isAutoDetected) {
                  const corrected = unReverseBidi(entry.original);
                  if (corrected !== entry.original) {
                    newTranslations[key] = corrected;
                    newProtected.add(key);
                    count++;
                  }
                }
              }
            }
            if (count > 0) setLastSaved(prev => prev + ` + تصحيح ${count} نص معكوس`);
            return { ...prevState, translations: newTranslations, protectedEntries: newProtected };
          });
        }, 0);
      } catch { alert('ملف JSON غير صالح'); }
    };
    input.click();
  };

  const handleExportCSV = () => {
    if (!state) return;
    const header = 'file,index,label,original,translation,max_bytes';
    const rows = state.entries.map(entry => {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = normalizeArabicPresentationForms(state.translations[key] || '');
      return [
        escapeCSV(entry.msbtFile),
        entry.index.toString(),
        escapeCSV(entry.label),
        escapeCSV(entry.original),
        escapeCSV(translation),
        entry.maxBytes.toString(),
      ].join(',');
    });
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translations_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${state.entries.length} نص كملف CSV`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleImportCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { alert('ملف CSV فارغ أو غير صالح'); return; }

        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('file') || header.includes('translation') || header.includes('original');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        let imported = 0;
        const updates: Record<string, string> = {};

        for (const line of dataLines) {
          const cols = parseCSVLine(line);
          if (cols.length < 5) continue;
          const filePath = cols[0].trim();
          const index = cols[1].trim();
          const translation = cols[4].trim();
          if (!filePath || !index || !translation) continue;
          const key = `${filePath}:${index}`;
          updates[key] = normalizeArabicPresentationForms(translation);
          imported++;
        }

        if (imported === 0) { alert('لم يتم العثور على ترجمات في الملف'); return; }
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
        setLastSaved(`✅ تم استيراد ${imported} ترجمة من CSV`);
        setTimeout(() => setLastSaved(""), 4000);
      } catch { alert('خطأ في قراءة ملف CSV'); }
    };
    input.click();
  };

  return {
    handleExportTranslations,
    handleImportTranslations,
    handleExportCSV,
    handleImportCSV,
    normalizeArabicPresentationForms,
  };
}
