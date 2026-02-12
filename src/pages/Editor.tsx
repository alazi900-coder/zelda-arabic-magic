import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Download, Search, FileText, Loader2, Filter, Sparkles, Save, Tag, Upload, FileDown, Cloud, CloudUpload, LogIn, BookOpen, AlertTriangle, Eye, EyeOff, RotateCcw } from "lucide-react";
import ZeldaDialoguePreview from "@/components/ZeldaDialoguePreview";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ExtractedEntry {
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  maxBytes: number;
}

interface EditorState {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries?: Set<string>;
  glossary?: string;
  technicalBypass?: Set<string>;
}

const AUTOSAVE_DELAY = 1500;
const AI_BATCH_SIZE = 30;

interface FileCategory {
  id: string;
  label: string;
  emoji: string;
}

const FILE_CATEGORIES: FileCategory[] = [
  { id: "inventory", label: "الأسلحة والأدوات والمواد", emoji: "🎒" },
  { id: "ui", label: "القوائم والواجهة", emoji: "🖥️" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜" },
  { id: "story", label: "حوارات القصة والمهام", emoji: "📖" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡" },
  { id: "character", label: "أسماء الشخصيات والأعداء", emoji: "🎭" },
];

function categorizeFile(filePath: string): string {
  if (/ActorMsg\/PouchContent\.msbt/i.test(filePath)) return "inventory";
  if (/LayoutMsg\//i.test(filePath)) return "ui";
  if (/ChallengeMsg\//i.test(filePath)) return "challenge";
  if (/EventFlowMsg\//i.test(filePath)) return "story";
  if (/LocationMsg\//i.test(filePath)) return "map";
  if (/StaticMsg\/(Tips|GuideKeyIcon)\.msbt/i.test(filePath)) return "tips";
  if (/ActorMsg\//i.test(filePath)) return "character";
  return "other";
}

// Same algorithm as reverseBidi in edge function - reversing twice restores original
function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function unReverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = '';
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = '';
        }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      return [...seg.text].reverse().join('');
    }).join('');
  }).join('\n');
}

function hasArabicChars(text: string): boolean {
  return [...text].some(ch => isArabicChar(ch));
}

function isTechnicalText(text: string): boolean {
  if (/^[0-9A-Fa-f\-\._:\/]+$/.test(text.trim())) return true;
  if (/\[[^\]]*\]/.test(text) && text.length < 50) return true;
  if (/<[^>]+>/.test(text)) return true;
  if (/[\\/][\w\-]+[\\/]/i.test(text)) return true;
  if (text.length < 10 && /[{}()\[\]<>|&%$#@!]/.test(text)) return true;
  if (/^[a-z]+([A-Z][a-z]*)+$|^[a-z]+(_[a-z]+)+$/.test(text.trim())) return true;
  return false;
}

const Editor = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "translated" | "untranslated">("all");
  const [filterTechnical, setFilterTechnical] = useState<"all" | "only" | "exclude">("all");
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [technicalEditingMode, setTechnicalEditingMode] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();

  const toggleProtection = (key: string) => {
    if (!state) return;
    const newProtected = new Set(state.protectedEntries || []);
    if (newProtected.has(key)) {
      newProtected.delete(key);
    } else {
      newProtected.add(key);
    }
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
  };

  const toggleTechnicalBypass = (key: string) => {
    if (!state) return;
    const newBypass = new Set(state.technicalBypass || []);
    if (newBypass.has(key)) {
      newBypass.delete(key);
    } else {
      newBypass.add(key);
    }
    setState(prev => prev ? { ...prev, technicalBypass: newBypass } : null);
  };

  const handleProtectAllArabic = () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
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
    let count = 0;

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const hasTranslation = newTranslations[key]?.trim();
      if (!hasTranslation && hasArabicChars(entry.original)) {
        newTranslations[key] = unReverseBidi(entry.original);
        newProtected.add(key);
        count++;
      }
    }

    setState(prev => prev ? {
      ...prev,
      translations: newTranslations,
      protectedEntries: newProtected,
    } : null);
    setLastSaved(`✅ تم تصحيح ${count} نص عربي معكوس`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const detectPreTranslated = useCallback((editorState: EditorState): Record<string, string> => {
    const arabicRegex = /[\u0600-\u06FF]/;
    const autoTranslations: Record<string, string> = {};
    for (const entry of editorState.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!editorState.translations[key]?.trim() && arabicRegex.test(entry.original)) {
        autoTranslations[key] = entry.original;
      }
    }
    return autoTranslations;
  }, []);

  useEffect(() => {
    const loadState = async () => {
      const stored = await idbGet<EditorState>("editorState");
      if (stored) {
        const autoTranslations = detectPreTranslated({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(),
        });
        const mergedTranslations = { ...autoTranslations, ...stored.translations };
        
        const protectedSet = new Set<string>(
          Array.isArray(stored.protectedEntries) ? (stored.protectedEntries as string[]) : []
        );

        const bypassSet = new Set<string>(
          Array.isArray((stored as any).technicalBypass) ? ((stored as any).technicalBypass as string[]) : []
        );

        const arabicRegex = /[\u0600-\u06FF]/;
        for (const entry of stored.entries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          if (arabicRegex.test(entry.original)) {
            protectedSet.add(key);
          }
        }
        
        setState({
          entries: stored.entries,
          translations: mergedTranslations,
          protectedEntries: protectedSet,
          technicalBypass: bypassSet,
        });

        const autoCount = Object.keys(autoTranslations).length;
        setLastSaved(autoCount > 0 
          ? `تم التحميل + اكتشاف ${autoCount} نص معرّب مسبقاً`
          : "تم التحميل من الحفظ السابق"
        );
      }
    };
    loadState();
  }, [detectPreTranslated]);


  const saveToIDB = useCallback(async (editorState: EditorState) => {
    await idbSet("editorState", {
      entries: editorState.entries,
      translations: editorState.translations,
      protectedEntries: Array.from(editorState.protectedEntries || []),
      technicalBypass: Array.from(editorState.technicalBypass || []),
    });
    setLastSaved(`آخر حفظ: ${new Date().toLocaleTimeString("ar-SA")}`);
  }, []);

  useEffect(() => {
    if (!state) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToIDB(state), AUTOSAVE_DELAY);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state?.translations, saveToIDB]);

  const msbtFiles = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.entries.map(e => e.msbtFile));
    return Array.from(set).sort();
  }, [state?.entries]);

  const categoryCounts = useMemo(() => {
    if (!state) return {};
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const cat = categorizeFile(e.msbtFile);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [state?.entries]);

  const categoryProgress = useMemo(() => {
    if (!state) return {};
    const progress: Record<string, { translated: number; total: number }> = {};
    
    for (const cat of FILE_CATEGORIES) {
      progress[cat.id] = { translated: 0, total: 0 };
    }
    progress["other"] = { translated: 0, total: 0 };

    for (const e of state.entries) {
      const cat = categorizeFile(e.msbtFile);
      const key = `${e.msbtFile}:${e.index}`;
      const isTranslated = state.translations[key] && state.translations[key].trim() !== '';
      
      progress[cat].total += 1;
      if (isTranslated) progress[cat].translated += 1;
    }
    
    return progress;
  }, [state?.entries, state?.translations]);

  const filteredEntries = useMemo(() => {
    if (!state) return [];
    return state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const isTranslated = state.translations[key] && state.translations[key].trim() !== '';
      const isTechnical = isTechnicalText(e.original);
      
      const matchSearch = !search ||
        e.original.toLowerCase().includes(search.toLowerCase()) ||
        e.label.includes(search) ||
        (state.translations[key] || '').includes(search);
      const matchFile = filterFile === "all" || e.msbtFile === filterFile;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      const matchStatus = 
        filterStatus === "all" || 
        (filterStatus === "translated" && isTranslated) ||
        (filterStatus === "untranslated" && !isTranslated);
      const matchTechnical = 
        filterTechnical === "all" ||
        (filterTechnical === "only" && isTechnical) ||
        (filterTechnical === "exclude" && !isTechnical);
      
      return matchSearch && matchFile && matchCategory && matchStatus && matchTechnical;
    });
  }, [state, search, filterFile, filterCategory, filterStatus, filterTechnical]);

  const updateTranslation = (key: string, value: string) => {
    if (!state) return;
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: value },
    } : null);
  };

  const translatedCount = useMemo(() => {
    if (!state) return 0;
    return Object.values(state.translations).filter(v => v.trim() !== '').length;
  }, [state?.translations]);

  const handleAutoTranslate = async () => {
    if (!state) return;


    const arabicRegex = /[\u0600-\u06FF]/;
    
    // Debug: count why entries are skipped
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0, skipCategory = 0;
    
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      if (!matchCategory) { skipCategory++; return false; }
      if (!e.original.trim()) { skipEmpty++; return false; }
      
      const isAlreadyArabic = arabicRegex.test(e.original);
      const isTechnical = isTechnicalText(e.original);
      const bypassKey = `${e.msbtFile}:${e.index}`;
      const hasBypass = state.technicalBypass?.has(bypassKey);
      
      if (isAlreadyArabic) { skipArabic++; return false; }
      if (isTechnical && !hasBypass) { skipTechnical++; return false; }
      if (state.translations[key] && state.translations[key].trim()) { skipTranslated++; return false; }
      
      return true;
    });

    console.log(`[ترجمة تلقائية] إجمالي: ${state.entries.length}, متخطى: فئة=${skipCategory}, فارغ=${skipEmpty}, عربي=${skipArabic}, تقني=${skipTechnical}, مترجم=${skipTranslated}, متبقي للترجمة: ${untranslated.length}`);

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

    setTranslating(true);
    const totalBatches = Math.ceil(untranslated.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    
    abortControllerRef.current = new AbortController();

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }

        const batch = untranslated.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`جاري ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

        const entries = batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
        }));

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ entries, glossary: state.glossary || '' }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `خطأ ${response.status}`);
        }

        const data = await response.json();
        const batchTranslations = data.translations || {};
        allTranslations = { ...allTranslations, ...batchTranslations };

        if (Object.keys(batchTranslations).length > 0) {
          setState(prev => {
            if (!prev) return null;
            return {
              ...prev,
              translations: { ...prev.translations, ...batchTranslations },
            };
          });
        }
      }

      const count = Object.keys(allTranslations).length;
      if (count > 0) {
        setTranslateProgress(`✅ تمت ترجمة ${count} نص بنجاح!`);
      }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const savedCount = Object.keys(allTranslations).length;
        if (savedCount > 0) {
          setTranslateProgress(`⏹️ تم إيقاف الترجمة - تم حفظ ${savedCount} نص مترجم`);
        } else {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
        }
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

  const handleStopTranslate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleExportTranslations = () => {
    if (!state) return;
    const data = JSON.stringify(state.translations, null, 2);
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
        setState(prev => {
          if (!prev) return null;
          return { ...prev, translations: { ...prev.translations, ...imported } };
        });
        setLastSaved(`✅ تم استيراد ${Object.keys(imported).length} ترجمة`);
      } catch {
        alert('ملف JSON غير صالح');
      }
    };
    input.click();
  };

  const handleImportGlossary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setState(prev => prev ? { ...prev, glossary: text } : null);
        setLastSaved(`📖 تم تحميل قاموس المصطلحات (${file.name})`);
        setTimeout(() => setLastSaved(""), 3000);
      } catch {
        alert('خطأ في قراءة الملف');
      }
    };
    input.click();
  };

  const handleLoadDefaultGlossary = async () => {
    try {
      const response = await fetch('/zelda-glossary.txt');
      if (!response.ok) throw new Error('فشل تحميل القاموس');
      const text = await response.text();
      setState(prev => prev ? { ...prev, glossary: text } : null);
      const termCount = text.split('\n').filter(l => l.includes('=')).length;
      setLastSaved(`📖 تم تحميل القاموس الافتراضي (${termCount} مصطلح)`);
      setTimeout(() => setLastSaved(""), 3000);
    } catch {
      alert('خطأ في تحميل القاموس الافتراضي');
    }
  };

  const handleCloudSave = async () => {
    if (!state || !user) return;
    
    
    setCloudSyncing(true);
    setCloudStatus("جاري الحفظ في السحابة...");
    try {
      const translated = Object.values(state.translations).filter(v => v.trim() !== '').length;
      const { data: existing } = await supabase
        .from('translation_projects')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('translation_projects')
          .update({
            translations: state.translations,
            entry_count: state.entries.length,
            translated_count: translated,
          })
          .eq('id', existing[0].id);
      } else {
        await supabase
          .from('translation_projects')
          .insert({
            user_id: user.id,
            translations: state.translations,
            entry_count: state.entries.length,
            translated_count: translated,
          });
      }
      setCloudStatus("☁️ تم الحفظ في السحابة بنجاح!");
    } catch (err) {
      setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في الحفظ'}`);
    } finally {
      setCloudSyncing(false);
      setTimeout(() => setCloudStatus(""), 4000);
    }
  };

  const handleCloudLoad = async () => {
    if (!user) return;
    
    
    setCloudSyncing(true);
    setCloudStatus("جاري التحميل من السحابة...");
    try {
      const { data, error } = await supabase
        .from('translation_projects')
        .select('translations')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setCloudStatus("لا توجد ترجمات محفوظة في السحابة");
        setTimeout(() => setCloudStatus(""), 3000);
        return;
      }

      const cloudTranslations = data.translations as Record<string, string>;
      setState(prev => {
        if (!prev) return null;
        return { ...prev, translations: { ...prev.translations, ...cloudTranslations } };
      });
      setCloudStatus(`☁️ تم تحميل ${Object.keys(cloudTranslations).length} ترجمة من السحابة`);
    } catch (err) {
      setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في التحميل'}`);
    } finally {
      setCloudSyncing(false);
      setTimeout(() => setCloudStatus(""), 4000);
    }
  };

  const handleBuild = async () => {
    if (!state) return;

    const langBuf = await idbGet<ArrayBuffer>("editorLangFile");
    const dictBuf = await idbGet<ArrayBuffer>("editorDictFile");
    const langFileName = (await idbGet<string>("editorLangFileName")) || "output.zs";

    if (!langBuf || !dictBuf) {
      alert("يجب إعادة رفع الملفات. يرجى العودة لصفحة المعالجة.");
      navigate("/process");
      return;
    }

    setBuilding(true);
    setBuildProgress("تجهيز الترجمات...");

    try {
      const formData = new FormData();
      formData.append("langFile", new File([new Uint8Array(langBuf)], langFileName));
      formData.append("dictFile", new File([new Uint8Array(dictBuf)], (await idbGet<string>("editorDictFileName")) || "ZsDic.pack.zs"));

      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.translations)) {
        if (v.trim()) nonEmptyTranslations[k] = v;
      }
      formData.append("translations", JSON.stringify(nonEmptyTranslations));
      formData.append("protectedEntries", JSON.stringify(Array.from(state.protectedEntries || [])));

      setBuildProgress("إرسال للمعالجة...");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/arabize?mode=build`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const err = await response.json();
          throw new Error(err.error || `خطأ ${response.status}`);
        }
        throw new Error(`خطأ ${response.status}`);
      }

      setBuildProgress("تحميل الملف...");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0');

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `arabized_${langFileName}`;
      a.click();

      setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 3000);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => { setBuilding(false); setBuildProgress(""); }, 5000);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-muted-foreground mb-4">لا توجد بيانات للتحرير. يرجى استخراج النصوص أولاً.</p>
          <Link to="/process">
            <Button className="font-display">اذهب لصفحة المعالجة</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <Link to="/process" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للمعالجة
        </Link>

        <h1 className="text-3xl font-display font-bold mb-2">محرر الترجمة ✍️</h1>
        <p className="text-muted-foreground mb-6 font-body">
          عدّل النصوص العربية يدوياً أو استخدم الترجمة التلقائية بالذكاء الاصطناعي
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-lg font-display font-bold">{state.entries.length}</p>
                <p className="text-xs text-muted-foreground">نص إجمالي</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-secondary" />
              <div>
                <p className="text-lg font-display font-bold">{translatedCount}</p>
                <p className="text-xs text-muted-foreground">مترجم</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-destructive" />
              <div>
                <p className="text-lg font-display font-bold">{state.entries.length - translatedCount}</p>
                <p className="text-xs text-muted-foreground">غير مترجم</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="flex items-center gap-3 p-4">
              <Tag className="w-5 h-5 text-accent" />
              <div>
                <p className="text-lg font-display font-bold">{state.protectedEntries?.size || 0} / {state.entries.length}</p>
                <p className="text-xs text-muted-foreground">محمي من العكس</p>
              </div>
            </CardContent>
          </Card>

          {translating ? (
            <Button
              size="lg"
              variant="destructive"
              onClick={handleStopTranslate}
              className="font-display font-bold px-6"
            >
              <><Loader2 className="w-4 h-4 animate-spin" /> إيقاف الترجمة ⏹️</>
            </Button>
          ) : (
            <Button
              size="lg"
              variant="default"
              onClick={handleAutoTranslate}
              disabled={translating}
              className="font-display font-bold px-6"
            >
              <Sparkles className="w-4 h-4" /> ترجمة تلقائية 🤖
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-display font-bold text-foreground">
              نسبة الإنجاز
            </span>
            <span className="text-sm font-body text-muted-foreground">
              {translatedCount} / {state.entries.length} ({state.entries.length > 0 ? Math.round((translatedCount / state.entries.length) * 100) : 0}%)
            </span>
          </div>
          <Progress 
            value={state.entries.length > 0 ? (translatedCount / state.entries.length) * 100 : 0}
            className="h-2.5"
          />
        </div>

        {/* Status Messages */}
        {lastSaved && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{lastSaved}</CardContent>
          </Card>
        )}
        
        {translateProgress && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{translateProgress}</CardContent>
          </Card>
        )}

        {buildProgress && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{buildProgress}</CardContent>
          </Card>
        )}


        {cloudStatus && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center font-display">{cloudStatus}</CardContent>
          </Card>
        )}

        {!user && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة
            </CardContent>
          </Card>
        )}

        {state && (
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-lg border border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {FILE_CATEGORIES.map(cat => {
                const prog = categoryProgress[cat.id];
                const pct = prog?.total ? Math.round((prog.translated / prog.total) * 100) : 0;
                return (
                  <div key={cat.id} className="p-3 bg-card rounded border border-border/50">
                    <p className="text-sm font-bold mb-2">{cat.emoji} {cat.label}</p>
                    <Progress value={pct} className="h-2 mb-1" />
                    <p className="text-xs text-muted-foreground text-center">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-6 p-4 bg-card rounded border border-border flex flex-wrap gap-3 items-center">
          <Input
            placeholder="ابحث عن نصوص..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] font-body"
          />
          <select
            value={filterFile}
            onChange={(e) => setFilterFile(e.target.value)}
            className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
          >
            <option value="all">كل الملفات</option>
            {msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
          >
            <option value="all">كل الفئات</option>
            {FILE_CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 rounded bg-background border border-border font-body text-sm"
          >
            <option value="all">الكل</option>
            <option value="translated">مترجم</option>
            <option value="untranslated">غير مترجم</option>
          </select>
        </div>

        {/* Cloud Actions */}
        {user && (
          <div className="mb-6 flex gap-3 flex-wrap">
            <Button
              size="lg"
              variant="outline"
              onClick={handleCloudSave}
              disabled={cloudSyncing || translatedCount === 0}
              className="font-display font-bold px-4 border-primary/30"
            >
              <CloudUpload className="w-4 h-4" /> حفظ في السحابة
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCloudLoad}
              disabled={cloudSyncing}
              className="font-display font-bold px-4 border-primary/30"
            >
              <Cloud className="w-4 h-4" /> تحميل من السحابة
            </Button>
          </div>
        )}

        {/* Export/Import Actions */}
        <div className="mb-6 flex gap-3 flex-wrap">
          <Button variant="outline" onClick={handleExportTranslations} className="font-body">
            <Download className="w-4 h-4" /> تصدير JSON
          </Button>
          <Button variant="outline" onClick={handleImportTranslations} className="font-body">
            <Upload className="w-4 h-4" /> استيراد JSON
          </Button>
          <Button variant="outline" onClick={handleImportGlossary} className="font-body">
            <BookOpen className="w-4 h-4" /> تحميل قاموس
          </Button>
          <Button variant="outline" onClick={handleLoadDefaultGlossary} className="font-body border-primary/30 text-primary hover:text-primary">
            📖 القاموس الافتراضي
          </Button>
          <Button variant="outline" onClick={handleFixAllReversed} className="font-body border-accent/30 text-accent hover:text-accent">
            <RotateCcw className="w-4 h-4" /> تصحيح الكل (عربي معكوس)
          </Button>
        </div>

        {/* Build Button */}
        <Button
          size="lg"
          onClick={handleBuild}
          disabled={building}
          className="w-full font-display font-bold mb-6"
        >
          {building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
          بناء الملف النهائي
        </Button>

        {/* Entries List */}
        <div className="space-y-2">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد نصوص مطابقة</p>
          ) : (
            filteredEntries.map((entry, idx) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const translation = state?.translations[key] || '';
              const isProtected = state?.protectedEntries?.has(key);
              const isTechnical = isTechnicalText(entry.original);
              
              return (
                <Card key={idx} className="p-4 border-border/50 hover:border-border transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">{entry.msbtFile} • {entry.label}</p>
                      <p className="font-body text-sm mb-2">{entry.original}</p>
                      {isTechnical && (
                        <p className="text-xs text-accent mb-2">⚠️ نص تقني - تحتاج حذر في الترجمة</p>
                      )}
                      {!translation && hasArabicChars(entry.original) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFixReversed(entry)}
                          className="text-xs text-accent mb-2 h-7 px-2"
                        >
                          <RotateCcw className="w-3 h-3" /> تصحيح المعكوس
                        </Button>
                      )}
                      <input
                        type="text"
                        value={translation}
                        onChange={(e) => updateTranslation(key, e.target.value)}
                        placeholder="أدخل الترجمة..."
                        className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
                      />
                    </div>
                    <div className="flex gap-1">
                      {isProtected && <Tag className="w-5 h-5 text-accent" />}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Editor;
