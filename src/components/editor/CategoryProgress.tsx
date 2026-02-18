import React from "react";
import { Progress } from "@/components/ui/progress";
import { FILE_CATEGORIES, BDAT_CATEGORIES, categorizeFile } from "./types";
import { AlertTriangle, Wrench, Loader2, Sparkles, RefreshCw } from "lucide-react";

interface CategoryProgressProps {
  categoryProgress: Record<string, { total: number; translated: number }>;
  filterCategory: string[];
  setFilterCategory: (cat: string[]) => void;
  damagedTagsCount?: number;
  onFilterDamagedTags?: () => void;
  isDamagedTagsActive?: boolean;
  onFixDamagedTags?: () => void;
  isFixing?: boolean;
  onLocalFixDamagedTags?: () => void;
  onRedistributeTags?: () => void;
  tagsCount?: number;
  isBdat?: boolean;
}

const CategoryProgress: React.FC<CategoryProgressProps> = ({ categoryProgress, filterCategory, setFilterCategory, damagedTagsCount = 0, onFilterDamagedTags, isDamagedTagsActive, onFixDamagedTags, isFixing, onLocalFixDamagedTags, onRedistributeTags, tagsCount = 0, isBdat = false }) => {
  const categories = isBdat ? BDAT_CATEGORIES : FILE_CATEGORIES;
  const activeCats = categories.filter(cat => categoryProgress[cat.id]);
  if (activeCats.length === 0 && !categoryProgress['other']) return null;

  return (
    <div>
      {filterCategory.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-body">
            {filterCategory.length} فئة محددة
          </span>
          <button
            onClick={() => setFilterCategory([])}
            className="text-xs text-destructive hover:text-destructive/80 font-display"
          >
            مسح الكل ✕
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
      {/* Damaged tags warning card */}
      {damagedTagsCount > 0 && (
        <div
          className={`p-2 rounded-lg border text-xs text-right transition-colors ${
            isDamagedTagsActive
              ? 'border-destructive bg-destructive/10'
              : 'border-destructive/40 bg-destructive/5 hover:border-destructive/60'
          }`}
        >
          <button onClick={onFilterDamagedTags} className="w-full text-right">
            <div className="flex items-center justify-between mb-1">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="font-mono text-destructive font-bold">{damagedTagsCount}</span>
            </div>
            <p className="font-display font-bold truncate text-destructive">رموز تالفة ⚠️</p>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onLocalFixDamagedTags?.(); }}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive font-bold text-[11px] transition-colors"
          >
            <Wrench className="w-3 h-3" />
            🔧 إصلاح محلي (بدون AI)
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onFixDamagedTags?.(); }}
            disabled={isFixing}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-[10px] transition-colors disabled:opacity-50"
          >
            {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isFixing ? 'جارٍ الإصلاح...' : 'إعادة ترجمة بالـ AI'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRedistributeTags?.(); }}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[10px] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            إعادة توزيع الرموز
          </button>
        </div>
      )}
      {/* Redistribute tags card — shows when tags exist but no damaged ones */}
      {damagedTagsCount === 0 && tagsCount > 0 && (
        <div className="p-2 rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs text-right">
          <div className="flex items-center justify-between mb-1">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-amber-400 font-bold">{tagsCount}</span>
          </div>
          <p className="font-display font-bold truncate text-amber-400">نصوص برموز تقنية</p>
          <button
            onClick={onRedistributeTags}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[11px] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            إعادة توزيع الرموز
          </button>
        </div>
      )}
      {FILE_CATEGORIES.filter(cat => categoryProgress[cat.id]).map(cat => {
        const prog = categoryProgress[cat.id];
        const pct = prog.total > 0 ? Math.round((prog.translated / prog.total) * 100) : 0;
        return (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(
              filterCategory.includes(cat.id)
                ? filterCategory.filter(c => c !== cat.id)
                : [...filterCategory, cat.id]
            )}
            className={`p-2 rounded-lg border text-xs text-right transition-colors ${
              filterCategory.includes(cat.id)
                ? 'border-primary bg-primary/10'
                : 'border-border/50 bg-card/50 hover:border-primary/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span>{cat.emoji}</span>
              <span className="font-mono text-muted-foreground">{pct}%</span>
            </div>
            <p className="font-display font-bold truncate">{cat.label}</p>
            <Progress value={pct} className="h-1 mt-1" />
            <p className="text-muted-foreground mt-1">{prog.translated}/{prog.total}</p>
          </button>
        );
      })}
      {categoryProgress['other'] && (
        <button
          onClick={() => setFilterCategory(
            filterCategory.includes("other")
              ? filterCategory.filter(c => c !== "other")
              : [...filterCategory, "other"]
          )}
          className={`p-2 rounded-lg border text-xs text-right transition-colors ${
            filterCategory.includes("other")
              ? 'border-primary bg-primary/10'
              : 'border-border/50 bg-card/50 hover:border-primary/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span>📁</span>
            <span className="font-mono text-muted-foreground">
              {categoryProgress['other'].total > 0 ? Math.round((categoryProgress['other'].translated / categoryProgress['other'].total) * 100) : 0}%
            </span>
          </div>
          <p className="font-display font-bold truncate">أخرى</p>
          <Progress value={categoryProgress['other'].total > 0 ? (categoryProgress['other'].translated / categoryProgress['other'].total) * 100 : 0} className="h-1 mt-1" />
          <p className="text-muted-foreground mt-1">{categoryProgress['other'].translated}/{categoryProgress['other'].total}</p>
        </button>
      )}
      </div>
    </div>
  );
};

export default CategoryProgress;
