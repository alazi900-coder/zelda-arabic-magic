import React from "react";
import { Progress } from "@/components/ui/progress";
import { FILE_CATEGORIES, categorizeFile } from "./types";

interface CategoryProgressProps {
  categoryProgress: Record<string, { total: number; translated: number }>;
  filterCategory: string;
  setFilterCategory: (cat: string) => void;
}

const CategoryProgress: React.FC<CategoryProgressProps> = ({ categoryProgress, filterCategory, setFilterCategory }) => {
  if (Object.keys(categoryProgress).length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
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
