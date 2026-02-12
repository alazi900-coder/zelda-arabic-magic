import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Download, Search, FileText, Loader2, Filter } from "lucide-react";

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
  langFile: File;
  dictFile: File;
}

const Editor = () => {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const stored = sessionStorage.getItem("editorState");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Reconstruct translations map
      setState({
        entries: parsed.entries,
        translations: parsed.translations || {},
        langFile: null as any, // will be re-uploaded
        dictFile: null as any,
      });
    }
  }, []);

  // Get unique MSBT file names
  const msbtFiles = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.entries.map(e => e.msbtFile));
    return Array.from(set).sort();
  }, [state?.entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (!state) return [];
    return state.entries.filter(e => {
      const matchSearch = !search ||
        e.original.toLowerCase().includes(search.toLowerCase()) ||
        e.label.includes(search) ||
        (state.translations[`${e.msbtFile}:${e.index}`] || '').includes(search);
      const matchFile = filterFile === "all" || e.msbtFile === filterFile;
      return matchSearch && matchFile;
    });
  }, [state, search, filterFile]);

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

  const handleBuild = async () => {
    if (!state) return;

    // Get files from sessionStorage (stored as base64)
    const langFileB64 = sessionStorage.getItem("editorLangFile");
    const dictFileB64 = sessionStorage.getItem("editorDictFile");
    const langFileName = sessionStorage.getItem("editorLangFileName") || "output.zs";
    const dictFileName = sessionStorage.getItem("editorDictFileName") || "ZsDic.pack.zs";

    if (!langFileB64 || !dictFileB64) {
      alert("يجب إعادة رفع الملفات. يرجى العودة لصفحة المعالجة.");
      navigate("/process");
      return;
    }

    setBuilding(true);
    setBuildProgress("تجهيز الترجمات...");

    try {
      // Reconstruct files from base64
      const langBytes = Uint8Array.from(atob(langFileB64), c => c.charCodeAt(0));
      const dictBytes = Uint8Array.from(atob(dictFileB64), c => c.charCodeAt(0));

      const langBlob = new Blob([langBytes]);
      const dictBlob = new Blob([dictBytes]);

      const formData = new FormData();
      formData.append("langFile", new File([langBlob], langFileName));
      formData.append("dictFile", new File([dictBlob], dictFileName));

      // Only send non-empty translations
      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.translations)) {
        if (v.trim()) nonEmptyTranslations[k] = v;
      }
      formData.append("translations", JSON.stringify(nonEmptyTranslations));

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

      // Download
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
          عدّل النصوص العربية يدوياً ثم اضغط "بناء الملف" لإنتاج الملف النهائي
        </p>

        {/* Stats & Actions Bar */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Card className="flex-1 min-w-[200px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-lg font-display font-bold">{state.entries.length}</p>
                <p className="text-xs text-muted-foreground">نص إجمالي</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[200px]">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="w-5 h-5 text-secondary" />
              <div>
                <p className="text-lg font-display font-bold">{translatedCount}</p>
                <p className="text-xs text-muted-foreground">ترجمة مخصصة</p>
              </div>
            </CardContent>
          </Card>
          <Button
            size="lg"
            onClick={handleBuild}
            disabled={building || translatedCount === 0}
            className="font-display font-bold px-8"
          >
            {building ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري البناء...</>
            ) : (
              <><Download className="w-4 h-4" /> بناء وتحميل الملف</>
            )}
          </Button>
        </div>

        {buildProgress && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center font-display">{buildProgress}</CardContent>
          </Card>
        )}

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
          <div className="bg-muted px-4 py-3 grid grid-cols-[80px_1fr_1fr] gap-3 text-sm font-display font-bold border-b border-border">
            <span>#</span>
            <span>النص الأصلي</span>
            <span>الترجمة العربية</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {filteredEntries.map((entry) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              return (
                <div
                  key={key}
                  className="px-4 py-3 grid grid-cols-[80px_1fr_1fr] gap-3 items-start border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="text-xs text-muted-foreground pt-2">
                    <span className="font-mono">{entry.index}</span>
                    <p className="text-[10px] truncate" title={entry.msbtFile}>
                      {entry.msbtFile.split('/').pop()}
                    </p>
                  </div>
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
