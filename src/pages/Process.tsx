import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileArchive, ArrowRight, Loader2 } from "lucide-react";

type ProcessingStage = "idle" | "decompressing" | "extracting" | "reshaping" | "repacking" | "done" | "error";

const stageLabels: Record<ProcessingStage, string> = {
  idle: "في انتظار رفع الملفات",
  decompressing: "فك الضغط (Zstandard)...",
  extracting: "استخراج SARC...",
  reshaping: "معالجة النصوص العربية...",
  repacking: "إعادة الحزم والضغط...",
  done: "اكتمل!",
  error: "حدث خطأ",
};

const stageProgress: Record<ProcessingStage, number> = {
  idle: 0, decompressing: 20, extracting: 40, reshaping: 65, repacking: 85, done: 100, error: 0,
};

const Process = () => {
  const [langFile, setLangFile] = useState<File | null>(null);
  const [dictFile, setDictFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [resultData, setResultData] = useState<{ modifiedCount: number; fileSize: number; downloadUrl: string } | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString("ar-SA")}] ${msg}`]);

  const handleDrop = useCallback((e: React.DragEvent, setter: (f: File) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setter(file);
  }, []);

  const startProcessing = async () => {
    if (!langFile || !dictFile) return;

    setStage("decompressing");
    setLogs([]);
    addLog("بدء العملية...");

    try {
      const formData = new FormData();
      formData.append("langFile", langFile);
      formData.append("dictFile", dictFile);

      addLog("رفع الملفات للمعالجة...");

      // TODO: Replace with actual edge function URL once Cloud is enabled
      const response = await fetch("/api/arabize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("فشل في المعالجة");

      // Simulate stages for now
      for (const s of ["decompressing", "extracting", "reshaping", "repacking", "done"] as ProcessingStage[]) {
        setStage(s);
        addLog(stageLabels[s]);
        await new Promise((r) => setTimeout(r, 800));
      }

      setResultData({ modifiedCount: 0, fileSize: 0, downloadUrl: "" });
    } catch (err) {
      setStage("error");
      addLog(`خطأ: ${err instanceof Error ? err.message : "غير معروف"}`);
    }
  };

  const isProcessing = !["idle", "done", "error"].includes(stage);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </Link>

        <h1 className="text-3xl font-display font-bold mb-8">رفع الملفات والمعالجة</h1>

        {/* File Upload */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <FileDropZone
            label="ملف اللغة (.zs)"
            file={langFile}
            onDrop={(e) => handleDrop(e, setLangFile)}
            onSelect={(f) => setLangFile(f)}
            accept=".zs"
            icon={<FileArchive className="w-8 h-8 text-primary" />}
            disabled={isProcessing}
          />
          <FileDropZone
            label="ملف القاموس (ZsDic.pack.zs)"
            file={dictFile}
            onDrop={(e) => handleDrop(e, setDictFile)}
            onSelect={(f) => setDictFile(f)}
            accept=".zs"
            icon={<FileArchive className="w-8 h-8 text-secondary" />}
            disabled={isProcessing}
          />
        </div>

        {/* Start Button */}
        <div className="text-center mb-8">
          <Button
            size="lg"
            onClick={startProcessing}
            disabled={!langFile || !dictFile || isProcessing}
            className="font-display font-bold text-lg px-10 py-6"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                جاري المعالجة...
              </>
            ) : (
              "ابدأ التعريب 🚀"
            )}
          </Button>
        </div>

        {/* Progress */}
        {stage !== "idle" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-display text-lg">{stageLabels[stage]}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={stageProgress[stage]} className="h-3 mb-2" />
              <p className="text-sm text-muted-foreground">{stageProgress[stage]}%</p>
            </CardContent>
          </Card>
        )}

        {/* Log */}
        {logs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">سجل العمليات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-background rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-sm space-y-1 border border-border">
                {logs.map((log, i) => (
                  <div key={i} className="text-muted-foreground">{log}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results link */}
        {stage === "done" && resultData && (
          <div className="text-center mt-8">
            <Link to="/results">
              <Button size="lg" className="font-display font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90">
                عرض النتائج والتحميل
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

function FileDropZone({
  label, file, onDrop, onSelect, accept, icon, disabled,
}: {
  label: string; file: File | null; onDrop: (e: React.DragEvent) => void;
  onSelect: (f: File) => void; accept: string; icon: React.ReactNode; disabled: boolean;
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer
        ${file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 bg-card"}
        ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {icon}
      <p className="mt-3 font-display font-semibold">{label}</p>
      {file ? (
        <p className="text-sm text-primary mt-1">{file.name}</p>
      ) : (
        <p className="text-sm text-muted-foreground mt-1">اسحب وأفلت أو اختر ملف</p>
      )}
      <input
        type="file"
        accept={accept}
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files?.[0] && onSelect(e.target.files[0])}
        disabled={disabled}
      />
    </div>
  );
}

export default Process;
