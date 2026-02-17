import React from "react";
import { Progress } from "@/components/ui/progress";
import { FILE_CATEGORIES, categorizeFile } from "./types";
import { AlertTriangle, Wrench, Loader2 } from "lucide-react";

interface CategoryProgressProps {
  categoryProgress: Record<string, { total: number; translated: number }>;
  filterCategory: string;
  setFilterCategory: (cat: string) => void;
  damagedTagsCount?: number;
  onFilterDamagedTags?: () => void;
  isDamagedTagsActive?: boolean;
  onFixDamagedTags?: () => void;
  isFixing?: boolean;
}

const CategoryProgress: React.FC<CategoryProgressProps> = ({ categoryProgress, filterCategory, setFilterCategory, damagedTagsCount = 0, onFilterDamagedTags, isDamagedTagsActive, onFixDamagedTags, isFixing }) => {
  const activeCats = FILE_CATEGORIES.filter(cat => categoryProgress[cat.id]);
  if (activeCats.length === 0 && !categoryProgress['other']) return null;

  return (
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
            onClick={(e) => { e.stopPropagation(); onFixDamagedTags?.(); }}
            disabled={isFixing}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive font-bold text-[11px] transition-colors disabled:opacity-50"
          >
            {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
            {isFixing ? 'جارٍ الإصلاح...' : '🔧 إصلاح تلقائي'}
          </button>
        </div>
      )}
      {FILE_CATEGORIES.filter(cat => categoryProgress[cat.id]).map(cat => {
        const prog = categoryProgress[cat.id];
        const pct = prog.total > 0 ? Math.round((prog.translated / prog.total) * 100) : 0;
        return (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(filterCategory === cat.id ? "all" : cat.id)}
            className={`p-2 rounded-lg border text-xs text-right transition-colors ${
              filterCategory === cat.id
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
          onClick={() => setFilterCategory(filterCategory === "other" ? "all" : "other")}
          className={`p-2 rounded-lg border text-xs text-right transition-colors ${
            filterCategory === "other"
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
  );
};

export default CategoryProgress;
