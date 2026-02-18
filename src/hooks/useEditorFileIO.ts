import { useCallback } from "react";
import { removeArabicPresentationForms } from "@/lib/arabic-processing";
import type { EditorState } from "@/components/editor/types";
import { ExtractedEntry, hasArabicChars, unReverseBidi } from "@/components/editor/types";

/** Parse a single JSON object chunk, repairing common issues */
function repairSingleChunk(raw: string): Record<string, string> | null {
  let text = raw.trim();
  if (!text) return null;
  // إضافة الأقواس الناقصة
  if (!text.startsWith('{')) text = '{' + text;
  if (!text.endsWith('}')) {
    // ابحث عن آخر سطر مكتمل
    const lines = text.split('\n');
    const goodLines: string[] = [];
    for (const line of lines) {
      goodLines.push(line);
    }
    // أزل الأسطر غير المكتملة من النهاية
    while (goodLines.length > 1) {
      const last = goodLines[goodLines.length - 1].trim();
      if (last === '' || last === '{' || last.match(/^"[^"]*"\s*:\s*".*",?\s*$/)) break;
      goodLines.pop();
    }
    text = goodLines.join('\n');
    if (!text.endsWith('}')) text += '\n}';
  }
  // إصلاح الفواصل الزائدة
  text = text.replace(/,\s*}/g, '}');
  // إصلاح الفواصل المفقودة بين المدخلات: "value"\n"key" → "value",\n"key"
  text = text.replace(/"\s*\n(\s*")/g, '",\n$1');
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return null;
  }
}

/** إصلاح تلقائي لملفات JSON التالفة أو المقطوعة — يدعم كائنات متعددة متتالية */
function repairJson(raw: string): { parsed: Record<string, string>; wasTruncated: boolean; skippedCount: number } {
  let text = raw.trim();
  // إزالة أغلفة markdown
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  // محاولة أولى مباشرة
  try {
    const result = JSON.parse(text);
    return { parsed: result, wasTruncated: false, skippedCount: 0 };
  } catch {}

  // تقسيم عند }{ وتحليل كل جزء على حدة
  const chunks = text.split(/\}\s*\{/);
  if (chunks.length > 1) {
    const merged: Record<string, string> = {};
    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i].trim();
      if (i > 0) chunk = '{' + chunk;
      if (i < chunks.length - 1) chunk = chunk + '}';
      const parsed = repairSingleChunk(chunk);
      if (parsed) {
        Object.assign(merged, parsed);
      } else {
        failedChunks++;
      }
    }
    if (Object.keys(merged).length > 0) {
      return { parsed: merged, wasTruncated: failedChunks > 0, skippedCount: failedChunks };
    }
  }

  // محاولة إصلاح ككائن واحد
  const single = repairSingleChunk(text);
  if (single) {
    return { parsed: single, wasTruncated: false, skippedCount: 0 };
  }

  // آخر محاولة: استخراج المدخلات يدوياً بالـ regex
  const entryRegex = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const manual: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(text)) !== null) {
    manual[m[1]] = m[2];
  }
  if (Object.keys(manual).length > 0) {
    return { parsed: manual, wasTruncated: true, skippedCount: 0 };
  }

  throw new Error('تعذر إصلاح ملف JSON');
}

interface UseEditorFileIOProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: React.Dispatch<React.SetStateAction<string>>;
  filteredEntries: ExtractedEntry[];
  filterLabel: string;
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

export function useEditorFileIO({ state, setState, setLastSaved, filteredEntries, filterLabel }: UseEditorFileIOProps) {

  const isFilterActive = filterLabel !== "";

  const handleExportTranslations = () => {
    if (!state) return;
    const cleanTranslations: Record<string, string> = {};

    if (isFilterActive) {
      const allowedKeys = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      for (const [key, value] of Object.entries(state.translations)) {
        if (allowedKeys.has(key)) {
          cleanTranslations[key] = normalizeArabicPresentationForms(value);
        }
      }
    } else {
      for (const [key, value] of Object.entries(state.translations)) {
        cleanTranslations[key] = normalizeArabicPresentationForms(value);
      }
    }

    const data = JSON.stringify(cleanTranslations, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translations${suffix}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const countMsg = Object.keys(cleanTranslations).length;
    setLastSaved(isFilterActive
      ? `✅ تم تصدير ${countMsg} ترجمة (${filterLabel})`
      : `✅ تم تصدير ${countMsg} ترجمة`
    );
    setTimeout(() => setLastSaved(""), 3000);
  };

  /** Build the list of untranslated entries grouped by file */
  const getUntranslatedGrouped = () => {
    if (!state) return { groupedByFile: {} as Record<string, { index: number; original: string; label: string }[]>, totalCount: 0 };
    const entriesToExport = isFilterActive ? filteredEntries : state.entries;
    const groupedByFile: Record<string, { index: number; original: string; label: string }[]> = {};
    for (const entry of entriesToExport) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key]?.trim();
      if (!translation || translation === entry.original || translation === entry.original.trim()) {
        if (!groupedByFile[entry.msbtFile]) groupedByFile[entry.msbtFile] = [];
        groupedByFile[entry.msbtFile].push({ index: entry.index, original: entry.original, label: entry.label || '' });
      }
    }
    const totalCount = Object.values(groupedByFile).reduce((sum, arr) => sum + arr.length, 0);
    return { groupedByFile, totalCount };
  };

  /** Build text content for a flat list of entries */
  const buildEnglishTxt = (
    flatEntries: { file: string; index: number; original: string; label: string }[],
    partLabel: string,
    totalParts: number,
    partNum: number,
  ): string => {
    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push(`  English Texts for Translation — ${new Date().toISOString().slice(0, 10)}`);
    lines.push(`  Total: ${flatEntries.length} texts`);
    if (totalParts > 1) lines.push(`  Part: ${partNum} / ${totalParts}`);
    if (isFilterActive) lines.push(`  Filter: ${filterLabel}`);
    lines.push('='.repeat(60));
    lines.push('');

    let currentFile = '';
    let rowNum = 1;
    for (const entry of flatEntries) {
      if (entry.file !== currentFile) {
        currentFile = entry.file;
        lines.push('─'.repeat(60));
        lines.push(`📁 ${entry.file}`);
        lines.push('─'.repeat(60));
        lines.push('');
      }
      lines.push(`[${rowNum}] (${entry.file}:${entry.index})`);
      if (entry.label) lines.push(`Label: ${entry.label}`);
      lines.push('');
      lines.push(entry.original);
      lines.push('');
      lines.push('▶ Translation:');
      lines.push('');
      lines.push('═'.repeat(60));
      lines.push('');
      rowNum++;
    }
    return lines.join('\n');
  };

  /** Download a single text blob */
  const downloadTxt = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportEnglishOnly = (chunkSize?: number) => {
    if (!state) return;
    const { groupedByFile, totalCount } = getUntranslatedGrouped();
    if (totalCount === 0) {
      setLastSaved("ℹ️ لا توجد نصوص غير مترجمة للتصدير");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    // Flatten all entries in file order
    const sortedFiles = Object.keys(groupedByFile).sort();
    const flatEntries: { file: string; index: number; original: string; label: string }[] = [];
    for (const file of sortedFiles) {
      for (const entry of groupedByFile[file].sort((a, b) => a.index - b.index)) {
        flatEntries.push({ file, ...entry });
      }
    }

    const suffix = isFilterActive ? `_${filterLabel}` : '';
    const date = new Date().toISOString().slice(0, 10);

    if (!chunkSize || chunkSize >= totalCount) {
      // تصدير كامل
      const content = buildEnglishTxt(flatEntries, '', 1, 1);
      downloadTxt(content, `english-only${suffix}_${date}.txt`);
      setLastSaved(`✅ تم تصدير ${totalCount} نص إنجليزي (${sortedFiles.length} ملف)`);
    } else {
      // تقسيم إلى أجزاء
      const totalParts = Math.ceil(totalCount / chunkSize);
      for (let i = 0; i < totalParts; i++) {
        const chunk = flatEntries.slice(i * chunkSize, (i + 1) * chunkSize);
        const content = buildEnglishTxt(chunk, '', totalParts, i + 1);
        downloadTxt(content, `english-only${suffix}_part${i + 1}_of_${totalParts}_${date}.txt`);
      }
      setLastSaved(`✅ تم تصدير ${totalCount} نص في ${totalParts} ملفات (${chunkSize} لكل ملف)`);
    }
    setTimeout(() => setLastSaved(""), 4000);
  };

  /** Get untranslated count for UI display */
  const getUntranslatedCount = () => getUntranslatedGrouped().totalCount;

  /** Core logic: process raw JSON text into translations */
  const processJsonImport = useCallback(async (rawText: string, sourceName?: string) => {
    const repaired = repairJson(rawText);
    const imported = repaired.parsed;
    let cleanedImported: Record<string, string> = {};

    if (isFilterActive && filteredEntries.length < (state?.entries.length || 0)) {
      const allowedKeys = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      for (const [key, value] of Object.entries(imported)) {
        if (allowedKeys.has(key)) {
          cleanedImported[key] = normalizeArabicPresentationForms(value);
        }
      }
    } else {
      for (const [key, value] of Object.entries(imported)) {
        cleanedImported[key] = normalizeArabicPresentationForms(value);
      }
    }

    // Backward compat: convert legacy FFF9-FFFC markers in imported translations to PUA markers
    if (state?.entries) {
      const entryMap = new Map(state.entries.map(e => [`${e.msbtFile}:${e.index}`, e]));
      for (const [key, value] of Object.entries(cleanedImported)) {
        if (/[\uFFF9-\uFFFC]/.test(value)) {
          const entry = entryMap.get(key);
          if (entry) {
            const puaMarkers = entry.original.match(/[\uE000-\uE0FF]/g) || [];
            if (puaMarkers.length > 0) {
              let idx = 0;
              cleanedImported[key] = value.replace(/[\uFFF9-\uFFFC]/g, () => {
                if (idx < puaMarkers.length) return puaMarkers[idx++];
                return '';
              });
            }
          }
        }
      }
    }

    setState(prev => { if (!prev) return null; return { ...prev, translations: { ...prev.translations, ...cleanedImported } }; });

    const totalImported = Object.keys(imported).length;
    const appliedCount = Object.keys(cleanedImported).length;
    let msg = isFilterActive
      ? `✅ تم استيراد ${appliedCount} من ${totalImported} ترجمة (${filterLabel})`
      : `✅ تم استيراد ${appliedCount} ترجمة وتنظيفها`;
    if (sourceName) msg += ` — ${sourceName}`;
    if (repaired.wasTruncated) {
      msg += ` ⚠️ الملف كان مقطوعاً — تم تخطي ${repaired.skippedCount} سطر غير مكتمل`;
    }
    setLastSaved(msg);

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
  }, [state, setState, setLastSaved, isFilterActive, filteredEntries, filterLabel]);

  /** Handle drop/paste of JSON file or text */
  const handleDropImport = useCallback(async (dataTransfer: DataTransfer) => {
    // Try files first
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const file = dataTransfer.files[0];
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('Drop import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }
    // Try text
    const text = dataTransfer.getData('text/plain')?.trim();
    if (text) {
      try {
        await processJsonImport(text, 'لصق من الحافظة');
      } catch (err) {
        console.error('Paste import error:', err);
        alert(`نص JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    }
  }, [processJsonImport]);

  const handleImportTranslations = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain,.txt,*/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('JSON import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  const handleExportCSV = () => {
    if (!state) return;
    const entriesToExport = (isFilterActive && filteredEntries.length < state.entries.length) ? filteredEntries : state.entries;
    const header = 'file,index,label,original,translation,max_bytes';
    const rows = entriesToExport.map(entry => {
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
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translations${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const msg = isFilterActive
      ? `✅ تم تصدير ${entriesToExport.length} نص كملف CSV (${filterLabel})`
      : `✅ تم تصدير ${entriesToExport.length} نص كملف CSV`;
    setLastSaved(msg);
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

        const allowedKeys = isFilterActive && filteredEntries.length < (state?.entries.length || 0)
          ? new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`))
          : null;

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
          if (allowedKeys && !allowedKeys.has(key)) continue;
          updates[key] = normalizeArabicPresentationForms(translation);
          imported++;
        }

        if (imported === 0) { alert('لم يتم العثور على ترجمات في الملف'); return; }
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
        const msg = isFilterActive
          ? `✅ تم استيراد ${imported} ترجمة من CSV (${filterLabel})`
          : `✅ تم استيراد ${imported} ترجمة من CSV`;
        setLastSaved(msg);
        setTimeout(() => setLastSaved(""), 4000);
      } catch { alert('خطأ في قراءة ملف CSV'); }
    };
    input.click();
  };

  /** Export ALL English originals as JSON {key: original} for external translation */
  const handleExportAllEnglishJson = () => {
    if (!state) return;
    const entriesToExport = isFilterActive ? filteredEntries : state.entries;
    const exportObj: Record<string, string> = {};
    for (const entry of entriesToExport) {
      const key = `${entry.msbtFile}:${entry.index}`;
      exportObj[key] = entry.original;
    }
    const data = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `english-all${suffix}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${Object.keys(exportObj).length} نص إنجليزي كـ JSON للترجمة الخارجية`);
    setTimeout(() => setLastSaved(""), 4000);
  };

  /** Import external translations JSON {key: translation} back */
  const handleImportExternalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('External JSON import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  return {
    handleExportTranslations,
    handleExportEnglishOnly,
    handleImportTranslations,
    handleDropImport,
    processJsonImport,
    handleExportCSV,
    handleImportCSV,
    handleExportAllEnglishJson,
    handleImportExternalJson,
    normalizeArabicPresentationForms,
    isFilterActive,
    filterLabel,
    getUntranslatedCount,
  };
}
