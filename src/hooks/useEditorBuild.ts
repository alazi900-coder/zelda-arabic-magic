import { useState } from "react";
import { idbGet } from "@/lib/idb-storage";
import { processArabicText, hasArabicChars as hasArabicCharsProcessing, hasArabicPresentationForms } from "@/lib/arabic-processing";
import { EditorState, hasTechnicalTags, restoreTagsLocally } from "@/components/editor/types";
import { BuildPreview } from "@/components/editor/BuildConfirmDialog";

export interface BuildStats {
  modifiedCount: number;
  expandedCount: number;
  fileSize: number;
  compressedSize?: number;
  avgBytePercent: number;
  maxBytePercent: number;
  longest: { key: string; bytes: number } | null;
  shortest: { key: string; bytes: number } | null;
  categories: Record<string, { total: number; modified: number }>;
}

interface UseEditorBuildProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  arabicNumerals: boolean;
  mirrorPunctuation: boolean;
  gameType?: string;
}

export function useEditorBuild({ state, setState, setLastSaved, arabicNumerals, mirrorPunctuation, gameType }: UseEditorBuildProps) {
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const [applyingArabic, setApplyingArabic] = useState(false);
  const [buildStats, setBuildStats] = useState<BuildStats | null>(null);
  const [buildPreview, setBuildPreview] = useState<BuildPreview | null>(null);
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);

  const handleApplyArabicProcessing = () => {
    if (!state) return;
    setApplyingArabic(true);
    const newTranslations = { ...state.translations };
    let processedCount = 0, skippedCount = 0;
    for (const [key, value] of Object.entries(newTranslations)) {
      if (!value?.trim()) continue;
      if (hasArabicPresentationForms(value)) { skippedCount++; continue; }
      if (!hasArabicCharsProcessing(value)) continue;
      newTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
      processedCount++;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setApplyingArabic(false);
    setLastSaved(`✅ تم تطبيق المعالجة العربية على ${processedCount} نص` + (skippedCount > 0 ? ` (تم تخطي ${skippedCount} نص معالج مسبقاً)` : ''));
    setTimeout(() => setLastSaved(""), 5000);
  };

  const handlePreBuild = () => {
    if (!state) return;
    
    const nonEmptyTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(state.translations)) {
      if (v.trim()) nonEmptyTranslations[k] = v;
    }

    const protectedCount = Array.from(state.protectedEntries || []).filter(k => nonEmptyTranslations[k]).length;
    const normalCount = Object.keys(nonEmptyTranslations).length - protectedCount;

    // Category breakdown
    const categories: Record<string, number> = {};
    for (const key of Object.keys(nonEmptyTranslations)) {
      const parts = key.split(':')[0].split('/');
      const cat = parts.length > 1 ? parts[0] : 'Other';
      categories[cat] = (categories[cat] || 0) + 1;
    }

    const sampleKeys = Object.keys(nonEmptyTranslations).slice(0, 10);

    console.log('[BUILD-PREVIEW] Total translations:', Object.keys(nonEmptyTranslations).length);
    console.log('[BUILD-PREVIEW] Protected entries:', protectedCount);
    console.log('[BUILD-PREVIEW] Categories:', categories);
    console.log('[BUILD-PREVIEW] Sample keys:', sampleKeys);

    setBuildPreview({
      totalTranslations: Object.keys(nonEmptyTranslations).length,
      protectedCount,
      normalCount,
      categories,
      sampleKeys,
    });
    setShowBuildConfirm(true);
  };

  const handleBuildXenoblade = async () => {
    if (!state) return;
    setBuilding(true); setBuildProgress("تجهيز الترجمات...");
    try {
      const msbtFiles = await idbGet<Record<string, ArrayBuffer>>("editorMsbtFiles");
      const msbtFileNames = await idbGet<string[]>("editorMsbtFileNames");
      const bdatFiles = await idbGet<Record<string, string>>("editorBdatFiles");
      const bdatFileNames = await idbGet<string[]>("editorBdatFileNames");
      const bdatBinaryFiles = await idbGet<Record<string, ArrayBuffer>>("editorBdatBinaryFiles");
      const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");

      const hasMsbt = msbtFiles && msbtFileNames && msbtFileNames.length > 0;
      const hasBdat = bdatFiles && bdatFileNames && bdatFileNames.length > 0;
      const hasBdatBinary = bdatBinaryFiles && bdatBinaryFileNames && bdatBinaryFileNames.length > 0;

      if (!hasMsbt && !hasBdat && !hasBdatBinary) {
        setBuildProgress("❌ لا توجد ملفات. يرجى العودة لصفحة المعالجة وإعادة رفع الملفات.");
        setTimeout(() => setBuildProgress(""), 5000);
        return;
      }

      // Process binary BDAT files locally
      let localBdatResults: { name: string; data: Uint8Array }[] = [];
      let localModifiedCount = 0;

      if (hasBdatBinary) {
        setBuildProgress("معالجة ملفات BDAT الثنائية محلياً...");
        const { parseBdatFile } = await import("@/lib/bdat-parser");
        const { rebuildBdatFile } = await import("@/lib/bdat-writer");
        const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
        const { processArabicText, hasArabicPresentationForms: hasPF } = await import("@/lib/arabic-processing");

        const nonEmptyTranslations: Record<string, string> = {};
        for (const [k, v] of Object.entries(state.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }

        for (const fileName of bdatBinaryFileNames!) {
          const buf = bdatBinaryFiles![fileName];
          if (!buf) continue;
          try {
            const data = new Uint8Array(buf);
            const bdatFile = parseBdatFile(data, unhashLabel);
            
            // Build translation map for this file
            const translationMap = new Map<string, string>();
            for (const table of bdatFile.tables) {
              for (let r = 0; r < table.rows.length; r++) {
                for (const col of table.columns) {
                  if (col.valueType !== 7 && col.valueType !== 11) continue; // String or DebugString
                  // Find matching translation key
                  const key = `bdat-bin:${fileName}:${table.name}:${r}:${col.name}`;
                  // Search in translations using the entry index format
                  for (const [tKey, tVal] of Object.entries(nonEmptyTranslations)) {
                    if (tKey.startsWith(`bdat-bin:${fileName}:`) && tVal) {
                      // Parse the entry key to match table:row:col
                      const parts = tKey.split(':');
                      if (parts.length >= 5) {
                        const tTable = parts[2];
                        // Match by table name and column
                        if (tTable === table.name) {
                          const mapKey = `${table.name}:${r}:${col.name}`;
                          const entryKey = `bdat-bin:${fileName}:${table.name}:${r}:${col.name}`;
                          const trans = nonEmptyTranslations[entryKey];
                          if (trans) {
                            let processed: string;
                            if (hasPF(trans)) {
                              processed = trans;
                            } else {
                              processed = processArabicText(trans, { arabicNumerals, mirrorPunct: mirrorPunctuation });
                            }
                            translationMap.set(mapKey, processed);
                            localModifiedCount++;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            if (translationMap.size > 0) {
              const rebuilt = rebuildBdatFile(bdatFile, translationMap);
              localBdatResults.push({ name: fileName, data: rebuilt });
            } else {
              localBdatResults.push({ name: fileName, data });
            }
          } catch (e) {
            console.warn(`Failed to rebuild BDAT ${fileName}:`, e);
            localBdatResults.push({ name: fileName, data: new Uint8Array(buf) });
          }
        }
      }
      
      // Handle MSBT and JSON BDAT files via server
      if (hasMsbt || hasBdat) {
        const formData = new FormData();
        if (hasMsbt) {
          for (let i = 0; i < msbtFileNames!.length; i++) {
            const name = msbtFileNames![i];
            const buf = msbtFiles![name];
            if (buf) formData.append(`msbt_${i}`, new File([new Uint8Array(buf)], name));
          }
        }
        if (hasBdat) {
          for (let i = 0; i < bdatFileNames!.length; i++) {
            const name = bdatFileNames![i];
            const text = bdatFiles![name];
            if (text) formData.append(`bdat_${i}`, new File([text], name, { type: 'application/json' }));
          }
        }
        
        const nonEmptyTranslations: Record<string, string> = {};
        for (const [k, v] of Object.entries(state.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }
        
        // Auto-fix damaged tags before build
        for (const entry of state.entries) {
          if (!/[\uFFF9-\uFFFC\uE000-\uE0FF]/.test(entry.original)) continue;
          const key = `${entry.msbtFile}:${entry.index}`;
          const trans = nonEmptyTranslations[key];
          if (!trans) continue;
          const origTagCount = (entry.original.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
          const transTagCount = (trans.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
          if (transTagCount < origTagCount) {
            nonEmptyTranslations[key] = restoreTagsLocally(entry.original, trans);
          }
        }
        
        formData.append("translations", JSON.stringify(nonEmptyTranslations));
        formData.append("protectedEntries", JSON.stringify(Array.from(state.protectedEntries || [])));
        if (arabicNumerals) formData.append("arabicNumerals", "true");
        if (mirrorPunctuation) formData.append("mirrorPunctuation", "true");
        
        setBuildProgress("إرسال للمعالجة...");
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(`${supabaseUrl}/functions/v1/arabize-xenoblade?mode=build`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey },
          body: formData,
        });
        if (!response.ok) {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('json')) { const err = await response.json(); throw new Error(err.error || `خطأ ${response.status}`); }
          throw new Error(`خطأ ${response.status}`);
        }
        setBuildProgress("تحميل الملف...");
        const blob = await response.blob();
        const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0') + localModifiedCount;
        
        // If we also have local BDAT results, we need to combine them
        // For now, download server ZIP and local files separately
        if (localBdatResults.length > 0) {
          // Download server ZIP first
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "xenoblade_arabized_msbt.zip";
          a.click();
          
          // Then download local BDAT files
          for (const result of localBdatResults) {
            const bdatBlob = new Blob([new Uint8Array(result.data) as any]);
            const bdatUrl = URL.createObjectURL(bdatBlob);
            const bdatA = document.createElement("a");
            bdatA.href = bdatUrl;
            bdatA.download = result.name;
            bdatA.click();
          }
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص`);
        } else {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "xenoblade_arabized.zip";
          a.click();
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص — الملفات في ملف ZIP`);
        }
      } else if (localBdatResults.length > 0) {
        // Only binary BDAT files, download them directly
        setBuildProgress("تحميل ملفات BDAT المعرّبة...");
        for (const result of localBdatResults) {
          const bdatBlob = new Blob([new Uint8Array(result.data) as any]);
          const bdatUrl = URL.createObjectURL(bdatBlob);
          const bdatA = document.createElement("a");
          bdatA.href = bdatUrl;
          bdatA.download = result.name;
          bdatA.click();
        }
        setBuildProgress(`✅ تم بنجاح! تم تعديل ${localModifiedCount} نص في ملفات BDAT`);
      }
      
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 3000);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 5000);
    }
  };

  const handleBuild = async () => {
    if (!state) return;
    setShowBuildConfirm(false);
    
    const isXenoblade = gameType === "xenoblade";
    
    if (isXenoblade) {
      return handleBuildXenoblade();
    }
    
    const langBuf = await idbGet<ArrayBuffer>("editorLangFile");
    const dictBuf = await idbGet<ArrayBuffer>("editorDictFile");
    const langFileName = (await idbGet<string>("editorLangFileName")) || "output.zs";
    if (!langBuf) { setBuildProgress("❌ ملف اللغة غير موجود. يرجى العودة لصفحة المعالجة وإعادة رفع الملفات."); setTimeout(() => setBuildProgress(""), 5000); return; }
    setBuilding(true); setBuildProgress("تجهيز الترجمات...");
    try {
      const formData = new FormData();
      formData.append("langFile", new File([new Uint8Array(langBuf)], langFileName));
      if (dictBuf) formData.append("dictFile", new File([new Uint8Array(dictBuf)], (await idbGet<string>("editorDictFileName")) || "ZsDic.pack.zs"));
      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }

      // Auto-fix damaged tags before build
      let tagFixCount = 0;
      let tagSkipCount = 0;
      let tagOkCount = 0;
      for (const entry of state.entries) {
        if (!hasTechnicalTags(entry.original)) continue;
        const key = `${entry.msbtFile}:${entry.index}`;
        const trans = nonEmptyTranslations[key];
        if (!trans) continue;
        const origTagCount = (entry.original.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
        const transTagCount = (trans.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
        if (transTagCount < origTagCount) {
          const fixed = restoreTagsLocally(entry.original, trans);
          nonEmptyTranslations[key] = fixed;
          tagFixCount++;
          // Log DoCommand/LayoutMsg entries for debugging
          if (entry.msbtFile.includes('DoCommand') || entry.msbtFile.includes('Pouch')) {
            const fixedTagCount = (fixed.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
            console.log(`[TAG-FIX] ${key}: orig=${origTagCount} tags, trans=${transTagCount} tags, fixed=${fixedTagCount} tags`);
            console.log(`[TAG-FIX] Original: ${[...entry.original.substring(0, 30)].map(c => c.charCodeAt(0).toString(16).padStart(4,'0')).join(' ')}`);
            console.log(`[TAG-FIX] Fixed: ${[...fixed.substring(0, 30)].map(c => c.charCodeAt(0).toString(16).padStart(4,'0')).join(' ')}`);
          }
        } else {
          tagOkCount++;
        }
      }
      console.log(`[BUILD-TAGS] Fixed: ${tagFixCount}, Already OK: ${tagOkCount}, Skipped(no tags): ${tagSkipCount}`);
      
      // Validate translations size
      const translationsJson = JSON.stringify(nonEmptyTranslations);
      const translationsSizeKB = Math.round(translationsJson.length / 1024);
      console.log(`[BUILD] Total translations being sent: ${Object.keys(nonEmptyTranslations).length}`);
      console.log(`[BUILD] Translations JSON size: ${translationsSizeKB} KB`);
      console.log('[BUILD] Protected entries:', Array.from(state.protectedEntries || []).length);
      console.log('[BUILD] Sample keys:', Object.keys(nonEmptyTranslations).slice(0, 10));
      
      if (translationsSizeKB > 5000) {
        console.warn(`[BUILD] ⚠️ Translations JSON is very large (${translationsSizeKB} KB). This may cause issues.`);
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
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey },
        body: formData,
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) { const err = await response.json(); throw new Error(err.error || `خطأ ${response.status}`); }
        throw new Error(`خطأ ${response.status}`);
      }
      setBuildProgress("تحميل الملف...");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0');
      const expandedCount = parseInt(response.headers.get('X-Expanded-Count') || '0');
      const fileSize = parseInt(response.headers.get('X-File-Size') || '0');
      const compressedSize = response.headers.get('X-Compressed-Size');
      
      console.log('[BUILD] Response headers - Modified:', response.headers.get('X-Modified-Count'), 'Expanded:', response.headers.get('X-Expanded-Count'));
      
      let buildStatsData: BuildStats | null = null;
      try { buildStatsData = JSON.parse(decodeURIComponent(response.headers.get('X-Build-Stats') || '{}')); } catch {}
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `arabized_${langFileName}`;
      a.click();
      const expandedMsg = expandedCount > 0 ? ` (${expandedCount} تم توسيعها 📐)` : '';
      setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص${expandedMsg}`);
      setBuildStats({
        modifiedCount,
        expandedCount,
        fileSize,
        compressedSize: compressedSize ? parseInt(compressedSize) : undefined,
        avgBytePercent: buildStatsData?.avgBytePercent || 0,
        maxBytePercent: buildStatsData?.maxBytePercent || 0,
        longest: buildStatsData?.longest || null,
        shortest: buildStatsData?.shortest || null,
        categories: buildStatsData?.categories || {},
      });
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 3000);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 5000);
    }
  };

  return {
    building,
    buildProgress,
    applyingArabic,
    buildStats,
    setBuildStats,
    buildPreview,
    showBuildConfirm,
    setShowBuildConfirm,
    handleApplyArabicProcessing,
    handlePreBuild,
    handleBuild,
  };
}
