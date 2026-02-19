import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Package, Upload, FileType, FolderArchive, CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface FontFile {
  name: string;
  data: ArrayBuffer;
  size: number;
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

  const handleFontUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFontFile({ name: file.name, data: reader.result as ArrayBuffer, size: file.size });
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

  const handleBuildMod = useCallback(async () => {
    if (!fontFile && bdatFiles.length === 0) return;
    setBuilding(true);
    setStatus("تجهيز حزمة المود...");

    try {
      // Dynamic import JSZip-like functionality using native compression
      const zipParts: { path: string; data: Uint8Array }[] = [];

      // Add font file to romfs structure
      if (fontFile) {
        // XC3 font path: romfs/menu/font/
        zipParts.push({
          path: `romfs/menu/font/${fontFile.name}`,
          data: new Uint8Array(fontFile.data),
        });
      }

      // Add BDAT files to romfs structure
      for (const bdat of bdatFiles) {
        // XC3 BDAT path: romfs/bdat/
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
            ) : (
              <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">اسحب الخط هنا أو اضغط للرفع</span>
                <input type="file" accept=".ttf,.otf,.bfttf,.woff,.woff2" onChange={handleFontUpload} className="hidden" />
              </label>
            )}

            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 space-y-1">
              <p className="font-semibold">💡 خطوط مقترحة:</p>
              <p>• Noto Sans Arabic — شامل ومستقر</p>
              <p>• Cairo — واضح وعصري</p>
              <p>• Tajawal — خفيف ومناسب للألعاب</p>
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
                  <p className="pr-12">├── menu/</p>
                  <p className="pr-20">└── font/</p>
                  <p className="pr-28 text-primary">└── {fontFile.name}</p>
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

        {/* Warning */}
        {fontFile && !fontFile.name.endsWith(".bfttf") && (
          <Card className="p-4 bg-accent/50 border-accent flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-accent-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-foreground mb-1">الخط ليس بصيغة .bfttf</p>
              <p className="text-muted-foreground">
                Xenoblade 3 تستخدم صيغة <code className="bg-muted px-1 rounded">.bfttf</code>. 
                ستحتاج لتحويل الخط باستخدام <strong>Switch Toolbox</strong> أو <strong>BFTTF Converter</strong> قبل التثبيت.
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
