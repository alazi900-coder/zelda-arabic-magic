import { useState } from "react";
import type { IntegrityCheckResult } from "@/components/editor/IntegrityCheckDialog";
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

export interface BdatFileStat {
  fileName: string;
  total: number;
  translated: number;
  hasError?: boolean;
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
  const [bdatFileStats, setBdatFileStats] = useState<BdatFileStat[]>([]);
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null);
  const [showIntegrityDialog, setShowIntegrityDialog] = useState(false);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);


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
      const newBdatFileStats: BdatFileStat[] = [];
      const allOverflowErrors: { fileName: string; key: string; originalBytes: number; translationBytes: number }[] = [];

      if (hasBdatBinary) {
        setBuildProgress("معالجة ملفات BDAT الثنائية محلياً...");
        const { parseBdatFile } = await import("@/lib/bdat-parser");
        const { patchBdatFile } = await import("@/lib/bdat-writer");
        const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
        const { processArabicText, hasArabicPresentationForms: hasPF } = await import("@/lib/arabic-processing");

        const nonEmptyTranslations: Record<string, string> = {};
        for (const [k, v] of Object.entries(state.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }

        // Auto Arabic processing before build
        let autoProcessedCountBin = 0;
        for (const [key, value] of Object.entries(nonEmptyTranslations)) {
          if (!value?.trim()) continue;
          if (hasArabicPresentationForms(value)) continue;
          if (!hasArabicCharsProcessing(value)) continue;
          nonEmptyTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
          autoProcessedCountBin++;
        }
        if (autoProcessedCountBin > 0) {
          setBuildProgress(`✅ تمت معالجة ${autoProcessedCountBin} نص عربي تلقائياً...`);
          await new Promise(r => setTimeout(r, 800));
        }

        for (const fileName of bdatBinaryFileNames!) {
          const buf = bdatBinaryFiles![fileName];
          if (!buf) continue;
          try {
            const data = new Uint8Array(buf);
            const bdatFile = parseBdatFile(data, unhashLabel);

            // NEW KEY FORMAT: "bdat-bin:fileName:tableName:rowIndex:colName:0"
            // Extract translations directly from key structure — no order dependency!
            const translationMap = new Map<string, string>();
            const prefix = `bdat-bin:${fileName}:`;

            let totalExtracted = 0;

            for (const [key, trans] of Object.entries(nonEmptyTranslations)) {
              if (!key.startsWith(prefix)) continue;
              // key = "bdat-bin:fileName:tableName:rowIndex:colName:0"
              const rest = key.slice(prefix.length); // "tableName:rowIndex:colName:0"
              // Remove trailing ":0" (the index suffix)
              const withoutIndex = rest.endsWith(':0') ? rest.slice(0, -2) : rest;
              // withoutIndex = "tableName:rowIndex:colName"
              // Validate it has at least tableName:rowIndex:colName
              const parts = withoutIndex.split(':');
              if (parts.length < 3) continue;

              let processed: string;
              if (hasPF(trans)) {
                processed = trans;
              } else {
                processed = processArabicText(trans, { arabicNumerals, mirrorPunct: mirrorPunctuation });
              }

              // mapKey for bdat-writer is "tableName:rowIndex:colName"
              translationMap.set(withoutIndex, processed);
              localModifiedCount++;
            }

            // Also support legacy key format: "bdat:fileName:index" (old sessions)
            if (translationMap.size === 0) {
              const legacyPrefix = `bdat:${fileName}:`;
              const legacyKeys = Object.keys(nonEmptyTranslations).filter(k => k.startsWith(legacyPrefix));
              if (legacyKeys.length > 0) {
                console.log(`[BUILD-BDAT] ${fileName}: falling back to legacy sequential keys (${legacyKeys.length} found)`);
                const { extractBdatStrings } = await import("@/lib/bdat-parser");
                const extractedStrings = extractBdatStrings(bdatFile, fileName);
                totalExtracted = extractedStrings.length;
                for (let i = 0; i < extractedStrings.length; i++) {
                  const s = extractedStrings[i];
                  const stateKey = `bdat:${fileName}:${i}`;
                  const trans = nonEmptyTranslations[stateKey];
                  if (!trans) continue;
                  let processed: string;
                  if (hasPF(trans)) { processed = trans; }
                  else { processed = processArabicText(trans, { arabicNumerals, mirrorPunct: mirrorPunctuation }); }
                  translationMap.set(`${s.tableName}:${s.rowIndex}:${s.columnName}`, processed);
                  localModifiedCount++;
                }
              }
            }

            // Count total strings for stats (parse if not already done)
            if (totalExtracted === 0) {
              const { extractBdatStrings } = await import("@/lib/bdat-parser");
              totalExtracted = extractBdatStrings(bdatFile, fileName).length;
            }

            // Record per-file stats
            newBdatFileStats.push({
              fileName,
              total: totalExtracted,
              translated: translationMap.size,
            });

            console.log(`[BUILD-BDAT] ${fileName}: ${totalExtracted} strings total, ${translationMap.size} translations applied`);
            if (translationMap.size > 0) {
              console.log(`[BUILD-BDAT] ${fileName}: sample map keys:`, [...translationMap.keys()].slice(0, 3));
            }

            if (translationMap.size > 0) {
              const { result: patched, overflowErrors, patchedCount, skippedCount } = patchBdatFile(bdatFile, translationMap);
              localBdatResults.push({ name: fileName, data: patched });
              // Collect overflow errors for reporting
              for (const e of overflowErrors) {
                allOverflowErrors.push({ fileName, ...e });
              }
              if (overflowErrors.length > 0) {
                console.warn(`[BDAT-PATCH] ${fileName}: ${patchedCount} patched, ${skippedCount} skipped (overflow):`, overflowErrors.slice(0, 5));
              } else {
                console.log(`[BDAT-PATCH] ${fileName}: ${patchedCount} patched successfully`);
              }
              localModifiedCount += patchedCount;
            } else {
              localBdatResults.push({ name: fileName, data });
            }
          } catch (e) {
            console.warn(`Failed to rebuild BDAT ${fileName}:`, e);
            newBdatFileStats.push({ fileName, total: 0, translated: 0, hasError: true });
            localBdatResults.push({ name: fileName, data: new Uint8Array(buf) });
          }
        }

        // Update stats state so UI can display per-file breakdown
        setBdatFileStats(newBdatFileStats);
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

        // Auto Arabic processing before build
        let autoProcessedCountMsbt = 0;
        for (const [key, value] of Object.entries(nonEmptyTranslations)) {
          if (!value?.trim()) continue;
          if (hasArabicPresentationForms(value)) continue;
          if (!hasArabicCharsProcessing(value)) continue;
          nonEmptyTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
          autoProcessedCountMsbt++;
        }
        if (autoProcessedCountMsbt > 0) {
          setBuildProgress(`✅ تمت معالجة ${autoProcessedCountMsbt} نص عربي تلقائياً...`);
          await new Promise(r => setTimeout(r, 800));
        }
        
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
        
        // Pack everything into a single ZIP (server ZIP + local BDAT results)
        if (localBdatResults.length > 0) {
          setBuildProgress(`دمج ${localBdatResults.length} ملف BDAT مع ملفات MSBT في ZIP واحد...`);
          const JSZip = (await import("jszip")).default;
          // Load the server ZIP so we can merge it
          const serverZip = await JSZip.loadAsync(blob);
          for (const result of localBdatResults) {
            const cleanName = result.name.replace(/\.(txt|bin)$/i, "");
            const finalName = cleanName.endsWith(".bdat") ? cleanName : cleanName + ".bdat";
            serverZip.file(finalName, result.data);
          }
          const mergedBlob = await serverZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
          const mergedUrl = URL.createObjectURL(mergedBlob);
          const a = document.createElement("a");
          a.href = mergedUrl;
          a.download = "xenoblade_arabized.zip";
          a.click();
          URL.revokeObjectURL(mergedUrl);
          const overflowSummary = allOverflowErrors.length > 0
            ? ` ⚠️ ${allOverflowErrors.length} نص تجاوز الحجم وتم تخطيه`
            : '';
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص — جميع الملفات في ZIP واحد${overflowSummary}`);
        } else {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "xenoblade_arabized.zip";
          a.click();
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص — الملفات في ملف ZIP`);
        }
      } else if (localBdatResults.length > 0) {
        // Only binary BDAT files → pack ALL into a single ZIP
        setBuildProgress(`تجميع ${localBdatResults.length} ملف BDAT في ZIP...`);
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const result of localBdatResults) {
          const cleanName = result.name.replace(/\.(txt|bin)$/i, "");
          const finalName = cleanName.endsWith(".bdat") ? cleanName : cleanName + ".bdat";
          zip.file(finalName, result.data);
        }
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = "xenoblade_arabized_bdat.zip";
        a.click();
        URL.revokeObjectURL(zipUrl);
        const overflowSummary = allOverflowErrors.length > 0
          ? ` ⚠️ ${allOverflowErrors.length} نص تجاوز الحجم الأصلي وتم تخطيه`
          : '';
        setBuildProgress(`✅ تم بنجاح! ${localBdatResults.length} ملف BDAT في ZIP — تم تطبيق ${localModifiedCount} نص${overflowSummary}`);
      }
      
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 3000);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 5000);
    }
  };

  const handleCheckIntegrity = async () => {
    if (!state) return;
    setCheckingIntegrity(true);
    setShowIntegrityDialog(true);

    try {
      const { idbGet } = await import("@/lib/idb-storage");
      const bdatBinaryFiles = await idbGet<Record<string, ArrayBuffer>>("editorBdatBinaryFiles");
      const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");

      // All translated (non-empty) keys
      const allTransKeys = Object.keys(state.translations).filter(k => state.translations[k]?.trim());
      // All entry keys (including untranslated) — used to count total extracted strings per file
      const allEntryKeys = state.entries
        ? state.entries.map(e => `${e.msbtFile}:${e.index}`)
        : Object.keys(state.translations);

      // Collect unique filenames from entry keys + translated keys
      const newFormatFiles = new Set<string>();
      const oldFormatFiles = new Set<string>();

      const collectFileNames = (keys: string[]) => {
        for (const key of keys) {
          if (key.startsWith('bdat-bin:')) {
            const parts = key.split(':');
            if (parts.length >= 2) newFormatFiles.add(parts[1]);
          } else if (key.startsWith('bdat:')) {
            const parts = key.split(':');
            if (parts.length >= 2) oldFormatFiles.add(parts[1]);
          }
        }
      };
      collectFileNames(allEntryKeys);
      collectFileNames(allTransKeys);

      const allFileNames = new Set([
        ...Array.from(newFormatFiles),
        ...Array.from(oldFormatFiles),
        ...(bdatBinaryFileNames || []),
      ]);

      const files: IntegrityCheckResult['files'] = [];
      let totalWillApply = 0;
      let totalOrphaned = 0;
      let hasLegacy = false;

      for (const fileName of Array.from(allFileNames)) {
        const fileExists = !!(bdatBinaryFiles && bdatBinaryFiles[fileName]);
        const isLegacyFormat = oldFormatFiles.has(fileName) && !newFormatFiles.has(fileName);
        if (isLegacyFormat) hasLegacy = true;

        const prefix = `bdat-bin:${fileName}:`;

        // Count translated (non-empty) for this file
        const matched = allTransKeys.filter(k => k.startsWith(prefix)).length;

        // Count total entries loaded for this file (translated + untranslated)
        const totalLoaded = allEntryKeys.filter(k => k.startsWith(prefix)).length;

        // Count orphaned old-format keys
        const oldPrefix = `bdat:${fileName}:`;
        const orphanedCount = (!fileExists && isLegacyFormat)
          ? allTransKeys.filter(k => k.startsWith(oldPrefix)).length
          : 0;

        // Total = from loaded entries; fallback to re-parsing IDB file
        let total = totalLoaded;
        if (total === 0 && fileExists && bdatBinaryFiles![fileName]) {
          try {
            const { parseBdatFile, extractBdatStrings } = await import("@/lib/bdat-parser");
            const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
            const data = new Uint8Array(bdatBinaryFiles![fileName]);
            const bdatFile = parseBdatFile(data, unhashLabel);
            total = extractBdatStrings(bdatFile, fileName).length;
          } catch { total = 0; }
        }

        files.push({ fileName, matched, total, orphaned: orphanedCount, isLegacyFormat, fileExists });

        if (fileExists && !isLegacyFormat) totalWillApply += matched;
        if (!fileExists || isLegacyFormat) totalOrphaned += isLegacyFormat
          ? allTransKeys.filter(k => k.startsWith(`bdat:${fileName}:`)).length
          : 0;
      }

      // Count MSBT/other translated entries too
      const msbtTranslated = allTransKeys.filter(k => !k.startsWith('bdat-bin:') && !k.startsWith('bdat:')).length;
      if (msbtTranslated > 0) totalWillApply += msbtTranslated;

      const isHealthy = files.length > 0
        && !hasLegacy
        && files.every(f => f.fileExists)
        && files.some(f => f.matched > 0);

      setIntegrityResult({
        files: files.sort((a, b) => b.matched - a.matched),
        willApply: totalWillApply,
        orphaned: totalOrphaned,
        hasLegacy,
        isHealthy,
      });
    } catch (e) {
      console.error('[INTEGRITY]', e);
      setIntegrityResult({ files: [], willApply: 0, orphaned: 0, hasLegacy: false, isHealthy: false });
    } finally {
      setCheckingIntegrity(false);
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
    bdatFileStats,
    integrityResult,
    showIntegrityDialog,
    setShowIntegrityDialog,
    checkingIntegrity,
    handleApplyArabicProcessing,
    handlePreBuild,
    handleBuild,
    handleCheckIntegrity,
  };
}

