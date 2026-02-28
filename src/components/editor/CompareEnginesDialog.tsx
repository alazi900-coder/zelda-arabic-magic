import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Sparkles } from "lucide-react";
import type { ExtractedEntry } from "./types";
import { hasTechnicalTags, restoreTagsLocally } from "./types";

interface CompareResult {
  gemini?: string;
  mymemory?: string;
  google?: string;
}

interface CompareEnginesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExtractedEntry | null;
  onSelect: (key: string, translation: string) => void;
  glossary: string;
  userGeminiKey: string;
  myMemoryEmail: string;
}

const ENGINE_LABELS: Record<string, { label: string; emoji: string }> = {
  gemini: { label: "Gemini AI", emoji: "🤖" },
  mymemory: { label: "MyMemory", emoji: "🆓" },
  google: { label: "Google Translate", emoji: "🌐" },
};

const CompareEnginesDialog: React.FC<CompareEnginesDialogProps> = ({
  open, onOpenChange, entry, onSelect, glossary, userGeminiKey, myMemoryEmail,
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareResult>({});
  const [error, setError] = useState("");

  const handleCompare = async () => {
    if (!entry) return;
    setLoading(true);
    setError("");
    setResults({});

    const key = `${entry.msbtFile}:${entry.index}`;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const fetchProvider = async (provider: string) => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [{ key, original: entry.original }],
            glossary,
            provider,
            userApiKey: provider === 'gemini' ? (userGeminiKey || undefined) : undefined,
            myMemoryEmail: provider === 'mymemory' ? (myMemoryEmail || undefined) : undefined,
          }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const raw = data.translations?.[key] || null;
        if (!raw) return null;
        return hasTechnicalTags(entry.original)
          ? restoreTagsLocally(entry.original, raw)
          : raw;
      } catch {
        return null;
      }
    };

    try {
      const [gemini, mymemory, google] = await Promise.all([
        fetchProvider('gemini'),
        fetchProvider('mymemory'),
        fetchProvider('google'),
      ]);
      setResults({ gemini, mymemory, google });
    } catch (err) {
      setError("حدث خطأ أثناء المقارنة");
    } finally {
      setLoading(false);
    }
  };

  // Auto-compare when dialog opens with a new entry
  React.useEffect(() => {
    if (open && entry) {
      handleCompare();
    }
    if (!open) {
      setResults({});
      setError("");
    }
  }, [open, entry?.msbtFile, entry?.index]);

  const key = entry ? `${entry.msbtFile}:${entry.index}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">🔍 مقارنة المحركات</DialogTitle>
          <DialogDescription className="text-xs">
            مقارنة ترجمة نفس النص بين المحركات الثلاثة — اختر الأفضل
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="space-y-4">
            {/* Original text */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">النص الأصلي:</p>
              <p className="text-sm font-body">{entry.original}</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">جاري ترجمة النص بالمحركات الثلاثة...</span>
              </div>
            )}

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {!loading && Object.keys(results).length > 0 && (
              <div className="space-y-3">
                {(["gemini", "mymemory", "google"] as const).map((engine) => {
                  const result = results[engine];
                  const info = ENGINE_LABELS[engine];
                  return (
                    <div
                      key={engine}
                      className="p-3 rounded-lg border border-border hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-display font-bold">
                          {info.emoji} {info.label}
                        </span>
                        {result && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              onSelect(key, result);
                              onOpenChange(false);
                            }}
                          >
                            <Check className="w-3 h-3 ml-1" /> اختيار
                          </Button>
                        )}
                      </div>
                      {result ? (
                        <p className="text-sm font-body whitespace-pre-wrap break-words" dir="auto" style={{ unicodeBidi: 'plaintext' }}>{result}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">فشل في الترجمة أو لا توجد نتيجة</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && (
              <Button variant="outline" size="sm" onClick={handleCompare} className="w-full font-display">
                <Sparkles className="w-4 h-4" /> إعادة المقارنة
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CompareEnginesDialog;
