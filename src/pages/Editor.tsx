import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Download, Search, FileText, Loader2, Filter, Sparkles, Save, Tag, Upload, FileDown, Cloud, CloudUpload, LogIn } from "lucide-react";
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
  protectedEntries?: Set<string>; // entries marked as "skip processing"
}

const AUTOSAVE_DELAY = 1500;
const AI_BATCH_SIZE = 30;

// --- Category system for MSBT files ---
interface FileCategory {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
}

const FILE_CATEGORIES: FileCategory[] = [
  { id: "story", label: "حوارات القصة", emoji: "📖", keywords: ["demo", "event", "scenario", "cutscene", "movie"] },
  { id: "npc", label: "حوارات الشخصيات", emoji: "💬", keywords: ["npc", "talk", "dialog", "shop"] },
  { id: "quest", label: "المهام", emoji: "📜", keywords: ["quest", "mission", "challenge", "minigame"] },
  { id: "weapon", label: "الأسلحة", emoji: "⚔️", keywords: ["weapon", "sword", "bow", "shield", "spear", "lsword", "ssword", "equip", "blade", "arm", "lance", "axe", "club", "rod", "wand", "boomerang"] },
  { id: "armor", label: "المعدات والدروع", emoji: "🛡️", keywords: ["armor", "helm", "equipment", "accessory"] },
  { id: "item", label: "الأدوات والمواد", emoji: "🎒", keywords: ["item", "material", "key", "important", "cook", "recipe", "food", "elixir", "rupee", "ore"] },
  { id: "enemy", label: "الأعداء", emoji: "👹", keywords: ["enemy", "boss", "monster", "guardian", "lynel", "hinox", "moblin"] },
  { id: "ui", label: "القوائم والواجهة", emoji: "🖥️", keywords: ["ui", "menu", "system", "pause", "hud", "button", "option", "setting", "save", "load", "config", "common"] },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️", keywords: ["map", "location", "place", "area", "dungeon", "shrine", "tower", "village", "town", "region"] },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡", keywords: ["tips", "tutorial", "help", "guide", "hint", "loading", "gameover", "gamebalance"] },
  { id: "ability", label: "القدرات والمهارات", emoji: "✨", keywords: ["ability", "skill", "rune", "champion", "sage", "zonai"] },
  { id: "horse", label: "الأحصنة والمراكب", emoji: "🐴", keywords: ["horse", "stable", "vehicle", "paraglider", "raft"] },
  { id: "actor", label: "الممثلون", emoji: "🎭", keywords: ["actor", "profile", "name"] },
];

function categorizeFile(filePath: string): string {
  const lower = filePath.toLowerCase();
  for (const cat of FILE_CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) {
      return cat.id;
    }
  }
  return "other";
}


const Editor = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "translated" | "untranslated">("all");
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
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

  // Load state from IndexedDB
  // Detect already-Arabic entries and auto-populate translations
  const detectPreTranslated = useCallback((editorState: EditorState): Record<string, string> => {
    const arabicRegex = /[\u0600-\u06FF]/;
    const autoTranslations: Record<string, string> = {};
    for (const entry of editorState.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      // Only auto-fill if not already translated
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
        // Auto-detect pre-translated Arabic entries
        const autoTranslations = detectPreTranslated({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(),
        });
        const mergedTranslations = { ...autoTranslations, ...stored.translations };
        
        // Restore protected entries from array to Set
        const protectedSet = new Set(
          Array.isArray(stored.protectedEntries) ? stored.protectedEntries : []
        );

        // Auto-protect newly detected Arabic entries
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

  // Auto-save to IndexedDB on translation changes (debounced)
  const saveToIDB = useCallback(async (editorState: EditorState) => {
    await idbSet("editorState", {
      entries: editorState.entries,
      translations: editorState.translations,
      protectedEntries: Array.from(editorState.protectedEntries || []),
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

  // Category counts and translation progress
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
      
      return matchSearch && matchFile && matchCategory && matchStatus;
    });
  }, [state, search, filterFile, filterCategory, filterStatus]);

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

  // AI Auto-translate
  const handleAutoTranslate = async () => {
    if (!state) return;

    const arabicRegex = /[\u0600-\u06FF]/;

    // Get untranslated entries - skip already-Arabic originals and only from selected category
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory === "all" || categorizeFile(e.msbtFile) === filterCategory;
      const isAlreadyArabic = arabicRegex.test(e.original);
      return matchCategory && e.original.trim() && !isAlreadyArabic && (!state.translations[key] || !state.translations[key].trim());
    });

    if (untranslated.length === 0) {
      setTranslateProgress("✅ كل النصوص مترجمة بالفعل!");
      setTimeout(() => setTranslateProgress(""), 3000);
      return;
    }

    setTranslating(true);
    const totalBatches = Math.ceil(untranslated.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    
    // Create new abort controller for this translation session
    abortControllerRef.current = new AbortController();

    try {
      for (let b = 0; b < totalBatches; b++) {
        // Check if abort was requested
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
          body: JSON.stringify({ entries }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `خطأ ${response.status}`);
        }

        const data = await response.json();
        const batchTranslations = data.translations || {};
        allTranslations = { ...allTranslations, ...batchTranslations };

        // Save immediately after each batch
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
        // Translations already saved per-batch, just show message
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

  // Export translations as JSON
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

  // Import translations from JSON
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

  // Cloud save
  const handleCloudSave = async () => {
    if (!state || !user) return;
    setCloudSyncing(true);
    setCloudStatus("جاري الحفظ في السحابة...");
    try {
      const translated = Object.values(state.translations).filter(v => v.trim() !== '').length;
      // Upsert: check if project exists for this user
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

  // Cloud load
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

        {/* Stats & Actions Bar */}
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

          {/* AI Translate button */}
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
              variant="secondary"
              onClick={handleAutoTranslate}
              disabled={building}
              className="font-display font-bold px-6"
            >
              <><Sparkles className="w-4 h-4" /> ترجمة تلقائية 🤖</>
            </Button>
          )}

          <Button
            size="lg"
            onClick={handleBuild}
            disabled={building || translatedCount === 0}
            className="font-display font-bold px-6"
          >
            {building ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري البناء...</>
            ) : (
              <><Download className="w-4 h-4" /> بناء وتحميل</>
            )}
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={handleProtectAllArabic}
            disabled={building || translating}
            className="font-display font-bold px-6"
          >
            <><Filter className="w-4 h-4" /> حماية النصوص المعربة 🛡️</>
          </Button>

          {/* Export/Import buttons */}
          <Button
            size="lg"
            variant="outline"
            onClick={handleExportTranslations}
            disabled={translatedCount === 0}
            className="font-display font-bold px-4"
          >
            <><FileDown className="w-4 h-4" /> تصدير الترجمات</>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={handleImportTranslations}
            className="font-display font-bold px-4"
          >
            <><Upload className="w-4 h-4" /> استيراد ترجمات</>
          </Button>

          {/* Cloud sync buttons */}
          {user ? (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={handleCloudSave}
                disabled={cloudSyncing || translatedCount === 0}
                className="font-display font-bold px-4 border-primary/30"
              >
                {cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                حفظ في السحابة ☁️
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
            </>
          ) : (
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="font-display font-bold px-4"
            >
              <LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة
            </Button>
          )}
        </div>

        {/* Progress bars */}
        {translateProgress && (
          <Card className="mb-4 border-secondary/30 bg-secondary/5">
            <CardContent className="p-4 text-center font-display">{translateProgress}</CardContent>
          </Card>
        )}
        {buildProgress && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center font-display">{buildProgress}</CardContent>
          </Card>
        )}
        {cloudStatus && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center font-display">{cloudStatus}</CardContent>
          </Card>
        )}

        {/* Auto-save indicator */}
        {lastSaved && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Save className="w-3 h-3" />
            <span>{lastSaved}</span>
          </div>
        )}

        {/* Category Chips */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-display font-bold text-muted-foreground">تصنيف الملفات:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-display font-bold transition-colors border ${
                filterCategory === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              🗂️ الكل ({state.entries.length})
            </button>
            {FILE_CATEGORIES.filter(cat => categoryCounts[cat.id]).map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-display font-bold transition-colors border ${
                  filterCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {cat.emoji} {cat.label} ({categoryProgress[cat.id]?.translated}/{categoryCounts[cat.id]})
              </button>
            ))}
            {categoryCounts["other"] && (
              <button
                onClick={() => setFilterCategory("other")}
                className={`px-3 py-1.5 rounded-full text-xs font-display font-bold transition-colors border ${
                  filterCategory === "other"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                📄 أخرى ({categoryProgress["other"]?.translated}/{categoryCounts["other"]})
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث في النصوص..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 font-body"
              dir="rtl"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="border border-border rounded-md px-3 py-2 bg-background text-sm font-body"
            >
              <option value="all">كل النصوص</option>
              <option value="translated">✅ المترجم فقط ({translatedCount})</option>
              <option value="untranslated">❌ غير المترجم ({state.entries.length - translatedCount})</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterFile}
              onChange={(e) => setFilterFile(e.target.value)}
              className="border border-border rounded-md px-3 py-2 bg-background text-sm font-body"
            >
              <option value="all">كل الملفات ({msbtFiles.length})</option>
              {msbtFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          عرض {filteredEntries.length} من {state.entries.length} نص
        </p>

        {/* Translation Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-3 grid grid-cols-[50px_50px_1fr_1fr] gap-3 text-sm font-display font-bold border-b border-border">
            <span>#</span>
            <span>🛡️</span>
            <span>النص الأصلي</span>
            <span>الترجمة العربية</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {filteredEntries.map((entry) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const isProtected = state?.protectedEntries?.has(key) || false;
              return (
                <div
                  key={key}
                  className="px-4 py-3 grid grid-cols-[50px_50px_1fr_1fr] gap-3 items-start border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="text-xs text-muted-foreground pt-2">
                    <span className="font-mono">{entry.index}</span>
                    <p className="text-[10px] truncate" title={entry.msbtFile}>
                      {entry.msbtFile.split('/').pop()}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleProtection(key)}
                    title={isProtected ? "إزالة الحماية من العكس" : "حماية من عكس النص"}
                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                      isProtected
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
                    }`}
                  >
                    {isProtected ? "🔒" : "🔓"}
                  </button>
                  <div className="text-sm text-muted-foreground py-2 break-words font-body" dir="ltr">
                    {entry.original || <span className="italic text-muted-foreground/50">(فارغ)</span>}
                  </div>
                  <div>
                    <Input
                      value={state.translations[key] || ''}
                      onChange={(e) => updateTranslation(key, e.target.value)}
                      placeholder={entry.original ? "اكتب الترجمة..." : ""}
                      dir="rtl"
                      className="font-body text-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Editor;
