import { useState, useCallback, useRef, useEffect } from "react";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, ArrowUp, ArrowDown, ArrowLeft, Package, Upload, FileType, FolderArchive, CheckCircle2, Info, Download, Loader2, MoveVertical, Search, Eye, Grid3X3, ImageDown, ImageUp, Replace, Trash2, Pencil, AlignCenter, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, ChevronDown, Crosshair, Type } from "lucide-react";
import { analyzeWifnt, decodeWifntTexture, renderAtlasToCanvas, rebuildWifnt, type WifntInfo } from "@/lib/wifnt-parser";
import GlyphDrawingEditor from "@/components/editor/GlyphDrawingEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface FontFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  info?: WifntInfo;
}

interface BdatFile {
  name: string;
  data: ArrayBuffer;
  size: number;
  subPath?: string;
}

export default function ModPackager() {
  const [fontFile, setFontFile] = useState<FontFile | null>(null);
  const [bdatFiles, setBdatFiles] = useState<BdatFile[]>([]);
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState("");
  const [loadingBundledFont, setLoadingBundledFont] = useState(false);
  const [bdatSubPath, setBdatSubPath] = useState("gb");
  const [baselineOffset, setBaselineOffset] = useState(0);
  const [showGlyphMap, setShowGlyphMap] = useState(false);
  const [selectedGlyph, setSelectedGlyph] = useState<number | null>(null);
  const [showDrawingEditor, setShowDrawingEditor] = useState(false);
  const [glyphTextInput, setGlyphTextInput] = useState("");

  const atlasCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const glyphMapCanvasRef = useRef<HTMLCanvasElement>(null);
  const glyphUploadRef = useRef<HTMLInputElement>(null);
  const selectedGlyphCanvasRef = useRef<HTMLCanvasElement>(null);

  // Decode and cache the atlas canvas when font changes
  useEffect(() => {
    if (!fontFile?.info) {
      atlasCanvasRef.current = null;
      return;
    }
    const canvas = renderAtlasToCanvas(fontFile.data, fontFile.info);
    atlasCanvasRef.current = canvas;

    // Draw preview
    if (canvas && previewCanvasRef.current) {
      drawPreview(previewCanvasRef.current, canvas, fontFile.info, baselineOffset);
    }

    // Draw glyph map
    if (canvas && glyphMapCanvasRef.current && showGlyphMap) {
      drawGlyphMap(glyphMapCanvasRef.current, canvas, fontFile.info, selectedGlyph);
    }
  }, [fontFile]);

  // Re-draw preview when baseline changes
  useEffect(() => {
    if (atlasCanvasRef.current && previewCanvasRef.current && fontFile?.info) {
      drawPreview(previewCanvasRef.current, atlasCanvasRef.current, fontFile.info, baselineOffset);
    }
  }, [baselineOffset, fontFile?.info]);

  // Re-draw glyph map when toggled or selection changes
  useEffect(() => {
    if (atlasCanvasRef.current && glyphMapCanvasRef.current && fontFile?.info && showGlyphMap) {
      drawGlyphMap(glyphMapCanvasRef.current, atlasCanvasRef.current, fontFile.info, selectedGlyph);
    }
  }, [showGlyphMap, selectedGlyph, fontFile?.info]);

  const processFont = useCallback((data: ArrayBuffer, name: string) => {
    const info = analyzeWifnt(data);
    setFontFile({ name, data, size: data.byteLength, info });
  }, []);

  const handleLoadBundledFont = useCallback(async () => {
    setLoadingBundledFont(true);
    setStatus("جارٍ تحميل خط اللعبة المدمج...");
    try {
      const response = await fetch("/fonts/standard.wifnt");
      if (!response.ok) throw new Error("فشل تحميل الخط المدمج");
      const data = await response.arrayBuffer();
      processFont(data, "standard.wifnt");
      setStatus("✅ تم تحميل خط اللعبة بنجاح!");
      setTimeout(() => setStatus(""), 4000);
    } catch {
      setStatus("❌ فشل تحميل الخط المدمج — يرجى رفعه يدوياً");
      setTimeout(() => setStatus(""), 7000);
    } finally {
      setLoadingBundledFont(false);
    }
  }, [processFont]);

  const handleFontUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as ArrayBuffer;
      // Auto-detect: check if .dat file is actually a WIFNT font
      const info = analyzeWifnt(data);
      if (info.valid) {
        processFont(data, file.name);
      } else {
        setStatus(`❌ الملف "${file.name}" ليس ملف خط WIFNT صالحاً`);
        setTimeout(() => setStatus(""), 5000);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [processFont]);

  // Scan multiple .dat files to find font files
  const handleScanDatForFonts = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setStatus(`🔍 جارٍ فحص ${files.length} ملف بحثاً عن خطوط...`);
    let found = 0;
    let scanned = 0;
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        scanned++;
        const data = reader.result as ArrayBuffer;
        const info = analyzeWifnt(data);
        if (info.valid && !found) {
          found++;
          processFont(data, file.name);
          setStatus(`✅ تم العثور على خط في "${file.name}" (فُحص ${scanned}/${total})`);
          setTimeout(() => setStatus(""), 6000);
        }
        if (scanned === total && !found) {
          setStatus(`❌ لم يتم العثور على أي ملف خط من بين ${total} ملف`);
          setTimeout(() => setStatus(""), 5000);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [processFont]);

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

  const handleGlyphMapClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!fontFile?.info || !glyphMapCanvasRef.current) return;
    const rect = glyphMapCanvasRef.current.getBoundingClientRect();
    const scaleX = glyphMapCanvasRef.current.width / rect.width;
    const scaleY = glyphMapCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const info = fontFile.info;
    const cellW = info.cellWidth + 2; // 2px gap
    const cellH = info.cellHeight + 2;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (col >= 0 && col < info.gridCols && row >= 0 && row < info.gridRows) {
      const idx = row * info.gridCols + col;
      setSelectedGlyph(prev => prev === idx ? null : idx);
    }
  }, [fontFile?.info]);

  // Draw selected glyph preview
  useEffect(() => {
    if (!selectedGlyphCanvasRef.current || !atlasCanvasRef.current || !fontFile?.info || selectedGlyph === null) return;
    const info = fontFile.info;
    const canvas = selectedGlyphCanvasRef.current;
    const scale = 3;
    canvas.width = info.cellWidth * scale;
    canvas.height = info.cellHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const col = selectedGlyph % info.gridCols;
    const row = Math.floor(selectedGlyph / info.gridCols);
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      atlasCanvasRef.current,
      col * info.cellWidth, row * info.cellHeight, info.cellWidth, info.cellHeight,
      0, 0, canvas.width, canvas.height
    );
  }, [selectedGlyph, fontFile?.info]);

  const handleReplaceGlyph = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fontFile?.info || selectedGlyph === null || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const img = new Image();
    img.onload = () => {
      const atlas = atlasCanvasRef.current!;
      const ctx = atlas.getContext("2d");
      if (!ctx) return;
      const col = selectedGlyph % info.gridCols;
      const row = Math.floor(selectedGlyph / info.gridCols);
      const dx = col * info.cellWidth;
      const dy = row * info.cellHeight;
      // Clear the cell and draw the new image scaled to fit
      ctx.clearRect(dx, dy, info.cellWidth, info.cellHeight);
      ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, info.cellWidth, info.cellHeight);
      // Rebuild the wifnt from the modified atlas
      const imageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
      const newData = rebuildWifnt(fontFile.data, info, imageData.data);
      processFont(newData, fontFile.name);
      setStatus(`✅ تم استبدال الحرف #${selectedGlyph} بنجاح!`);
      setTimeout(() => setStatus(""), 4000);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }, [fontFile, selectedGlyph, processFont]);

  const handleClearGlyph = useCallback(() => {
    if (!fontFile?.info || selectedGlyph === null || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const atlas = atlasCanvasRef.current;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    const col = selectedGlyph % info.gridCols;
    const row = Math.floor(selectedGlyph / info.gridCols);
    ctx.clearRect(col * info.cellWidth, row * info.cellHeight, info.cellWidth, info.cellHeight);
    const imageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
    const newData = rebuildWifnt(fontFile.data, info, imageData.data);
    processFont(newData, fontFile.name);
    setStatus(`✅ تم مسح الحرف #${selectedGlyph}`);
    setTimeout(() => setStatus(""), 4000);
  }, [fontFile, selectedGlyph, processFont]);

  const handleCenterSingleGlyph = useCallback((mode: 'both' | 'horizontal' | 'vertical' = 'both') => {
    if (!fontFile?.info || selectedGlyph === null || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const atlas = atlasCanvasRef.current;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    const col = selectedGlyph % info.gridCols;
    const row = Math.floor(selectedGlyph / info.gridCols);
    const sx = col * info.cellWidth;
    const sy = row * info.cellHeight;
    // Work on a temp canvas to avoid bleeding
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = info.cellWidth;
    tempCanvas.height = info.cellHeight;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(atlas, sx, sy, info.cellWidth, info.cellHeight, 0, 0, info.cellWidth, info.cellHeight);
    const cellData = tempCtx.getImageData(0, 0, info.cellWidth, info.cellHeight);
    const pixels = cellData.data;
    let minX = info.cellWidth, minY = info.cellHeight, maxX = -1, maxY = -1;
    for (let y = 0; y < info.cellHeight; y++) {
      for (let x = 0; x < info.cellWidth; x++) {
        if (pixels[(y * info.cellWidth + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { setStatus("ℹ️ الحرف فارغ"); setTimeout(() => setStatus(""), 3000); return; }
    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    const newX = mode === 'vertical' ? minX : Math.floor((info.cellWidth - contentW) / 2);
    const newY = mode === 'horizontal' ? minY : Math.floor((info.cellHeight - contentH) / 2);
    if (newX === minX && newY === minY) { setStatus("ℹ️ الحرف متمركز بالفعل"); setTimeout(() => setStatus(""), 3000); return; }
    // Redraw centered on temp canvas
    const contentData = tempCtx.getImageData(minX, minY, contentW, contentH);
    tempCtx.clearRect(0, 0, info.cellWidth, info.cellHeight);
    tempCtx.putImageData(contentData, newX, newY);
    // Put back to atlas clipped
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.clip();
    ctx.clearRect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.drawImage(tempCanvas, sx, sy);
    ctx.restore();
    const fullImageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
    const newData = rebuildWifnt(fontFile.data, info, fullImageData.data);
    processFont(newData, fontFile.name);
    setStatus(`✅ تم توسيط الحرف #${selectedGlyph}`);
    setTimeout(() => setStatus(""), 4000);
  }, [fontFile, selectedGlyph, processFont]);

  const handleNudgeGlyph = useCallback((dx: number, dy: number) => {
    if (!fontFile?.info || selectedGlyph === null || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const atlas = atlasCanvasRef.current;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    const col = selectedGlyph % info.gridCols;
    const row = Math.floor(selectedGlyph / info.gridCols);
    const sx = col * info.cellWidth;
    const sy = row * info.cellHeight;
    // Extract cell to a temp canvas to avoid bleeding into neighbors
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = info.cellWidth;
    tempCanvas.height = info.cellHeight;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(atlas, sx, sy, info.cellWidth, info.cellHeight, 0, 0, info.cellWidth, info.cellHeight);
    // Clear original cell and redraw shifted within bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.clip();
    ctx.clearRect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.drawImage(tempCanvas, sx + dx, sy + dy);
    ctx.restore();
    const fullImageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
    const newData = rebuildWifnt(fontFile.data, info, fullImageData.data);
    processFont(newData, fontFile.name);
  }, [fontFile, selectedGlyph, processFont]);

  const handleTypeGlyph = useCallback((text: string) => {
    if (!text || !fontFile?.info || selectedGlyph === null || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const atlas = atlasCanvasRef.current;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    const col = selectedGlyph % info.gridCols;
    const row = Math.floor(selectedGlyph / info.gridCols);
    const sx = col * info.cellWidth;
    const sy = row * info.cellHeight;
    // Render text on a temp canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = info.cellWidth;
    tempCanvas.height = info.cellHeight;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.clearRect(0, 0, info.cellWidth, info.cellHeight);
    // Auto-size the font to fit the cell
    const fontSize = Math.floor(info.cellHeight * 0.75);
    tempCtx.fillStyle = "#ffffff";
    tempCtx.textAlign = "center";
    tempCtx.textBaseline = "middle";
    tempCtx.font = `bold ${fontSize}px sans-serif`;
    tempCtx.fillText(text, info.cellWidth / 2, info.cellHeight / 2);
    // Put on atlas clipped
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.clip();
    ctx.clearRect(sx, sy, info.cellWidth, info.cellHeight);
    ctx.drawImage(tempCanvas, sx, sy);
    ctx.restore();
    const fullImageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
    const newData = rebuildWifnt(fontFile.data, info, fullImageData.data);
    processFont(newData, fontFile.name);
    setGlyphTextInput("");
    setStatus(`✅ تم كتابة "${text}" في الحرف #${selectedGlyph}`);
    setTimeout(() => setStatus(""), 4000);
  }, [fontFile, selectedGlyph, processFont]);

  const handleCenterAllGlyphs = useCallback((mode: 'both' | 'horizontal' | 'vertical' = 'both') => {
    if (!fontFile?.info || !atlasCanvasRef.current) return;
    const info = fontFile.info;
    const atlas = atlasCanvasRef.current;
    const ctx = atlas.getContext("2d");
    if (!ctx) return;
    const totalGlyphs = info.gridCols * info.gridRows;
    let centered = 0;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = info.cellWidth;
    tempCanvas.height = info.cellHeight;
    const tempCtx = tempCanvas.getContext("2d")!;

    for (let idx = 0; idx < totalGlyphs; idx++) {
      const col = idx % info.gridCols;
      const row = Math.floor(idx / info.gridCols);
      const sx = col * info.cellWidth;
      const sy = row * info.cellHeight;
      // Extract to temp canvas
      tempCtx.clearRect(0, 0, info.cellWidth, info.cellHeight);
      tempCtx.drawImage(atlas, sx, sy, info.cellWidth, info.cellHeight, 0, 0, info.cellWidth, info.cellHeight);
      const cellData = tempCtx.getImageData(0, 0, info.cellWidth, info.cellHeight);
      const pixels = cellData.data;

      let minX = info.cellWidth, minY = info.cellHeight, maxX = -1, maxY = -1;
      for (let y = 0; y < info.cellHeight; y++) {
        for (let x = 0; x < info.cellWidth; x++) {
          const a = pixels[(y * info.cellWidth + x) * 4 + 3];
          if (a > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < 0) continue;

      const contentW = maxX - minX + 1;
      const contentH = maxY - minY + 1;
      const newX = mode === 'vertical' ? minX : Math.floor((info.cellWidth - contentW) / 2);
      const newY = mode === 'horizontal' ? minY : Math.floor((info.cellHeight - contentH) / 2);

      if (newX === minX && newY === minY) continue;

      const contentData = tempCtx.getImageData(minX, minY, contentW, contentH);
      tempCtx.clearRect(0, 0, info.cellWidth, info.cellHeight);
      tempCtx.putImageData(contentData, newX, newY);
      // Put back clipped
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, info.cellWidth, info.cellHeight);
      ctx.clip();
      ctx.clearRect(sx, sy, info.cellWidth, info.cellHeight);
      ctx.drawImage(tempCanvas, sx, sy);
      ctx.restore();
      centered++;
    }

    if (centered === 0) {
      setStatus("ℹ️ جميع الأحرف متمركزة بالفعل");
      setTimeout(() => setStatus(""), 4000);
      return;
    }

    const fullImageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
    const newData = rebuildWifnt(fontFile.data, info, fullImageData.data);
    processFont(newData, fontFile.name);
    const modeLabel = mode === 'horizontal' ? 'أفقياً' : mode === 'vertical' ? 'عمودياً' : 'بالكامل';
    setStatus(`✅ تم توسيط ${centered} حرف ${modeLabel} بنجاح!`);
    setTimeout(() => setStatus(""), 5000);
  }, [fontFile, processFont]);

  const doBuild = useCallback(async () => {
    setBuilding(true);
    setStatus("تجهيز حزمة المود...");

    try {
      const zipParts: { path: string; data: Uint8Array }[] = [];

      if (fontFile) {
        const fontData = new Uint8Array(fontFile.data);
        zipParts.push({
          path: `romfs/menu/font/standard.wifnt`,
          data: fontData,
        });
      }

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

      setStatus("بناء ملف ZIP...");
      const zipData = buildZip(zipParts);

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
                    <Button variant="ghost" size="sm" onClick={() => { setFontFile(null); setShowGlyphMap(false); setSelectedGlyph(null); }} className="text-destructive h-7 px-2">
                      حذف
                    </Button>
                  </div>
                </div>

                {/* WIFNT Analysis */}
                {fontFile.info && (
                  <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">تحليل بنية WIFNT</span>
                      {fontFile.info.valid ? (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">LAFT ✓</span>
                      ) : (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">تنسيق غير معروف</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs" dir="ltr">
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Texture</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.info.textureWidth}×{fontFile.info.textureHeight}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Format</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.info?.imageFormatName || 'BC1 (DXT1)'}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Grid</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.info.gridCols}×{fontFile.info.gridRows}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Cell Size</span>
                        <span className="font-mono font-bold text-foreground">{fontFile.info.cellWidth}×{fontFile.info.cellHeight}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Glyphs</span>
                        <span className="font-mono font-bold text-primary">{fontFile.info.glyphCount}</span>
                      </div>
                      <div className="bg-background/50 rounded p-2 border">
                        <span className="text-muted-foreground block">Header</span>
                        <span className="font-mono font-bold text-foreground">{formatSize(fontFile.info.headerSize)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>الحجم: <span className="font-mono">{formatSize(fontFile.size)}</span></span>
                      <span>Texture: <span className="font-mono">{formatSize(fontFile.info.textureDataSize)}</span></span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono break-all" dir="ltr">
                      Header: {fontFile.info.headerHex.slice(0, 71)}…
                    </p>
                  </div>
                )}

                {/* Real Font Atlas Preview */}
                {fontFile.info && (
                  <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">معاينة الخط الحقيقي</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() => {
                            if (!atlasCanvasRef.current) return;
                            atlasCanvasRef.current.toBlob((blob) => {
                              if (!blob) return;
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${fontFile.name.replace(/\.wifnt$/i, "")}_atlas.png`;
                              a.click();
                              URL.revokeObjectURL(url);
                              setStatus("✅ تم تصدير الـ texture atlas كصورة PNG");
                              setTimeout(() => setStatus(""), 4000);
                            }, "image/png");
                          }}
                        >
                          <ImageDown className="w-3.5 h-3.5" />
                          تصدير PNG
                        </Button>
                        <label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 px-2 cursor-pointer"
                            asChild
                          >
                            <span>
                              <ImageUp className="w-3.5 h-3.5" />
                              استيراد PNG
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept="image/png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file || !fontFile?.info) return;
                              const img = new Image();
                              img.onload = () => {
                                const info = fontFile.info!;
                                if (img.width !== info.textureWidth || img.height !== info.textureHeight) {
                                  setStatus(`❌ أبعاد الصورة يجب أن تكون ${info.textureWidth}×${info.textureHeight} — الصورة المرفوعة: ${img.width}×${img.height}`);
                                  setTimeout(() => setStatus(""), 7000);
                                  return;
                                }
                                const canvas = document.createElement("canvas");
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext("2d")!;
                                ctx.drawImage(img, 0, 0);
                                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                                const newData = rebuildWifnt(fontFile.data, info, imageData.data);
                                processFont(newData, fontFile.name);
                                setStatus("✅ تم استيراد الصورة وإعادة بناء الخط بنجاح!");
                                setTimeout(() => setStatus(""), 5000);
                              };
                              img.onerror = () => {
                                setStatus("❌ فشل تحميل الصورة");
                                setTimeout(() => setStatus(""), 5000);
                              };
                              img.src = URL.createObjectURL(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="bg-[#0a0a1a] rounded-lg p-2 overflow-x-auto border border-border/50">
                      <canvas
                        ref={previewCanvasRef}
                        className="max-w-full h-auto"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      صدّر الـ atlas كـ PNG للتعديل ببرنامج خارجي ثم أعد استيراده — الأبعاد: {fontFile.info.textureWidth}×{fontFile.info.textureHeight}
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

                {/* Glyph Map Toggle */}
                {fontFile.info && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setShowGlyphMap(prev => !prev)}
                  >
                    <Grid3X3 className="w-4 h-4" />
                    {showGlyphMap ? "إخفاء خريطة الأحرف" : "عرض خريطة الأحرف (150 حرف)"}
                  </Button>
                )}

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
                  <span className="text-sm text-muted-foreground">أو ارفع ملف .wifnt أو .dat يدوياً</span>
                  <input type="file" accept=".wifnt,.dat" onChange={handleFontUpload} className="hidden" />
                </label>
                <label className="flex flex-col items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent/50 transition-colors">
                  <Search className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">🔍 فحص عدة ملفات .dat للبحث عن الخط</span>
                  <input type="file" accept=".dat" multiple onChange={handleScanDatForFonts} className="hidden" />
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
                <span className="text-muted-foreground shrink-0">/{"filename"}.bdat</span>
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

        {/* Glyph Map (full width) */}
        {showGlyphMap && fontFile?.info && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display font-bold flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-primary" />
                خريطة الأحرف — {fontFile.info.glyphCount} حرف ({fontFile.info.gridCols}×{fontFile.info.gridRows})
              </h3>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                      <AlignCenter className="w-3.5 h-3.5" />
                      توسيط الأحرف
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleCenterAllGlyphs('both')}>
                      <AlignCenter className="w-3.5 h-3.5 ml-2" />
                      توسيط كامل
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCenterAllGlyphs('horizontal')}>
                      <AlignHorizontalDistributeCenter className="w-3.5 h-3.5 ml-2" />
                      توسيط أفقي فقط
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCenterAllGlyphs('vertical')}>
                      <AlignVerticalDistributeCenter className="w-3.5 h-3.5 ml-2" />
                      توسيط عمودي فقط
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedGlyph !== null && (
                  <div className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full" dir="ltr">
                    <span>Glyph #{selectedGlyph}</span>
                    <span>Row {Math.floor(selectedGlyph / fontFile.info.gridCols)}, Col {selectedGlyph % fontFile.info.gridCols}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-[#0a0a1a] rounded-lg p-2 overflow-x-auto border border-border/50">
              <canvas
                ref={glyphMapCanvasRef}
                className="max-w-full h-auto cursor-crosshair"
                style={{ imageRendering: "pixelated" }}
                onClick={handleGlyphMapClick}
              />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              اضغط على أي حرف لتحديده — الشبكة: {fontFile.info.cellWidth}×{fontFile.info.cellHeight} بكسل لكل خلية
            </p>

            {/* Selected Glyph Editor */}
            {selectedGlyph !== null && (
              <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border">
                <div className="shrink-0">
                  <canvas
                    ref={selectedGlyphCanvasRef}
                    className="border border-border rounded"
                    style={{ imageRendering: "pixelated", width: fontFile.info.cellWidth * 3, height: fontFile.info.cellHeight * 3 }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-sm font-semibold" dir="ltr">
                    Glyph #{selectedGlyph}
                    <span className="text-muted-foreground font-normal mr-2">
                      {" "}— Row {Math.floor(selectedGlyph / fontFile.info.gridCols)}, Col {selectedGlyph % fontFile.info.gridCols}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    الحجم: {fontFile.info.cellWidth}×{fontFile.info.cellHeight} بكسل — ارفع صورة PNG لاستبدال هذا الحرف
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setShowDrawingEditor(true)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      رسم الحرف
                    </Button>
                    <label>
                      <Button variant="secondary" size="sm" className="gap-1.5 cursor-pointer" asChild>
                        <span>
                          <Replace className="w-3.5 h-3.5" />
                          استبدال بصورة
                        </span>
                      </Button>
                      <input
                        ref={glyphUploadRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={handleReplaceGlyph}
                      />
                    </label>
                    <Button variant="outline" size="sm" className="gap-1.5 text-destructive" onClick={handleClearGlyph}>
                      <Trash2 className="w-3.5 h-3.5" />
                      مسح الحرف
                    </Button>
                  </div>
                  {/* Centering & Nudge Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleCenterSingleGlyph('both')}>
                      <Crosshair className="w-3.5 h-3.5" />
                      توسيط
                    </Button>
                    <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleNudgeGlyph(-1, 0)} title="يسار">
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Button>
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="sm" className="h-6 w-7 p-0" onClick={() => handleNudgeGlyph(0, -1)} title="أعلى">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-7 p-0" onClick={() => handleNudgeGlyph(0, 1)} title="أسفل">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleNudgeGlyph(1, 0)} title="يمين">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Mobile Text Input */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        type="text"
                        value={glyphTextInput}
                        onChange={e => setGlyphTextInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && glyphTextInput) handleTypeGlyph(glyphTextInput); }}
                        placeholder="اكتب حرف..."
                        className="h-8 flex-1 min-w-0 text-center text-sm bg-background border border-input rounded-md px-2"
                        maxLength={3}
                        dir="rtl"
                      />
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1 text-xs shrink-0"
                        onClick={() => handleTypeGlyph(glyphTextInput)}
                        disabled={!glyphTextInput}
                      >
                        <Type className="w-3.5 h-3.5" />
                        كتابة
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Drawing Editor */}
            {showDrawingEditor && selectedGlyph !== null && atlasCanvasRef.current && (
              <GlyphDrawingEditor
                atlasCanvas={atlasCanvasRef.current}
                glyphIndex={selectedGlyph}
                cellWidth={fontFile.info.cellWidth}
                cellHeight={fontFile.info.cellHeight}
                gridCols={fontFile.info.gridCols}
                onApply={(imageData) => {
                  const atlas = atlasCanvasRef.current;
                  if (!atlas || !fontFile?.info) return;
                  const ctx = atlas.getContext("2d");
                  if (!ctx) return;
                  const info = fontFile.info;
                  const col = selectedGlyph % info.gridCols;
                  const row = Math.floor(selectedGlyph / info.gridCols);
                  ctx.putImageData(imageData, col * info.cellWidth, row * info.cellHeight);
                  const fullImageData = ctx.getImageData(0, 0, info.textureWidth, info.textureHeight);
                  const newData = rebuildWifnt(fontFile.data, info, fullImageData.data);
                  processFont(newData, fontFile.name);
                  setShowDrawingEditor(false);
                  setStatus(`✅ تم حفظ رسم الحرف #${selectedGlyph}`);
                  setTimeout(() => setStatus(""), 4000);
                }}
                onCancel={() => setShowDrawingEditor(false)}
              />
            )}
          </Card>
        )}

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
 * Draw the full atlas preview into a canvas
 */
function drawPreview(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, info: WifntInfo, offset: number) {
  // Show first row of glyphs as preview
  const previewCols = Math.min(15, info.gridCols);
  const w = previewCols * info.cellWidth;
  const h = info.cellHeight * 2; // Two rows for before/after
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(0, 0, w, h);

  // Draw baseline reference
  ctx.strokeStyle = "rgba(100, 100, 255, 0.3)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, info.cellHeight);
  ctx.lineTo(w, info.cellHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw first row of glyphs with offset applied
  for (let i = 0; i < previewCols; i++) {
    ctx.drawImage(
      atlas,
      i * info.cellWidth, 0, info.cellWidth, info.cellHeight,
      i * info.cellWidth, -offset, info.cellWidth, info.cellHeight
    );
  }

  // Draw second row below
  for (let i = 0; i < previewCols; i++) {
    ctx.drawImage(
      atlas,
      i * info.cellWidth, info.cellHeight, info.cellWidth, info.cellHeight,
      i * info.cellWidth, info.cellHeight - offset, info.cellWidth, info.cellHeight
    );
  }

  // Label
  ctx.fillStyle = "rgba(100, 180, 255, 0.5)";
  ctx.font = "10px monospace";
  ctx.fillText(`offset: ${offset}px`, 4, h - 4);
}

/**
 * Draw the full glyph map with grid lines
 */
function drawGlyphMap(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, info: WifntInfo, selected: number | null) {
  const gap = 2;
  const cellW = info.cellWidth + gap;
  const cellH = info.cellHeight + gap;
  const w = info.gridCols * cellW;
  const h = info.gridRows * cellH;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(0, 0, w, h);

  // Draw each glyph cell
  for (let row = 0; row < info.gridRows; row++) {
    for (let col = 0; col < info.gridCols; col++) {
      const idx = row * info.gridCols + col;
      const dx = col * cellW;
      const dy = row * cellH;

      // Cell background
      ctx.fillStyle = idx === selected ? "rgba(100, 180, 255, 0.2)" : "rgba(30, 30, 50, 0.5)";
      ctx.fillRect(dx, dy, info.cellWidth, info.cellHeight);

      // Draw glyph from atlas
      ctx.drawImage(
        atlas,
        col * info.cellWidth, row * info.cellHeight, info.cellWidth, info.cellHeight,
        dx, dy, info.cellWidth, info.cellHeight
      );

      // Highlight selected
      if (idx === selected) {
        ctx.strokeStyle = "rgba(100, 180, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(dx + 1, dy + 1, info.cellWidth - 2, info.cellHeight - 2);
      }

      // Glyph index label
      ctx.fillStyle = "rgba(150, 150, 200, 0.4)";
      ctx.font = "8px monospace";
      ctx.fillText(`${idx}`, dx + 2, dy + info.cellHeight - 3);
    }
  }
}

/**
 * Build a simple ZIP file from parts (no compression, store only).
 */
function buildZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const entries: { path: Uint8Array; data: Uint8Array; offset: number }[] = [];
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const pathBytes = encoder.encode(file.path);
    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc32(file.data), true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true);

    const headerBytes = new Uint8Array(header);
    entries.push({ path: pathBytes, data: file.data, offset });
    parts.push(headerBytes, pathBytes, file.data);
    offset += 30 + pathBytes.length + file.data.length;
  }

  const cdStart = offset;

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
