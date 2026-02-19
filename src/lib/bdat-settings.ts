/**
 * BDAT Project Settings
 * Centralized, persistent settings stored in localStorage.
 */

const STORAGE_KEY = "bdat-settings-v1";

export interface BdatSettings {
  /** Safety margin multiplier for byte budget (e.g. 1.2 = 20%). Range: 1.0–2.0 */
  safetyMargin: number;
}

const DEFAULTS: BdatSettings = {
  safetyMargin: 1.2,
};

export function loadBdatSettings(): BdatSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BdatSettings>;
    return {
      safetyMargin: clampMargin(parsed.safetyMargin ?? DEFAULTS.safetyMargin),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBdatSettings(settings: Partial<BdatSettings>): BdatSettings {
  const current = loadBdatSettings();
  const next: BdatSettings = {
    ...current,
    ...settings,
    safetyMargin: clampMargin(settings.safetyMargin ?? current.safetyMargin),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function clampMargin(v: number): number {
  return Math.min(Math.max(Number(v) || 1.0, 1.0), 2.0);
}

/** Utility: format margin as percentage string for display */
export function formatMarginPct(margin: number): string {
  return `${Math.round((margin - 1) * 100)}%`;
}
