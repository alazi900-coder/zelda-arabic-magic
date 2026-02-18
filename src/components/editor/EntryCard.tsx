import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Sparkles, Loader2, Tag, BookOpen, Wrench, Copy, Eye, Check, X, Table2, Columns3 } from "lucide-react";
import DebouncedInput from "./DebouncedInput";
import { ExtractedEntry, displayOriginal, hasArabicChars, isTechnicalText, hasTechnicalTags, previewTagRestore } from "./types";
import { utf16leByteLength } from "@/lib/byte-utils";
import { toast } from "@/hooks/use-toast";

interface EntryCardProps {
  entry: ExtractedEntry;
  translation: string;
  isProtected: boolean;
  hasProblem: boolean;
  isDamagedTag?: boolean;
  fuzzyScore?: number;
  isMobile: boolean;
  translatingSingle: string | null;
  improvingTranslations: boolean;
  previousTranslations: Record<string, string>;
  glossary?: string;
  isTranslationTooShort: (entry: ExtractedEntry, translation: string) => boolean;
  isTranslationTooLong: (entry: ExtractedEntry, translation: string) => boolean;
  hasStuckChars: (translation: string) => boolean;
  isMixedLanguage: (translation: string) => boolean;
  updateTranslation: (key: string, value: string) => void;
  handleTranslateSingle: (entry: ExtractedEntry) => void;
  handleImproveSingleTranslation: (entry: ExtractedEntry) => void;
  handleUndoTranslation: (key: string) => void;
  handleFixReversed: (entry: ExtractedEntry) => void;
  handleLocalFixDamagedTag?: (entry: ExtractedEntry) => void;
}

function findGlossaryMatches(original: string, glossary?: string): { term: string; translation: string }[] {
  if (!glossary?.trim() || !original?.trim()) return [];
  const origLower = original.toLowerCase();
  const matches: { term: string; translation: string }[] = [];
  for (const line of glossary.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const eng = trimmed.slice(0, eqIdx).trim();
    const arb = trimmed.slice(eqIdx + 1).trim();
    if (!eng || !arb) continue;
    // Word-boundary partial match (case-insensitive)
    const engLower = eng.toLowerCase();
    const regex = new RegExp(`\\b${engLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(origLower)) {
      matches.push({ term: eng, translation: arb });
    }
  }
  // Sort by term length descending (longer matches first)
  return matches.sort((a, b) => b.term.length - a.term.length).slice(0, 6);
}

const EntryCard: React.FC<EntryCardProps> = ({
  entry, translation, isProtected, hasProblem, isDamagedTag, fuzzyScore, isMobile,
  translatingSingle, improvingTranslations, previousTranslations, glossary,
  isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage,
  updateTranslation, handleTranslateSingle, handleImproveSingleTranslation,
  handleUndoTranslation, handleFixReversed, handleLocalFixDamagedTag,
}) => {
  const key = `${entry.msbtFile}:${entry.index}`;
  const isTech = isTechnicalText(entry.original);
  const [showTagPreview, setShowTagPreview] = useState(false);

  const tagPreview = useMemo(() => {
    if (!isDamagedTag || !translation?.trim()) return null;
    return previewTagRestore(entry.original, translation);
  }, [isDamagedTag, entry.original, translation]);

  const handleCopyTags = () => {
    const charRegex = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
    const tags = entry.original.match(charRegex);
    if (tags) {
      navigator.clipboard.writeText(tags.join('')).then(() => {
        toast({ title: "📋 تم النسخ", description: `تم نسخ ${tags.length} رمز تقني — الصقها في الترجمة يدوياً` });
      });
    }
  };

  const glossaryMatches = useMemo(
    () => findGlossaryMatches(entry.original, glossary),
    [entry.original, glossary]
  );

  return (
    <Card className={`p-3 md:p-4 border-border/50 hover:border-border transition-colors ${hasProblem ? 'border-destructive/30 bg-destructive/5' : ''}`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'items-start'} gap-3 md:gap-4`}>
        <div className="flex-1 min-w-0">
          {/* Table & column context for BDAT entries */}
          {(() => {
            const match = entry.label.match(/^(.+?)\[(\d+)\]\.(.+)$/);
            if (match) {
              const [, tblName, rowIdx, colName] = match;
              return (
                <div className="flex flex-wrap items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/20">
                    <Table2 className="w-3 h-3" /> {tblName}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                    <Columns3 className="w-3 h-3" /> {colName}
                  </span>
                  <span className="text-muted-foreground/60">صف {rowIdx}</span>
                </div>
              );
            }
            return <p className="text-xs text-muted-foreground mb-1 truncate">{entry.msbtFile} • {entry.label}</p>;
          })()}
          <p className="font-body text-sm mb-2 break-words">{displayOriginal(entry.original)}</p>
          {hasTechnicalTags(entry.original) && (
            <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
              💡 الرموز الملونة (⚙ تحكم • 🎨 تنسيق • 📌 متغير) أكواد خاصة بمحرك اللعبة — <span className="font-semibold text-accent">لا تحذفها من الترجمة</span>
            </p>
          )}
          {isTech && <p className="text-xs text-accent mb-2">⚠️ نص تقني - تحتاج حذر في الترجمة</p>}
          {hasProblem && (
            <p className="text-xs text-destructive mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> يحتاج مراجعة
            </p>
          )}
          {/* Glossary hints */}
          {glossaryMatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              <BookOpen className="w-3 h-3 text-primary/60 shrink-0" />
              {glossaryMatches.map((m, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {m.term} → {m.translation}
                </span>
              ))}
            </div>
          )}
          {translation?.trim() && (
            <div className="flex flex-wrap gap-1 mb-2">
              {isTranslationTooShort(entry, translation) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">📏 قصيرة جداً</span>
              )}
              {isTranslationTooLong(entry, translation) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">📐 تتجاوز الحد</span>
              )}
              {hasStuckChars(translation) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">🔤 أحرف ملتصقة</span>
              )}
              {isMixedLanguage(translation) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">🌐 عربي + إنجليزي</span>
              )}
              {isDamagedTag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">⚠️ رموز تالفة</span>
              )}
              {fuzzyScore != null && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${fuzzyScore >= 80 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : fuzzyScore >= 70 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}`}>
                  🔍 مطابقة جزئية {fuzzyScore}%
                </span>
              )}
            </div>
          )}
          {hasArabicChars(entry.original) && (!translation || translation === entry.original) && (
            <Button variant="ghost" size="sm" onClick={() => handleFixReversed(entry)} className="text-xs text-accent mb-2 h-7 px-2">
              <RotateCcw className="w-3 h-3" /> تصحيح المعكوس
            </Button>
          )}
          <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
            <DebouncedInput
              value={translation}
              onChange={(val) => updateTranslation(key, val)}
              placeholder="أدخل الترجمة..."
              className="flex-1 w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleTranslateSingle(entry)} disabled={translatingSingle === key} title="ترجمة هذا النص">
                {translatingSingle === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleImproveSingleTranslation(entry)} disabled={improvingTranslations || !translation?.trim()} title="تحسين هذه الترجمة">
                {improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-secondary" />}
              </Button>
              {isDamagedTag && handleLocalFixDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowTagPreview(prev => !prev)} title="👁 معاينة الإصلاح قبل التطبيق">
                  <Eye className="w-4 h-4 text-accent" />
                </Button>
              )}
              {isDamagedTag && handleLocalFixDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleLocalFixDamagedTag(entry)} title="🔧 إصلاح الرموز محلياً (بدون AI)">
                  <Wrench className="w-4 h-4 text-destructive" />
                </Button>
              )}
              {isDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopyTags} title="📋 نسخ الرموز التقنية من الأصل">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {isDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleTranslateSingle(entry)} disabled={translatingSingle === key} title="🤖 إعادة ترجمة بالـ AI">
                  {translatingSingle === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-destructive" />}
                </Button>
              )}
              {previousTranslations[key] !== undefined && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleUndoTranslation(key)} title="تراجع عن التعديل">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          {/* Tag restore preview */}
          {showTagPreview && tagPreview?.hasDiff && (
            <div className="mt-2 p-2 rounded border border-accent/30 bg-accent/5 text-xs space-y-1.5">
              <p className="font-semibold text-accent">👁 معاينة الإصلاح:</p>
              <div className="space-y-1">
                <div className="flex gap-2 items-start">
                  <span className="text-destructive shrink-0">قبل:</span>
                  <span dir="rtl" className="break-words">{displayOriginal(tagPreview.before)}</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-primary shrink-0">بعد:</span>
                  <span dir="rtl" className="break-words">{displayOriginal(tagPreview.after)}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => { handleLocalFixDamagedTag?.(entry); setShowTagPreview(false); }}>
                  <Check className="w-3 h-3 ml-1" /> تطبيق
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowTagPreview(false)}>
                  <X className="w-3 h-3 ml-1" /> إغلاق
                </Button>
              </div>
            </div>
          )}
          {/* Byte usage progress bar */}
          {entry.maxBytes > 0 && translation && (() => {
            const byteUsed = utf16leByteLength(translation);
            const ratio = byteUsed / entry.maxBytes;
            const percent = Math.min(ratio * 100, 100);
            const colorClass = ratio > 1 ? 'bg-destructive' : ratio > 0.85 ? 'bg-amber-500' : 'bg-primary';
            const warningLabel = ratio > 1 ? '⛔ تجاوز الحد!' : ratio > 0.85 ? '⚠️ اقتربت من الحد' : null;
            return (
              <div className="mt-1.5">
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mb-0.5">
                  <span>{byteUsed}/{entry.maxBytes} بايت</span>
                  <div className="flex items-center gap-1.5">
                    {warningLabel && <span className={`font-bold ${ratio > 1 ? 'text-destructive' : 'text-amber-600'}`}>{warningLabel}</span>}
                    <span className={ratio > 1 ? 'text-destructive font-bold' : ''}>{Math.round(ratio * 100)}%</span>
                  </div>
                </div>
                <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })()}
        </div>
        {!isMobile && (
          <div className="flex flex-col gap-1 items-center">
            {isProtected && <Tag className="w-5 h-5 text-accent" />}
          </div>
        )}
      </div>
    </Card>
  );
};

export default EntryCard;
