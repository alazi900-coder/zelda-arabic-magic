import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Package, Upload, FileType, FolderArchive, CheckCircle2, AlertTriangle, Info, Download, Loader2, ShieldCheck, ShieldAlert, Globe } from "lucide-react";
import { validateFontForArabic, type FontValidationResult } from "@/lib/font-validator";
import { ttfToBfttf } from "@/lib/bfttf-converter";

interface FontFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  validation?: FontValidationResult;
  originalFormat?: string; // track original format for conversion
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
  const [showLatinWarning, setShowLatinWarning] = useState(false);
  const [loadingBundledFont, setLoadingBundledFont] = useState(false);
  const [bdatSubPath, setBdatSubPath] = useState("gb"); // default XC3 subpath
  const [loadingExternalFont, setLoadingExternalFont] = useState<string | null>(null);

  const handleLoadBundledFont = useCallback(async () => {
    setLoadingBundledFont(true);
    setStatus("جارٍ تحميل خط اللعبة المدمج...");
    try {
      const response = await fetch("/fonts/standard.wifnt");
      if (!response.ok) throw new Error("فشل تحميل الخط المدمج");
      const data = await response.arrayBuffer();
      setFontFile({ name: "standard.wifnt", data, size: data.byteLength });
      setStatus("✅ تم تحميل خط اللعبة بنجاح!");
      setTimeout(() => setStatus(""), 4000);
    } catch {
      setStatus("❌ فشل تحميل الخط المدمج — يرجى رفعه يدوياً");
      setTimeout(() => setStatus(""), 7000);
    } finally {
      setLoadingBundledFont(false);
    }
  }, []);

  const validateAndSetFont = useCallback((name: string, data: ArrayBuffer) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'wifnt') {
      // .wifnt files skip validation (custom game format)
      setFontFile({ name, data, size: data.byteLength });
    } else {
      // TTF/OTF — validate and store with original format
      const validation = validateFontForArabic(data);
      setFontFile({ name, data, size: data.byteLength, validation, originalFormat: ext });
    }
  }, []);

  const EXTERNAL_FONTS = [
    { id: 'cairo', name: 'Cairo', url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf', desc: 'خط عصري متوافق — الأكثر استخداماً' },
    { id: 'tajawal', name: 'Tajawal', url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/tajawal/Tajawal-Regular.ttf', desc: 'خط أنيق خفيف الوزن' },
    { id: 'noto-sans', name: 'Noto Sans Arabic', url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf', desc: 'تغطية شاملة — من Google' },
    { id: 'noto-kufi', name: 'Noto Kufi Arabic', url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf', desc: 'خط كوفي حديث' },
  ];

  const handleDownloadExternalFont = useCallback(async (font: typeof EXTERNAL_FONTS[0]) => {
    setLoadingExternalFont(font.id);
    setStatus(`جارٍ تحميل خط ${font.name}...`);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/font-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ fontUrl: font.url }),
      });
      if (!response.ok) throw new Error(`فشل التحميل: ${response.status}`);
      const data = await response.arrayBuffer();
      const validation = validateFontForArabic(data);
      setFontFile({ name: `${font.name}.ttf`, data, size: data.byteLength, validation, originalFormat: 'ttf' });
      setStatus(`✅ تم تحميل خط ${font.name} بنجاح!`);
      setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      setStatus(`❌ فشل تحميل الخط: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setTimeout(() => setStatus(""), 7000);
    } finally {
      setLoadingExternalFont(null);
    }
  }, []);

  const handleFontUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      validateAndSetFont(file.name, reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  }, [validateAndSetFont]);

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

      // Add font file to romfs structure (convert TTF→wifnt if needed)
      if (fontFile) {
        let fontData = fontFile.data;
        if (fontFile.originalFormat && fontFile.originalFormat !== 'wifnt') {
          // Convert TTF/OTF to BFTTF (which is used as .wifnt)
          setStatus("تحويل الخط إلى صيغة .wifnt...");
          fontData = ttfToBfttf(fontData);
        }
        zipParts.push({
          path: `romfs/menu/font/standard.wifnt`,
          data: new Uint8Array(fontData),
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
  }, [fontFile, bdatFiles, bdatSubPath]);

  const handleBuildMod = useCallback(async () => {
    if (!fontFile && bdatFiles.length === 0) return;

    // Check Latin coverage before building
    const latinCoverage = fontFile?.validation?.latinCoveragePercent ?? 100;
    if (fontFile && latinCoverage < 100) {
      setShowLatinWarning(true);
      return;
    }

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

                {/* Font validation result */}
                {fontFile.validation && (
                  <div className={`p-3 rounded-lg border text-sm space-y-1.5 ${
                    fontFile.validation.valid
                      ? "bg-primary/5 border-primary/20" 
                      : fontFile.validation.coveragePercent > 0 || fontFile.validation.latinCoveragePercent > 0
                      ? "bg-accent/50 border-accent" 
                      : "bg-destructive/5 border-destructive/20"
                  }`}>
                    <div className="flex items-center gap-2 font-bold">
                      {fontFile.validation.valid ? (
                        <ShieldCheck className="w-4 h-4 text-primary" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-destructive" />
                      )}
                      <span>{fontFile.validation.details}</span>
                    </div>
                    {/* Coverage bars */}
                    {fontFile.validation.totalGlyphs > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {/* Arabic coverage */}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>العربية (PF-B)</span>
                            <span>{fontFile.validation.coveragePercent}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${fontFile.validation.coveragePercent >= 80 ? "bg-primary" : fontFile.validation.coveragePercent >= 50 ? "bg-yellow-500" : "bg-destructive"}`}
                              style={{ width: `${fontFile.validation.coveragePercent}%` }}
                            />
                          </div>
                        </div>
                        {/* Latin coverage */}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>اللاتينية (A-Z, a-z, 0-9)</span>
                            <span>{fontFile.validation.latinCoveragePercent}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${fontFile.validation.latinCoveragePercent === 100 ? "bg-primary" : fontFile.validation.latinCoveragePercent >= 50 ? "bg-yellow-500" : "bg-destructive"}`}
                              style={{ width: `${fontFile.validation.latinCoveragePercent}%` }}
                            />
                          </div>
                        </div>
                        {/* Missing Latin ranges */}
                        {fontFile.validation.missingLatinRanges.length > 0 && (
                          <p className="text-xs text-destructive">
                            مفقود: {fontFile.validation.missingLatinRanges.join(" | ")}
                          </p>
                        )}
                      </div>
                    )}
                    {fontFile.validation.warnings.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-0.5 pr-6">
                        {fontFile.validation.warnings.map((w, i) => (
                          <li key={i}>⚠ {w}</li>
                        ))}
                      </ul>
                    )}
                    {fontFile.validation.totalGlyphs > 0 && (
                      <div className="flex gap-3 text-xs text-muted-foreground pt-1">
                        <span>إجمالي الحروف: {fontFile.validation.totalGlyphs.toLocaleString()}</span>
                        <span>عربي PF-B: {fontFile.validation.arabicPresentationFormsB}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full gap-2 border-primary/30 hover:bg-primary/5"
                  onClick={handleLoadBundledFont}
                  disabled={loadingBundledFont || !!loadingExternalFont}
                >
                  {loadingBundledFont ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {loadingBundledFont ? "جارٍ التحميل..." : "استخدام خط اللعبة المدمج"}
                </Button>

                {/* External font download options */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    أو حمّل خطاً عربياً (يُحوَّل تلقائياً إلى .wifnt):
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXTERNAL_FONTS.map(font => (
                      <Button
                        key={font.id}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-auto py-2 flex-col items-start"
                        onClick={() => handleDownloadExternalFont(font)}
                        disabled={loadingBundledFont || !!loadingExternalFont}
                      >
                        <span className="flex items-center gap-1 w-full">
                          {loadingExternalFont === font.id ? (
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          ) : (
                            <Download className="w-3 h-3 shrink-0" />
                          )}
                          <span className="font-semibold">{font.name}</span>
                        </span>
                        <span className="text-muted-foreground font-normal text-[10px] leading-tight">{font.desc}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">أو ارفع خطاً يدوياً (.ttf / .otf / .wifnt)</span>
                  <input type="file" accept=".ttf,.otf,.wifnt" onChange={handleFontUpload} className="hidden" />
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

        {/* Auto-convert notice */}
        {fontFile && fontFile.originalFormat && fontFile.originalFormat !== 'wifnt' && (
          <Card className="p-4 bg-primary/5 border-primary/20 flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-foreground mb-1">سيتم تحويل الخط تلقائياً إلى .wifnt</p>
              <p className="text-muted-foreground">
                عند بناء الحزمة، سيُحوَّل الخط من <code className="bg-muted px-1 rounded">{fontFile.originalFormat}</code> إلى صيغة <code className="bg-muted px-1 rounded">.wifnt</code> المطلوبة للعبة تلقائياً.
              </p>
            </div>
          </Card>
        )}
        {fontFile?.name.toLowerCase().endsWith(".wifnt") && (
          <Card className="p-4 bg-primary/5 border-primary/20 flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-foreground mb-1">خط اللعبة المعدّل (.wifnt)</p>
              <p className="text-muted-foreground">
                سيتم وضع الخط في <code className="bg-muted px-1 rounded" dir="ltr">romfs/menu/font/standard.wifnt</code> — المسار الأصلي لخط اللعبة.
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

      {/* Latin coverage warning dialog */}
      <AlertDialog open={showLatinWarning} onOpenChange={setShowLatinWarning}>
        <AlertDialogContent className="border-destructive/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تحذير: النصوص الإنجليزية ستختفي!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-right" dir="rtl">
              <p className="text-destructive font-semibold">
                الخط المختار لا يحتوي على حروف لاتينية كاملة
                {fontFile?.validation?.latinCoveragePercent !== undefined && (
                  <span> ({fontFile.validation.latinCoveragePercent}% تغطية)</span>
                )}
              </p>
              <p>
                عند تثبيت هذا المود، ستختفي جميع النصوص الإنجليزية في اللعبة (أسماء الأماكن، القوائم، معلومات المعارك) وستظهر فارغة تماماً.
              </p>
              {fontFile?.validation?.missingLatinRanges && fontFile.validation.missingLatinRanges.length > 0 && (
                <div className="bg-destructive/10 rounded p-2 text-xs text-destructive">
                  <strong>النطاقات المفقودة:</strong> {fontFile.validation.missingLatinRanges.join(" | ")}
                </div>
              )}
              <p className="text-muted-foreground text-sm">
                💡 يُنصح باستخدام <strong>Cairo-Regular</strong> أو <strong>Tajawal</strong> اللذين يدعمان العربية واللاتينية معاً.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <AlertDialogCancel className="flex-1">
              إلغاء — اختر خطاً آخر
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { setShowLatinWarning(false); doBuild(); }}
            >
              أعلم بالمخاطر — بنِ على أي حال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
