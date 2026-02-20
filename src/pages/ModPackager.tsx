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
import { ArrowRight, Package, Upload, FileType, FolderArchive, CheckCircle2, AlertTriangle, Info, Download, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { validateFontForArabic, type FontValidationResult } from "@/lib/font-validator";
import { isBfttf, bfttfToTtf, ttfToBfttf } from "@/lib/bfttf-converter";

interface FontFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  validation?: FontValidationResult;
}

interface BdatFile {
  name: string;
  data: ArrayBuffer;
  size: number;
}

export default function ModPackager() {
  const [fontFile, setFontFile] = useState<FontFile | null>(null);
  const [bdatFiles, setBdatFiles] = useState<BdatFile[]>([]);
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState("");
  const [downloadingFont, setDownloadingFont] = useState(false);
  const [showLatinWarning, setShowLatinWarning] = useState(false);

  // Cairo includes BOTH Arabic PF-B AND Latin (A-Z, a-z, 0-9)
  // NotoSansArabic is Arabic-ONLY and causes English text to disappear in-game!
  const CAIRO_FONT_URLS = [
    "https://github.com/Gue3bara/Cairo/raw/7030db78cca3a7a7d94f9071b3f35dad7447ae71/fonts/ttf/Cairo-Regular.ttf",
  ];

  const validateAndSetFont = useCallback((name: string, data: ArrayBuffer) => {
    // For BFTTF files, decrypt first to validate the inner TTF
    let dataToValidate = data;
    if (isBfttf(data)) {
      try { dataToValidate = bfttfToTtf(data); } catch { /* validate raw */ }
    }
    const validation = validateFontForArabic(dataToValidate);
    setFontFile({ name, data, size: data.byteLength, validation });
  }, []);

  const handleDownloadNotoFont = useCallback(async () => {
    setDownloadingFont(true);
    try {
      let data: ArrayBuffer | null = null;
      for (const url of CAIRO_FONT_URLS) {
        try {
          const { data: responseData, error } = await supabase.functions.invoke("font-proxy", {
            body: { fontUrl: url },
          });
          if (error) continue;
          // responseData is already an ArrayBuffer when the response is binary
          if (responseData instanceof ArrayBuffer && responseData.byteLength > 0) {
            data = responseData;
            break;
          }
          // Fallback: if it comes as a Blob
          if (responseData instanceof Blob) {
            data = await responseData.arrayBuffer();
            break;
          }
        } catch { /* try next */ }
      }
      if (!data) throw new Error("فشل تحميل الخط");
      validateAndSetFont("Cairo-Regular.ttf", data);
    } catch {
      setStatus("❌ فشل تحميل خط Cairo — يرجى رفع الخط يدوياً");
      setTimeout(() => setStatus(""), 7000);
    } finally {
      setDownloadingFont(false);
    }
  }, [validateAndSetFont, CAIRO_FONT_URLS]);

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

      // Add font file to romfs structure (auto-convert TTF → BFTTF)
      if (fontFile) {
        let fontData = fontFile.data;
        let fontName = fontFile.name;
        if (!isBfttf(fontData)) {
          setStatus("تحويل الخط إلى صيغة BFTTF...");
          fontData = ttfToBfttf(fontData);
          fontName = fontName.replace(/\.(ttf|otf)$/i, ".bfttf");
        }
        zipParts.push({
          path: `romfs/skyline/font/font_main.bfttf`,
          data: new Uint8Array(fontData),
        });
      }

      // Add BDAT files to romfs structure
      for (const bdat of bdatFiles) {
        zipParts.push({
          path: `romfs/bdat/${bdat.name}`,
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
  }, [fontFile, bdatFiles]);

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
              ارفع خط عربي بصيغة <code className="bg-muted px-1 rounded">.ttf</code> أو <code className="bg-muted px-1 rounded">.bfttf</code> 
              وملفات BDAT المترجمة، وستقوم الأداة بتجميعها في هيكل مجلدات جاهز للتثبيت على المحاكي أو الجهاز.
            </p>
            <p className="mt-2 text-xs font-semibold text-primary">
              ⚙️ هذه الأداة مُصممة للمودات المعتمدة على <strong>Skyline plugin</strong> — الخط يُوضع في <code className="bg-muted px-1 rounded">romfs/skyline/font/font_main.bfttf</code>
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
                <h2 className="font-display font-bold text-lg">الخط العربي</h2>
                <p className="text-xs text-muted-foreground">.ttf أو .bfttf</p>
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
                  onClick={handleDownloadNotoFont}
                  disabled={downloadingFont}
                >
                  {downloadingFont ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloadingFont ? "جارٍ التحميل..." : "تحميل Cairo-Regular تلقائياً (عربي + لاتيني)"}
                </Button>
                <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">أو ارفع خطاً يدوياً</span>
                  <input type="file" accept=".ttf,.otf,.bfttf,.woff,.woff2" onChange={handleFontUpload} className="hidden" />
                </label>
              </div>
            )}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 space-y-1">
              <p className="font-semibold">💡 خطوط مقترحة (تدعم العربية واللاتينية معاً):</p>
              <p>• <strong>Cairo</strong> — ✅ موصى به (عربي + لاتيني كامل)</p>
              <p>• <strong>Tajawal</strong> — ✅ خفيف ومناسب للألعاب (عربي + لاتيني)</p>
              <p className="text-destructive/80">• ⚠️ Noto Sans Arabic — عربي فقط، النصوص الإنجليزية ستختفي!</p>
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
                  <p className="pr-12">├── skyline/</p>
                  <p className="pr-20">└── font/</p>
                  <p className="pr-28 text-primary">└── font_main.bfttf</p>
                </>
              )}
              {bdatFiles.length > 0 && (
                <>
                  <p className="pr-12">{fontFile ? "└" : "├"}── bdat/</p>
                  {bdatFiles.slice(0, 5).map((f, i) => (
                    <p key={i} className="pr-20 text-primary">
                      {i === Math.min(bdatFiles.length, 5) - 1 ? "└" : "├"}── {f.name}
                    </p>
                  ))}
                  {bdatFiles.length > 5 && (
                    <p className="pr-20 text-muted-foreground/60">... و{bdatFiles.length - 5} ملفات أخرى</p>
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {/* Auto-convert notice */}
        {fontFile && !fontFile.name.endsWith(".bfttf") && (
          <Card className="p-4 bg-primary/5 border-primary/20 flex gap-3 items-start">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-foreground mb-1">سيتم تحويل الخط تلقائياً إلى .bfttf</p>
              <p className="text-muted-foreground">
                عند بناء الحزمة، سيُحوَّل الخط من <code className="bg-muted px-1 rounded">{fontFile.name.split('.').pop()}</code> إلى صيغة <code className="bg-muted px-1 rounded">.bfttf</code> المطلوبة للعبة تلقائياً.
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
