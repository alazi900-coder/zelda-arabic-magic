import { describe, it, expect } from 'vitest';
import { detectMergedInWord, splitMergedSentences, scanAllTranslations } from '@/lib/arabic-sentence-splitter';

describe('arabic-sentence-splitter', () => {
  it('detects non-connecting letter merge', () => {
    // "مثلكلمة" — ل is connecting but let's test with ة
    const points = detectMergedInWord('كلمةجديدة');
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].rule).toBe('non-connecting');
  });

  it('splits merged words correctly', () => {
    const { result, splitCount } = splitMergedSentences('كلمةجديدة');
    expect(splitCount).toBeGreaterThan(0);
    expect(result).toContain(' ');
  });

  it('does not split normal Arabic text', () => {
    const { result, splitCount } = splitMergedSentences('كلمة جديدة');
    expect(splitCount).toBe(0);
    expect(result).toBe('كلمة جديدة');
  });

  it('does not split short words', () => {
    const { result, splitCount } = splitMergedSentences('من');
    expect(splitCount).toBe(0);
  });

  it('detects medial ال', () => {
    // "كتابالمدرسة" should detect ال in middle
    const { result, splitCount } = splitMergedSentences('كتابالمدرسة');
    expect(splitCount).toBeGreaterThan(0);
  });

  it('scanAllTranslations returns results for merged text', () => {
    const entries = [
      { msbtFile: 'test.bdat', index: 0, original: 'Hello' },
    ];
    const translations = { 'test.bdat:0': 'مرحباكيف الحال' };
    const results = scanAllTranslations(translations, entries);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].splits).toBeGreaterThan(0);
  });

  it('skips presentation forms text', () => {
    const { splitCount } = splitMergedSentences('\uFE8D\uFEE0\uFEE4\uFEA9\uFEAE\uFEB3\uFEA4');
    expect(splitCount).toBe(0);
  });

  it('detects ta marbuta followed by another word', () => {
    // "مدرسةكبيرة" = مدرسة + كبيرة
    const points = detectMergedInWord('مدرسةكبيرة');
    expect(points.length).toBeGreaterThan(0);
    // ة should be detected as a merge point somewhere
    expect(points.some(p => p.charBefore === '\u0629')).toBe(true);
  });

  it('detects alef maksura as word-ender', () => {
    // "علىالطاولة" = على + الطاولة
    const { splitCount } = splitMergedSentences('علىالطاولة');
    expect(splitCount).toBeGreaterThan(0);
  });

  it('detects hamza alone as non-connecting', () => {
    const points = detectMergedInWord('شيءجديد');
    expect(points.length).toBeGreaterThan(0);
  });

  it('handles short words with ta marbuta correctly', () => {
    // "كلمةجد" has 6 Arabic chars - should NOT split (threshold is 6)
    const { splitCount } = splitMergedSentences('كلمةجد');
    expect(splitCount).toBe(0);
  });
});
