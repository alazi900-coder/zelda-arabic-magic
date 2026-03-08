import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, X, BookOpen } from "lucide-react";

interface GlossaryPreviewEntry {
  key: string;
  original: string;
  newTranslation: string;
  oldTranslation: string;
  matchType: 'exact' | 'partial';
}

interface GlossaryTranslationPreviewProps {
  open: boolean;
  entries: GlossaryPreviewEntry[];
  onApply: (selectedKeys: Set<string>) => void;
  onDiscard: () => void;
}

/** Highlight the Arabic parts that differ from the original English */
function HighlightedResult({ original, result }: { original: string; result: string }) {
  // If fully replaced (exact match), highlight entirely
  if (!result.includes(original.charAt(0)) || original.toLowerCase() !== result.toLowerCase()) {
    // Find segments: split result and highlight Arabic portions
    const arabicRe = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;
    const parts: { text: string; isArabic: boolean }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    arabicRe.lastIndex = 0;
    while ((match = arabicRe.exec(result)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: result.slice(lastIndex, match.index), isArabic: false });
      }
      parts.push({ text: match[0], isArabic: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < result.length) {
      parts.push({ text: result.slice(lastIndex), isArabic: false });
    }
    if (parts.length === 0) {
      parts.push({ text: result, isArabic: true });
    }

    return (
      <span dir="auto">
        {parts.map((p, i) =>
          p.isArabic ? (
            <span key={i} className="bg-emerald-500/20 text-emerald-300 rounded px-0.5 font-semibold">{p.text}</span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </span>
    );
  }

  return <span dir="auto">{result}</span>;
}

const GlossaryTranslationPreview: React.FC<GlossaryTranslationPreviewProps> = ({
  open, entries, onApply, onDiscard,
}) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.map(e => e.key)));

  // Reset selection when entries change
  React.useEffect(() => {
    setSelected(new Set(entries.map(e => e.key)));
  }, [entries]);

  const exactCount = useMemo(() => entries.filter(e => e.matchType === 'exact').length, [entries]);
  const partialCount = useMemo(() => entries.filter(e => e.matchType === 'partial').length, [entries]);

  const toggleAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map(e => e.key)));
    }
  };

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDiscard(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            معاينة ترجمة القاموس
          </DialogTitle>
          <DialogDescription>
            راجع التطابقات قبل التطبيق — الأجزاء المترجمة مميزة باللون الأخضر
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 px-1">
          <Badge variant="secondary">{entries.length} نتيجة</Badge>
          {exactCount > 0 && <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30">{exactCount} تطابق كامل</Badge>}
          {partialCount > 0 && <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30">{partialCount} تطابق جزئي</Badge>}
          <Button variant="ghost" size="sm" onClick={toggleAll} className="mr-auto text-xs">
            {selected.size === entries.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className={`p-3 flex gap-3 items-start transition-colors ${selected.has(entry.key) ? 'bg-accent/30' : 'opacity-50'}`}
              >
                <Checkbox
                  checked={selected.has(entry.key)}
                  onCheckedChange={() => toggle(entry.key)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs text-muted-foreground truncate">{entry.key}</div>
                  <div className="text-sm text-foreground/70" dir="ltr">{entry.original}</div>
                  <div className="text-sm font-medium" dir="auto">
                    <HighlightedResult original={entry.original} result={entry.newTranslation} />
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${entry.matchType === 'exact' ? 'border-blue-500/40 text-blue-400' : 'border-emerald-500/40 text-emerald-400'}`}>
                  {entry.matchType === 'exact' ? 'كامل' : 'جزئي'}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onDiscard}>
            <X className="w-4 h-4" /> إلغاء
          </Button>
          <Button onClick={() => onApply(selected)} disabled={selected.size === 0}>
            <CheckCircle2 className="w-4 h-4" /> تطبيق ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GlossaryTranslationPreview;
export type { GlossaryPreviewEntry };
