import { X, AlertTriangle, Eye } from "lucide-react";

interface ZeldaDialoguePreviewProps {
  original: string;
  translation: string;
  label?: string;
  onClose: () => void;
}

const ZeldaDialoguePreview = ({ original, translation, label, onClose }: ZeldaDialoguePreviewProps) => {
  const originalLen = original.length;
  const translationLen = translation.length;
  const isOverLength = originalLen > 0 && translationLen > 0 && translationLen > originalLen * 1.2;
  const overPercent = originalLen > 0 ? Math.round(((translationLen - originalLen) / originalLen) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -left-3 z-10 w-8 h-8 rounded-full bg-card border-2 border-secondary flex items-center justify-center text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Zelda-style dialogue box */}
        <div className="rounded-xl border-2 border-secondary/60 bg-card/95 shadow-[0_0_30px_hsl(var(--secondary)/0.15),inset_0_1px_0_hsl(var(--secondary)/0.1)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-l from-secondary/20 via-primary/10 to-transparent border-b border-secondary/30">
            <Eye className="w-4 h-4 text-secondary" />
            <span className="font-display font-bold text-sm text-foreground">معاينة صندوق الحوار</span>
            {label && (
              <span className="text-xs text-muted-foreground font-body mr-auto truncate max-w-[200px]" title={label}>
                — {label}
              </span>
            )}
          </div>

          {/* Dialogue simulation area */}
          <div className="p-6 space-y-5">
            {/* Original text section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display font-semibold text-muted-foreground">النص الأصلي</span>
                <span className="text-xs text-muted-foreground font-body">{originalLen} حرف</span>
              </div>
              <div
                className="px-4 py-3 rounded-lg bg-muted/50 border border-border text-sm font-body leading-relaxed min-h-[48px]"
                dir="ltr"
              >
                {original || <span className="italic text-muted-foreground/50">(فارغ)</span>}
              </div>
            </div>

            {/* Decorative separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gradient-to-l from-transparent via-secondary/40 to-transparent" />
              <span className="text-secondary text-xs">▼</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-secondary/40 to-transparent" />
            </div>

            {/* Game-style dialogue box for translated text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display font-semibold text-secondary">النص المترجم (كما سيظهر في اللعبة)</span>
                <span className={`text-xs font-body ${isOverLength ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {translationLen} حرف
                </span>
              </div>

              {/* Zelda dialogue frame */}
              <div className="relative">
                <div
                  className={`px-5 py-4 rounded-lg border-2 text-base font-body leading-loose min-h-[64px] transition-colors ${
                    isOverLength
                      ? 'border-destructive/60 bg-destructive/5 shadow-[0_0_15px_hsl(var(--destructive)/0.1)]'
                      : 'border-secondary/40 bg-gradient-to-br from-card to-muted/30 shadow-[0_0_15px_hsl(var(--secondary)/0.08)]'
                  }`}
                  dir="rtl"
                >
                  {translation || <span className="italic text-muted-foreground/50">لم يتم إدخال ترجمة بعد...</span>}
                </div>

                {/* Zelda-style arrow indicator */}
                {translation && !isOverLength && (
                  <div className="absolute bottom-2 left-4 text-secondary animate-bounce text-sm">▾</div>
                )}
              </div>
            </div>

            {/* Length warning */}
            {isOverLength && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-xs font-display font-bold text-destructive">
                  ⚠️ النص أطول بنسبة {overPercent}% من الأصل ({translationLen}/{originalLen} حرف) — قد لا يتسع في صندوق الحوار
                </span>
              </div>
            )}

            {/* Length comparison bar */}
            {originalLen > 0 && translationLen > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-display">مقارنة الطول</span>
                  <span className="font-body">{Math.round((translationLen / originalLen) * 100)}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isOverLength
                        ? 'bg-gradient-to-l from-destructive to-destructive/70'
                        : 'bg-gradient-to-l from-primary to-secondary'
                    }`}
                    style={{ width: `${Math.min((translationLen / originalLen) * 100, 100)}%` }}
                  />
                </div>
                {/* 120% threshold marker */}
                <div className="relative w-full h-0">
                  <div
                    className="absolute -top-[14px] w-px h-2.5 bg-destructive/50"
                    style={{ right: `${100 - Math.min((120 / Math.max(translationLen / originalLen * 100, 120)) * 100, 100)}%` }}
                    title="حد 120%"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZeldaDialoguePreview;
