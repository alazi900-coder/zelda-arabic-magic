import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { hasArabicPresentationForms } from "@/lib/arabic-processing";
import { ExtractedEntry, EditorState, categorizeFile, categorizeBdatTable, hasTechnicalTags } from "@/components/editor/types";

export interface QualityStats {
  tooLong: number;
  nearLimit: number;
  missingTags: number;
  placeholderMismatch: number;
  total: number;
  problemKeys: Set<string>;
  damagedTags: number;
  damagedTagKeys: Set<string>;
}

export interface NeedsImproveCount {
  total: number;
  tooShort: number;
  tooLong: number;
  stuck: number;
  mixed: number;
}

interface UseEditorQualityProps {
  state: EditorState | null;
}

// Per-entry cached result
interface EntryCacheResult {
  translation: string;
  cat: string;
  isTranslated: boolean;
  qTooLong: boolean;
  qNearLimit: boolean;
  qMissingTags: boolean;
  qPlaceholderMismatch: boolean;
  damagedTags: boolean;
  niTooShort: boolean;
  niTooLong: boolean;
  niStuck: boolean;
  niMixed: boolean;
}

export function useEditorQuality({ state }: UseEditorQualityProps) {
  const [categoryProgress, setCategoryProgress] = useState<Record<string, { total: number; translated: number }>>({});
  const [qualityStats, setQualityStats] = useState<QualityStats>({ tooLong: 0, nearLimit: 0, missingTags: 0, placeholderMismatch: 0, total: 0, problemKeys: new Set<string>(), damagedTags: 0, damagedTagKeys: new Set<string>() });
  const [needsImproveCount, setNeedsImproveCount] = useState<NeedsImproveCount>({ total: 0, tooShort: 0, tooLong: 0, stuck: 0, mixed: 0 });
  const [translatedCount, setTranslatedCount] = useState(0);
  const combinedStatsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Cache: key -> { translation, results }
  const cacheRef = useRef<Map<string, EntryCacheResult>>(new Map());
  const encoderRef = useRef(new TextEncoder());

  // === Quality helper functions ===

  return {
    // Stats
    categoryProgress,
    qualityStats,
    needsImproveCount,
    translatedCount,

    // Quality helpers
    isTranslationTooShort,
    isTranslationTooLong,
    hasStuckChars,
    isMixedLanguage,
    needsImprovement,
  };
}
