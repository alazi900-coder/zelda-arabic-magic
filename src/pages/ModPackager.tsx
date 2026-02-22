import { useState, useCallback } from "react";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Package, Upload, FileType, FolderArchive, CheckCircle2, Info, Download, Loader2, MoveVertical, Search, Eye } from "lucide-react";

interface WifntAnalysis {
  magic: string;
  version: number;
  glyphCount: number;
  baseline: number;
  headerSize: number;
  dataOffset: number;
  valid: boolean;
}

interface FontFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  analysis?: WifntAnalysis;
}

interface BdatFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  subPath?: string; // e.g. "gb" → romfs/bdat/gb/filename.bdat
}

export default function ModPackager() {
  const [fontFile, setFontFile] = useState<FontFile | null>(null);
  const [bdatFiles, setBdatFiles] = useState<BdatFile[]>([]);
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState("");
  const [loadingBundledFont, setLoadingBundledFont] = useState(false);
  const [bdatSubPath, setBdatSubPath] = useState("gb");
  const [baselineOffset, setBaselineOffset] = useState(0);

  const analyzeWifnt = useCallback((data: ArrayBuffer): WifntAnalysis | undefined => {
    if (data.byteLength < 0x20) return undefined;
    try {
      const view = new DataView(data);
      const magicBytes = new Uint8Array(data, 0, 4);
      const magic = String.fromCharCode(...magicBytes);
      const version = view.getUint16(0x04, true);
      const glyphCount = view.getUint16(0x08, true);
      const baseline = view.getInt16(0x1A, true);
      const headerSize = view.getUint16(0x06, true) || 0x20;
      const dataOffset = view.getUint32(0x0C, true);
      const valid = magic === "LAFT" || magic === "TFAL";
      return { magic, version, glyphCount, baseline, headerSize, dataOffset, valid };
    } catch {
      return undefined;
    }
  }, []);

  const handleLoadBundledFont = useCallback(async () => {
    setLoadingBundledFont(true);
    setStatus("جارٍ تحميل خط اللعبة المدمج...");
    try {
      const response = await fetch("/fonts/standard.wifnt");
      if (!response.ok) throw new Error("فشل تحميل الخط المدمج");
      const data = await response.arrayBuffer();
      const analysis = analyzeWifnt(data);
      setFontFile({ name: "standard.wifnt", data, size: data.byteLength, analysis });
      setStatus("✅ تم تحميل خط اللعبة بنجاح!");
      setTimeout(() => setStatus(""), 4000);
    } catch {
      setStatus("❌ فشل تحميل الخط المدمج — يرجى رفعه يدوياً");
      setTimeout(() => setStatus(""), 7000);
    } finally {
      setLoadingBundledFont(false);
    }
  }, [analyzeWifnt]);

  const handleFontUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as ArrayBuffer;
      const analysis = analyzeWifnt(data);
      setFontFile({ name: file.name, data, size: data.byteLength, analysis });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleBdatUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles: BdatFile[] = [];
    let loaded = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        newFiles.push({ name: file.name, data: reader.result as ArrayBuffer, size: file.size });
        loaded++;
        if (loaded === files.length) {
          setBdatFiles(prev => [...prev, ...newFiles]);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const removeBdat = useCallback((index: number) => {
    setBdatFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const doBuild = useCallback(async () => {
    setBuilding(true);
    setStatus("تجهيز حزمة المود...");

    try {
      const zipParts: { path: string; data: Uint8Array }[] = [];

      // Add font file directly (LAFT/WIFNT format — no conversion needed)
      if (fontFile) {
        let fontData = new Uint8Array(fontFile.data);

        // Apply baseline offset by patching the WIFNT header
        // The baseline offset is stored as a signed 16-bit value at offset 0x1A in the LAFT header
        if (baselineOffset !== 0 && fontData.length > 0x1C) {
          fontData = new Uint8Array(fontData); // clone to avoid mutating original
          const view = new DataView(fontData.buffer, fontData.byteOffset, fontData.byteLength);
          // Read current baseline value and apply offset
          const currentBaseline = view.getInt16(0x1A, true);
          view.setInt16(0x1A, currentBaseline + baselineOffset, true);
        }

        zipParts.push({
          path: `romfs/menu/font/standard.wifnt`,
          data: fontData,
        });
      }

      // Add BDAT files to romfs structure with correct subpath
      // libxc3_file_loader expects: romfs/bdat/{subpath}/{filename}.bdat
      const subPath = bdatSubPath.trim().replace(/^\/|\/$/g, "");
      for (const bdat of bdatFiles) {
        const bdatPath = subPath
          ? `romfs/bdat/${subPath}/${bdat.name}`
          : `romfs/bdat/${bdat.name}`;
        zipParts.push({
          path: bdatPath,
          data: new Uint8Array(bdat.data),
        });
      }

      // Build a simple ZIP file manually
      setStatus("بناء ملف ZIP...");
      const zipData = buildZip(zipParts);

      // Download
      const blob = new Blob([zipData.buffer as ArrayBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "xc3_arabic_mod.zip";
      a.click();
      URL.revokeObjectURL(url);

      setStatus(`✅ تم إنشاء حزمة المود بنجاح! (${zipParts.length} ملفات)`);
      setTimeout(() => setStatus(""), 5000);
    } catch (err) {
      setStatus(`❌ خطأ: ${err instanceof Error ? err.message : "غير معروف"}`);
      setTimeout(() => setStatus(""), 5000);
    } finally {
      setBuilding(false);
    }
  }, [fontFile, bdatFiles, bdatSubPath, baselineOffset]);

  const handleBuildMod = useCallback(async () => {
    if (!fontFile && bdatFiles.length === 0) return;

    await doBuild();
  }, [fontFile, bdatFiles, doBuild]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-display font-bold">بناء حزمة المود</h1>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              الرئيسية
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Info banner */}
        <Card className="p-4 bg-primary/5 border-primary/20 flex gap-3 items-start">
          <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
           <p className="font-bold text-foreground mb-1">كيف تعمل حزمة المود؟</p>
            <p>
              استخدم خط اللعبة المدمج <code className="bg-muted px-1 rounded">standard.wifnt</code> أو ارفعه يدوياً،
              ثم أضف ملفات BDAT المترجمة، وستقوم الأداة بتجميعها في ملف ZIP جاهز للتثبيت.
            </p>
            <p className="mt-2 text-xs font-semibold text-primary">
              ⚙️ الخط يُوضع في <code className="bg-muted px-1 rounded">romfs/menu/font/standard.wifnt</code>
            </p>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Font Upload */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileType className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg">خط اللعبة</h2>
                <p className="text-xs text-muted-foreground">standard.wifnt</p>
              </div>
            </div>

            {fontFile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium truncate max-w-[180px]">{fontFile.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatSize(fontFile.size)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setFontFile(null)} className="text-destructive h-7 px-2">
                      حذف
                    </Button>
                  </div>
                </div>

                {/* WIFNT Analysis */}
                {fontFile.analysis && (
                  <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">تحليل بنية WIFNT</span>
                      {fontFile.analysis.valid ? (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">صالح ✓</span>
                      ) : (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">تنسيق غير معروف</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs" dir="ltr">
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Magic</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.analysis.magic}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Version</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.analysis.version}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Glyph Count</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.analysis.glyphCount.toLocaleString()}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Baseline</span>
                        <span className="font-mono font-bold text-primary">{fontFile.analysis.baseline}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Header Size</span>
                        <span className="font-mono font-bold text-foreground">0x{fontFile.analysis.headerSize.toString(16).toUpperCase()}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Data Offset</span>
                        <span className="font-mono font-bold text-foreground">0x{fontFile.analysis.dataOffset.toString(16).toUpperCase()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      الحجم الكلي: <span className="font-mono">{formatSize(fontFile.size)}</span>
                    </p>
                  </div>
                )}

                {/* Baseline Offset Control */}
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <MoveVertical className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">تعديل تمركز الخط (Baseline Offset)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    إذا كان النص طالع أو نازل عن موقعه الصحيح، عدّل هذه القيمة. القيم الموجبة ترفع النص والسالبة تنزّله.
                  </p>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[baselineOffset]}
                      onValueChange={([v]) => setBaselineOffset(v)}
                      min={-20}
                      max={20}
                      step={1}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        value={baselineOffset}
                        onChange={e => setBaselineOffset(Number(e.target.value))}
                        className="w-16 h-8 text-center text-sm bg-background border border-input rounded-md"
                        min={-50}
                        max={50}
                      />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                  </div>
                  {baselineOffset !== 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-primary font-medium">
                        الإزاحة: {baselineOffset > 0 ? `↑ ${baselineOffset}` : `↓ ${Math.abs(baselineOffset)}`} بكسل
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setBaselineOffset(0)}>
                        إعادة تعيين
                      </Button>
                    </div>
                  )}
                </div>

                {/* Live Baseline Preview */}
                <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">معاينة تأثير الإزاحة</span>
                  </div>
                  <div className="bg-[#1a1a2e] rounded-lg p-1 overflow-hidden border border-border/50">
                    <div className="relative bg-[#0f0f23] rounded p-4 min-h-[100px] flex flex-col justify-center items-center gap-3">
                      <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-primary/20" />
                      <p className="text-[10px] text-primary/40 absolute top-1 left-2 font-mono select-none">baseline ref</p>
                      <div style={{ transform: `translateY(${-baselineOffset}px)`, transition: "transform 0.2s ease" }}>
                        <p className="text-white text-lg text-center font-bold" style={{ fontFamily: "'Noto Kufi Arabic', 'Noto Sans Arabic', sans-serif" }}>
                          مغامرة زينوبليد
                        </p>
                        <p className="text-white/70 text-sm text-center mt-1" style={{ fontFamily: "'Noto Kufi Arabic', 'Noto Sans Arabic', sans-serif" }}>
                          اضغط أي زر للمتابعة
                        </p>
                      </div>
                      {baselineOffset !== 0 && (
                        <div className="absolute right-2 top-1/2 flex flex-col items-center" style={{ transform: "translateY(-50%)" }}>
                          <div className="w-px bg-primary/60" style={{ height: `${Math.abs(baselineOffset) * 2}px` }} />
                          <span className="text-[10px] text-primary font-mono mt-0.5">{baselineOffset > 0 ? "↑" : "↓"}{Math.abs(baselineOffset)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    محاكاة بصرية — الخط الفعلي سيظهر داخل اللعبة فقط
                  </p>
                </div>

              </div>
            ) : (
              <div className="space-y-3">
              <Button
                  variant="outline"
                  className="w-full gap-2 border-primary/30 hover:bg-primary/5"
                  onClick={handleLoadBundledFont}
                  disabled={loadingBundledFont}
                >
                  {loadingBundledFont ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {loadingBundledFont ? "جارٍ التحميل..." : "استخدام خط اللعبة المدمج"}
                </Button>

                <label className="flex flex-col items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">أو ارفع ملف .wifnt يدوياً</span>
                  <input type="file" accept=".wifnt" onChange={handleFontUpload} className="hidden" />
                </label>
              </div>
            )}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 space-y-1">
              <p className="font-semibold">📌 خط اللعبة (standard.wifnt):</p>
              <p>خط اللعبة الأصلي المعدّل لدعم العربية. يُوضع في:</p>
              <p dir="ltr" className="font-mono text-primary">romfs/menu/font/standard.wifnt</p>
            </div>
          </Card>

          {/* BDAT Upload */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FolderArchive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg">ملفات BDAT المترجمة</h2>
                <p className="text-xs text-muted-foreground">ملفات مُصدَّرة من المحرر</p>
              </div>
            </div>

            {/* BDAT subpath field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">المسار الفرعي داخل romfs/bdat/</label>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg border px-3 py-2 font-mono text-sm" dir="ltr">
                <span className="text-muted-foreground shrink-0">romfs/bdat/</span>
                <input
                  type="text"
                  value={bdatSubPath}
                  onChange={e => setBdatSubPath(e.target.value)}
                  placeholder="gb"
                  className="flex-1 bg-transparent outline-none text-foreground min-w-0"
                  dir="ltr"
                />
                <span className="text-muted-foreground shrink-0">/{"{filename}"}.bdat</span>
              </div>
              <p className="text-xs text-muted-foreground">
                📁 XC3 الافتراضي: <code className="bg-muted px-1 rounded">gb</code> — (romfs/bdat/gb/filename.bdat)
                <br />اتركه فارغاً إذا كانت الملفات في الجذر مباشرة
              </p>
            </div>

            <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">ارفع ملفات BDAT ({bdatFiles.length} ملف مرفوع)</span>
              <input type="file" accept=".bdat" multiple onChange={handleBdatUpload} className="hidden" />
            </label>

            {bdatFiles.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {bdatFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                    <span className="truncate max-w-[180px]">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                      <button onClick={() => removeBdat(i)} className="text-destructive text-xs hover:underline">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Folder structure preview */}
        {(fontFile || bdatFiles.length > 0) && (
          <Card className="p-5">
            <h3 className="font-display font-bold mb-3 flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-primary" />
              هيكل حزمة المود
            </h3>
            <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm text-muted-foreground space-y-0.5 dir-ltr text-left" dir="ltr">
              <p className="text-foreground font-bold">xc3_arabic_mod.zip/</p>
              <p className="pr-4">└── romfs/</p>
              {fontFile && (
                <>
                  <p className="pr-12">├── menu/</p>
                  <p className="pr-20">└── font/</p>
                  <p className="pr-28 text-primary">└── standard.wifnt</p>
                </>
              )}
              {bdatFiles.length > 0 && (
                <>
                  <p className="pr-12">{fontFile ? "└" : "├"}── bdat/</p>
                  {bdatSubPath.trim() && (
                    <p className="pr-20 text-muted-foreground">├── {bdatSubPath.trim()}/</p>
                  )}
                  {bdatFiles.slice(0, 5).map((f, i) => (
                    <p key={i} className={bdatSubPath.trim() ? "pr-28 text-primary" : "pr-20 text-primary"}>
                      {i === Math.min(bdatFiles.length, 5) - 1 ? "└" : "├"}── {f.name}
                    </p>
                  ))}
                  {bdatFiles.length > 5 && (
                    <p className={bdatSubPath.trim() ? "pr-28 text-muted-foreground/60" : "pr-20 text-muted-foreground/60"}>... و{bdatFiles.length - 5} ملفات أخرى</p>
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {fontFile && (
          <Card className="p-4 bg-primary/5 border-primary/20 flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-foreground mb-1">خط LAFT/WIFNT جاهز</p>
              <p className="text-muted-foreground">
                سيتم وضع الخط في <code className="bg-muted px-1 rounded" dir="ltr">romfs/menu/font/standard.wifnt</code>
                {baselineOffset !== 0 && (
                  <span className="text-primary font-medium"> — مع إزاحة {baselineOffset > 0 ? "↑" : "↓"} {Math.abs(baselineOffset)}px</span>
                )}
              </p>
            </div>
          </Card>
        )}

        {/* Build button */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            size="lg"
            disabled={building || (!fontFile && bdatFiles.length === 0)}
            onClick={handleBuildMod}
            className="font-display font-bold text-lg px-10 py-6 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30 gap-2"
          >
            <Package className="w-5 h-5" />
            {building ? "جارٍ البناء..." : "بناء حزمة المود 📦"}
          </Button>
          {status && (
            <p className={`text-sm font-medium ${status.startsWith("✅") ? "text-primary" : status.startsWith("❌") ? "text-destructive" : "text-muted-foreground"}`}>
              {status}
            </p>
          )}
        </div>
      </main>

    </div>
  );
}

/**
 * Build a simple ZIP file from parts (no compression, store only).
 * Sufficient for mod packaging where files are already binary.
 */
function buildZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const entries: { path: Uint8Array; data: Uint8Array; offset: number }[] = [];
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;

  // Local file headers + data
  for (const file of files) {
    const pathBytes = encoder.encode(file.path);
    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (store)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc32(file.data), true); // crc32
    view.setUint32(18, file.data.length, true); // compressed size
    view.setUint32(22, file.data.length, true); // uncompressed size
    view.setUint16(26, pathBytes.length, true); // name length
    view.setUint16(28, 0, true); // extra field length

    const headerBytes = new Uint8Array(header);
    entries.push({ path: pathBytes, data: file.data, offset });
    parts.push(headerBytes, pathBytes, file.data);
    offset += 30 + pathBytes.length + file.data.length;
  }

  const cdStart = offset;

  // Central directory
  for (const entry of entries) {
    const cd = new ArrayBuffer(46);
    const view = new DataView(cd);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc32(entry.data), true);
    view.setUint32(20, entry.data.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, entry.path.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0x20, true);
    view.setUint32(42, entry.offset, true);

    parts.push(new Uint8Array(cd), entry.path);
    offset += 46 + entry.path.length;
  }

  const cdSize = offset - cdStart;

  // End of central directory
  const eocd = new ArrayBuffer(22);
  const eocdView = new DataView(eocd);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdStart, true);
  eocdView.setUint16(20, 0, true);
  parts.push(new Uint8Array(eocd));

  // Merge
  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

/** Simple CRC32 for ZIP */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
