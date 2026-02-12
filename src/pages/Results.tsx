import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Download, FileText, BarChart3, FileArchive } from "lucide-react";

interface ResultData {
  modifiedCount: number;
  fileSize: number;
  compressedFileSize: number | null;
  blobUrl: string;
  entries: { label: string; original: string; processed: string }[];
}

const Results = () => {
  const [result, setResult] = useState<ResultData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("arabizeResult");
    if (stored) {
      setResult(JSON.parse(stored));
    }
  }, []);

  const downloadFile = (blobUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/process" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للمعالجة
        </Link>

        <h1 className="text-3xl font-display font-bold mb-8">نتائج التعريب ✅</h1>

        {!result ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <p>لا توجد نتائج بعد. يرجى معالجة ملف أولاً.</p>
              <Link to="/process">
                <Button className="mt-4 font-display">اذهب لصفحة المعالجة</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{result.modifiedCount}</p>
                    <p className="text-sm text-muted-foreground">نص تم تعديله</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{(result.fileSize / 1024).toFixed(1)} KB</p>
                    <p className="text-sm text-muted-foreground">حجم SARC</p>
                    {result.compressedFileSize && (
                      <p className="text-xs text-muted-foreground">
                        مضغوط: {(result.compressedFileSize / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview */}
            {result.entries && result.entries.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="font-display">معاينة النصوص المعدلة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background border border-border rounded-lg p-4 max-h-80 overflow-y-auto space-y-4">
                    {result.entries.map((entry, i) => (
                      <div key={i} className="border-b border-border pb-3 last:border-0">
                        <p className="text-xs text-muted-foreground mb-1">{entry.label}</p>
                        <p className="text-sm text-muted-foreground line-through">{entry.original}</p>
                        <p className="text-sm font-body">{entry.processed}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Download */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => downloadFile(result.blobUrl, "arabized_output.zs")}
                className="inline-flex items-center justify-center gap-2 px-10 py-6 rounded-lg bg-primary text-primary-foreground font-display font-bold text-lg hover:bg-primary/90 transition-colors"
              >
                <FileArchive className="w-5 h-5" />
                تحميل الملف المعرّب (.zs)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Results;
