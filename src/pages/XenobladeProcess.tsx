import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, ArrowRight, Loader2, CheckCircle2, Clock, Pencil, Database, Binary } from "lucide-react";

type ProcessingStage = "idle" | "uploading" | "extracting" | "done" | "error";

const stageLabels: Record<ProcessingStage, string> = {
  idle: "في انتظار رفع الملفات",
  uploading: "إرسال الملفات...",
  extracting: "استخراج النصوص...",
  done: "اكتمل بنجاح! ✨",
  error: "حدث خطأ",
};

const stageProgress: Record<ProcessingStage, number> = {
  idle: 0, uploading: 30, extracting: 70, done: 100, error: 0,
};

const XenobladeProcess = () => {
  const [msbtFiles, setMsbtFiles] = useState<File[]>([]);
  const [bdatFiles, setBdatFiles] = useState<File[]>([]);
  const [bdatBinaryFiles, setBdatBinaryFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [autoDetectedCount, setAutoDetectedCount] = useState(0);
  const [mergeMode, setMergeMode] = useState<"fresh" | "merge">("fresh");
  const [hasPreviousSession, setHasPreviousSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { idbGet } = await import("@/lib/idb-storage");
      const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const game = await idbGet<string>("editorGame");
      setHasPreviousSession(!!(game === "xenoblade" && existing?.translations && Object.keys(existing.translations).length > 0));
    })();
  }, []);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString("ar-SA")}] ${msg}`]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    const newMsbt: File[] = [];
    const newBdat: File[] = [];
    const newBdatBin: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name.toLowerCase();
      if (name.endsWith('.msbt')) newMsbt.push(f);
      else if (name.endsWith('.json')) newBdat.push(f);
      else if (name.endsWith('.bdat')) newBdatBin.push(f);
    }
    if (newMsbt.length > 0) setMsbtFiles(prev => [...prev, ...newMsbt]);
    if (newBdat.length > 0) setBdatFiles(prev => [...prev, ...newBdat]);
    if (newBdatBin.length > 0) setBdatBinaryFiles(prev => [...prev, ...newBdatBin]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const removeFile = (type: "msbt" | "bdat" | "bdat-bin", index: number) => {
    if (type === "msbt") setMsbtFiles(prev => prev.filter((_, i) => i !== index));
    else if (type === "bdat") setBdatFiles(prev => prev.filter((_, i) => i !== index));
    else setBdatBinaryFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtract = async () => {
    const totalFiles = msbtFiles.length + bdatFiles.length + bdatBinaryFiles.length;
    if (totalFiles === 0) return;
    setExtracting(true);
    setStage("uploading");
    setLogs([]);
    addLog("🚀 بدء استخراج النصوص...");
    addLog(`📄 MSBT: ${msbtFiles.length} | BDAT JSON: ${bdatFiles.length} | BDAT ثنائي: ${bdatBinaryFiles.length}`);

    try {
      // Process binary BDAT files locally in the browser
      let bdatBinaryEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number; type: string; columnName?: string }[] = [];
      const bdatBinaryBuffers: Record<string, ArrayBuffer> = {};
      
      if (bdatBinaryFiles.length > 0) {
        addLog("🔧 معالجة ملفات BDAT الثنائية محلياً...");
        const { parseBdatFile, extractBdatStrings } = await import("@/lib/bdat-parser");
        const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
        
        for (const file of bdatBinaryFiles) {
          try {
            const buffer = await file.arrayBuffer();
            bdatBinaryBuffers[file.name] = buffer;
            const data = new Uint8Array(buffer);
            const bdatFile = parseBdatFile(data, unhashLabel);
            const strings = extractBdatStrings(bdatFile, file.name);
            
            addLog(`📦 ${file.name}: ${bdatFile.tables.length} جدول، ${strings.length} نص`);
            
            for (let i = 0; i < strings.length; i++) {
              const s = strings[i];
              bdatBinaryEntries.push({
                msbtFile: s.key.split(':').slice(0, 2).join(':'), // bdat-bin:filename
                index: i,
                label: `${s.tableName}[${s.rowIndex}].${s.columnName}`,
                original: s.original,
                maxBytes: 9999,
                type: 'bdat-bin',
                columnName: s.columnName,
              });
            }
          } catch (e) {
            addLog(`⚠️ فشل تحليل ${file.name}: ${e instanceof Error ? e.message : 'خطأ'}`);
          }
        }
      }

      const formData = new FormData();
      for (let i = 0; i < msbtFiles.length; i++) {
        formData.append(`msbt_${i}`, msbtFiles[i]);
      }
      for (let i = 0; i < bdatFiles.length; i++) {
        formData.append(`bdat_${i}`, bdatFiles[i]);
      }

      // Only call server if we have MSBT or JSON BDAT files
      let serverEntries: any[] = [];
      let msbtCount = 0, bdatJsonCount = 0;

      if (msbtFiles.length > 0 || bdatFiles.length > 0) {
        setStage("extracting");
        addLog("📤 إرسال ملفات MSBT/JSON للمعالجة...");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/arabize-xenoblade?mode=extract`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey },
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

        const data = await response.json();
        serverEntries = data.entries || [];
        msbtCount = data.msbtCount || 0;
        bdatJsonCount = data.bdatCount || 0;
      } else {
        setStage("extracting");
      }

      // Merge server entries with local binary BDAT entries
      const allEntries = [...serverEntries, ...bdatBinaryEntries];
      addLog(`✅ تم استخراج ${allEntries.length} نص (${msbtCount} MSBT + ${bdatJsonCount} BDAT JSON + ${bdatBinaryEntries.length} BDAT ثنائي)`);

      // Store files in IndexedDB
      const { idbSet, idbGet, idbClear } = await import("@/lib/idb-storage");

      // Store each MSBT file's buffer
      const fileBuffers: Record<string, ArrayBuffer> = {};
      for (const file of msbtFiles) {
        fileBuffers[file.name] = await file.arrayBuffer();
      }

      // Store BDAT JSON texts
      const bdatTexts: Record<string, string> = {};
      for (const file of bdatFiles) {
        bdatTexts[file.name] = await file.text();
      }

      // Auto-detect Arabic entries
      const autoTranslations: Record<string, string> = {};
      const arabicLetterRegex = /[\u0621-\u064A\u0671-\u06D3\uFB50-\uFDFF\uFE70-\uFEFF]/g;
      for (const entry of allEntries) {
        const stripped = entry.original.replace(/[\uE000-\uF8FF\uFFF9-\uFFFC\u0000-\u001F]/g, '').trim();
        const arabicMatches = stripped.match(arabicLetterRegex);
        if (arabicMatches && arabicMatches.length >= 2) {
          const key = `${entry.msbtFile}:${entry.index}`;
          let cleaned = stripped.normalize("NFKD");
          cleaned = cleaned.split('\n').map((line: string) => {
            const segments: { text: string; isLTR: boolean }[] = [];
            let current = '';
            let currentIsLTR: boolean | null = null;
            for (const ch of line) {
              const code = ch.charCodeAt(0);
              const charIsArabic = (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
              const charIsLTR = /[a-zA-Z0-9]/.test(ch);
              if (charIsArabic) {
                if (currentIsLTR === true && current) { segments.push({ text: current, isLTR: true }); current = ''; }
                currentIsLTR = false; current += ch;
              } else if (charIsLTR) {
                if (currentIsLTR === false && current) { segments.push({ text: current, isLTR: false }); current = ''; }
                currentIsLTR = true; current += ch;
              } else { current += ch; }
            }
            if (current) segments.push({ text: current, isLTR: currentIsLTR === true });
            return segments.reverse().map(seg => seg.isLTR ? seg.text : [...seg.text].reverse().join('')).join('');
          }).join('\n');
          autoTranslations[key] = cleaned;
        }
      }
      setAutoDetectedCount(Object.keys(autoTranslations).length);

      let finalTranslations: Record<string, string> = { ...autoTranslations };

      if (mergeMode === "merge") {
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const existingTranslations = existing?.translations || {};
        const validKeys = new Set(allEntries.map((e: any) => `${e.msbtFile}:${e.index}`));
        for (const [k, v] of Object.entries(existingTranslations)) {
          if (validKeys.has(k) && v && !finalTranslations[k]) finalTranslations[k] = v as string;
        }
      }

      await idbClear();
      await idbSet("editorMsbtFiles", fileBuffers);
      await idbSet("editorMsbtFileNames", msbtFiles.map(f => f.name));
      await idbSet("editorBdatFiles", bdatTexts);
      await idbSet("editorBdatFileNames", bdatFiles.map(f => f.name));
      await idbSet("editorBdatBinaryFiles", bdatBinaryBuffers);
      await idbSet("editorBdatBinaryFileNames", bdatBinaryFiles.map(f => f.name));
      await idbSet("editorGame", "xenoblade");
      await idbSet("editorState", {
        entries: allEntries,
        translations: finalTranslations,
      });

      setStage("done");
      addLog("✨ جاهز للتحرير!");

      setTimeout(() => navigate("/xenoblade/editor"), 500);
    } catch (err) {
      setStage("error");
      addLog(`❌ ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
    } finally {
      setExtracting(false);
    }
  };

  const isProcessing = !["idle", "done", "error"].includes(stage);
  const totalFiles = msbtFiles.length + bdatFiles.length + bdatBinaryFiles.length;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/xenoblade" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </Link>

        <h1 className="text-3xl font-display font-bold mb-2">رفع ملفات زينوبليد 🔮</h1>
        <p className="text-muted-foreground mb-8 font-body">
          ارفع ملفات MSBT و/أو BDAT (ثنائي أو JSON) — يمكنك رفع عدة ملفات دفعة واحدة
        </p>

        {/* MSBT Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`relative flex flex-col items-center justify-center p-10 rounded-xl border-2 border-dashed transition-colors cursor-pointer mb-4
            ${totalFiles > 0 ? "border-[hsl(200,70%,45%)]/50 bg-[hsl(200,70%,45%)]/5" : "border-border hover:border-[hsl(200,70%,45%)]/30 bg-card"}
            ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center gap-6">
            <div className="text-center">
              <FileText className="w-8 h-8 text-[hsl(200,70%,45%)] mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">MSBT</p>
              <p className="text-xs text-muted-foreground">ملفات الحوارات</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="text-center">
              <Binary className="w-8 h-8 text-[hsl(140,60%,40%)] mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">BDAT</p>
              <p className="text-xs text-muted-foreground">ثنائي مباشر</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="text-center">
              <Database className="w-8 h-8 text-[hsl(280,70%,55%)] mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">JSON</p>
              <p className="text-xs text-muted-foreground">جداول محوّلة</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">اسحب وأفلت أو اختر ملفات .msbt و .bdat و .json</p>
          <input
            type="file"
            accept=".msbt,.json,.bdat"
            multiple
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={e => handleFileSelect(e.target.files)}
            disabled={isProcessing}
          />
        </div>

        {/* BDAT Info */}
        <Card className="mb-6 border-[hsl(140,60%,40%)]/20 bg-[hsl(140,60%,40%)]/5">
          <CardContent className="p-4">
            <p className="text-sm font-display font-bold mb-2">📦 دعم BDAT الثنائي المباشر</p>
            <p className="text-xs text-muted-foreground font-body" dir="rtl">
              يمكنك الآن رفع ملفات <code className="bg-background px-1 rounded" dir="ltr">.bdat</code> مباشرة! المحلل الثنائي يستخرج النصوص تلقائياً بدون الحاجة لتحويلها إلى JSON.
              <br />
              كما يمكنك أيضاً رفع ملفات JSON المحوّلة عبر <code className="bg-background px-1 rounded" dir="ltr">bdat-toolset</code>.
            </p>
          </CardContent>
        </Card>

        {/* File Lists */}
        {msbtFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">📄 ملفات MSBT ({msbtFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {msbtFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("msbt", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {bdatFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">🗃️ ملفات BDAT JSON ({bdatFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {bdatFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("bdat", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {bdatBinaryFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">📦 ملفات BDAT ثنائية ({bdatBinaryFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {bdatBinaryFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("bdat-bin", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        {hasPreviousSession && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <button onClick={() => setMergeMode("fresh")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-display font-bold transition-all ${
                mergeMode === "fresh" ? "border-[hsl(200,70%,45%)] bg-[hsl(200,70%,45%)]/10 text-[hsl(200,70%,45%)]" : "border-border text-muted-foreground"
              }`}>
              بدء مشروع جديد
            </button>
            <button onClick={() => setMergeMode("merge")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-display font-bold transition-all ${
                mergeMode === "merge" ? "border-[hsl(200,70%,45%)] bg-[hsl(200,70%,45%)]/10 text-[hsl(200,70%,45%)]" : "border-border text-muted-foreground"
              }`}>
              <CheckCircle2 className="w-4 h-4" />
              دمج مع الترجمات السابقة
            </button>
          </div>
        )}

        {/* Extract Button */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <Button
            size="lg"
            onClick={handleExtract}
            disabled={totalFiles === 0 || isProcessing || extracting}
            className="font-display font-bold text-lg px-10 py-6 bg-[hsl(200,70%,45%)] hover:bg-[hsl(200,70%,45%)]/90 text-white"
          >
            {extracting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> جاري الاستخراج...</>
            ) : (
              <><Pencil className="w-5 h-5" /> استخراج وتحرير ✍️</>
            )}
          </Button>
          {autoDetectedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              تم اكتشاف <span className="font-bold text-[hsl(200,70%,45%)]">{autoDetectedCount}</span> نص معرّب تلقائياً 🎯
            </p>
          )}
        </div>

        {/* Progress */}
        {stage !== "idle" && (
          <Card className={`mb-6 ${stage === "error" ? "border-destructive/50 bg-destructive/5" : stage === "done" ? "border-green-500/50 bg-green-500/5" : ""}`}>
            <CardHeader>
              <CardTitle className="font-display text-lg">{stageLabels[stage]}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={stageProgress[stage]} className="h-3" />
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                <span>{stageProgress[stage]}%</span>
                {isProcessing && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> جاري المعالجة...</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="font-display text-lg">📋 سجل العمليات</CardTitle></CardHeader>
            <CardContent>
              <div className="bg-background rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1 border border-border/40">
                {logs.map((log, i) => (
                  <div key={i} className="text-muted-foreground whitespace-pre-wrap">{log}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default XenobladeProcess;