import React, { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Scale, CheckCircle2, X, Sparkles, Check, XCircle } from "lucide-react";
import { EditorState } from "@/components/editor/types";
import { balanceLines, hasOrphanLines } from "@/lib/balance-lines";

interface BalanceResult {
  key: string;
  label: string;
  before: string;
  after: string;
}

interface LineBalancePanelProps {
  state: EditorState;
  onApplyFix: (key: string, fixedText: string) => void;
  onApplyAll: (fixes: { key: string; value: string }[]) => void;
}

/** Render text with visible line breaks */
function LinesPreview({ text, variant }: { text: string; variant: 'before' | 'after' }) {
  const lines = text.split('\n');
  const bgClass = variant === 'before' ? 'bg-destructive/10' : 'bg-primary/10';
  
  return (
    <div className={`${bgClass} rounded p-2 font-body text-xs`} dir="rtl">
      <span className="text-[10px] text-muted-foreground block mb-1">
        {variant === 'before' ? '⚠️ قبل (كلمات يتيمة):' : '✅ بعد (متوازن):'}
      </span>
      {lines.map((line, i) => {
        const isOrphan = variant === 'before' && line.trim().split(/\s+/).length <= 1 && lines.length > 1;
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-[10px] text-muted-foreground/50 select-none min-w-[14px] text-left font-mono">{i + 1}</span>
            <span className={isOrphan ? 'text-destructive font-bold bg-destructive/15 px-1 rounded' : ''}>
              {line || '\u00A0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LineBalancePanel({ state, onApplyFix, onApplyAll }: LineBalancePanelProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<BalanceResult[] | null>(null);

  const handleScan = useCallback(() => {
    setScanning(true);
    setTimeout(() => {
      const found: BalanceResult[] = [];

      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key]?.trim();
        if (!translation) continue;

        if (hasOrphanLines(translation)) {
          const balanced = balanceLines(translation);
          if (balanced !== translation) {
            found.push({
              key,
              label: entry.label,
              before: translation,
              after: balanced,
            });
          }
        }
      }

      setResults(found);
      setScanning(false);
      setOpen(true);
    }, 50);
  }, [state.entries, state.translations]);

  const handleAccept = useCallback((result: BalanceResult) => {
    onApplyFix(result.key, result.after);
    setResults(prev => prev?.filter(r => r.key !== result.key) || null);
  }, [onApplyFix]);

  const handleReject = useCallback((key: string) => {
    setResults(prev => prev?.filter(r => r.key !== key) || null);
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!results) return;
    onApplyAll(results.map(r => ({ key: r.key, value: r.after })));
    setResults(null);
  }, [results, onApplyAll]);

  const handleRejectAll = useCallback(() => {
    setResults(null);
  }, []);

  if (dismissed) return null;

  return (
    <Card className="mb-4 border-accent/30 bg-accent/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent" />
              <span className="font-display font-bold text-sm">⚖️ إعادة توازن الأسطر</span>
              {results && results.length > 0 && (
                <Badge variant="secondary" className="text-xs">{results.length} نص</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-7"
                onClick={(e) => { e.stopPropagation(); handleScan(); }}
                disabled={scanning}
              >
                {scanning ? (
                  <><Sparkles className="w-3 h-3 animate-spin" /> جاري الفحص...</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> فحص الكلمات اليتيمة</>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setDismissed(true); }}>
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-3">
            {/* No results yet */}
            {!results && !scanning && (
              <p className="text-xs text-muted-foreground text-center py-2">
                يكتشف النصوص التي تحتوي أسطراً بكلمة يتيمة واحدة ويعيد توازنها تلقائياً
              </p>
            )}

            {/* Clean */}
            {results && results.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-3">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-display">لا توجد كلمات يتيمة ✨</span>
              </div>
            )}

            {/* Results with comparison */}
            {results && results.length > 0 && (
              <>
                {/* Bulk actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-body text-muted-foreground">
                    {results.length} نص يحتوي كلمات يتيمة
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" className="text-xs h-7" onClick={handleAcceptAll}>
                      <Check className="w-3 h-3 ml-1" /> موافقة للكل ({results.length})
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-destructive border-destructive/30" onClick={handleRejectAll}>
                      <XCircle className="w-3 h-3 ml-1" /> رفض الكل
                    </Button>
                  </div>
                </div>

                {/* Individual results */}
                <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1">
                  {results.slice(0, 100).map((result) => (
                    <div key={result.key} className="bg-background/50 rounded-lg border border-border/50 p-3 space-y-2">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[250px]" dir="ltr">
                          {result.label}
                        </span>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleAccept(result)}
                          >
                            <Check className="w-3.5 h-3.5 ml-1" /> موافقة
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleReject(result.key)}
                          >
                            <X className="w-3.5 h-3.5 ml-1" /> رفض
                          </Button>
                        </div>
                      </div>

                      {/* Comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <LinesPreview text={result.before} variant="before" />
                        <LinesPreview text={result.after} variant="after" />
                      </div>
                    </div>
                  ))}
                  {results.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      و {results.length - 100} نص آخر...
                    </p>
                  )}
                </div>
              </>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
