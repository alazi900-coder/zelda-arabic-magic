import { describe, it, expect } from 'vitest';
import { reshapeArabic, reverseBidi, processArabicText, hasArabicPresentationForms } from '@/lib/arabic-processing';

describe('Arabic Processing', () => {
  it('reshapeArabic should produce presentation forms', () => {
    const input = 'متابعة اللعب';
    const reshaped = reshapeArabic(input);
    
    // All Arabic chars should now be in Presentation Forms range
    console.log('Input:', input);
    console.log('Input codes:', [...input].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Reshaped:', reshaped);
    console.log('Reshaped codes:', [...reshaped].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    expect(hasArabicPresentationForms(reshaped)).toBe(true);
  });

  it('processArabicText should reshape and reverse', () => {
    const input = 'متابعة اللعب';
    const result = processArabicText(input);
    
    console.log('Input:', input);
    console.log('Input codes:', [...input].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Processed:', result);
    console.log('Processed codes:', [...result].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    expect(hasArabicPresentationForms(result)).toBe(true);
  });

  it('reverseBidi after reshape should reverse character order', () => {
    const input = 'لعبة جديدة';
    const reshaped = reshapeArabic(input);
    const reversed = reverseBidi(reshaped);
    
    console.log('Reshaped codes:', [...reshaped].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Reversed codes:', [...reversed].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    // reversed should be the reverse of reshaped
    const reshapedChars = [...reshaped];
    const reversedChars = [...reversed];
    expect(reversedChars.length).toBe(reshapedChars.length);
    expect(reversedChars).toEqual(reshapedChars.reverse());
  });

  it('simple word test', () => {
    const input = 'مرحبا';
    const result = processArabicText(input);
    console.log('Input:', input, [...input].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(' '));
    console.log('Result:', result, [...result].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(' '));
  });

  describe('Atomic tag grouping in BiDi reversal', () => {
    it('should preserve internal order of consecutive PUA markers', () => {
      // Simulate: Arabic word + two consecutive PUA tags + Arabic word
      const input = '\uFEE3\uFEE4\uE000\uE001\uFEB3\uFEB4'; // reshaped Arabic with PUA tags in middle
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      // Find the PUA group in the reversed output
      const puaStart = chars.findIndex(c => c.charCodeAt(0) >= 0xE000 && c.charCodeAt(0) <= 0xE0FF);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      // The two PUA chars must stay in original order: E000 then E001
      expect(chars[puaStart].charCodeAt(0)).toBe(0xE000);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
    });

    it('should preserve internal order of consecutive display markers (FFF9-FFFC)', () => {
      const input = '\uFEE3\uFFF9\uFFFA\uFFFB\uFEB3';
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      const tagStart = chars.findIndex(c => c.charCodeAt(0) >= 0xFFF9 && c.charCodeAt(0) <= 0xFFFC);
      expect(tagStart).toBeGreaterThanOrEqual(0);
      expect(chars[tagStart].charCodeAt(0)).toBe(0xFFF9);
      expect(chars[tagStart + 1].charCodeAt(0)).toBe(0xFFFA);
      expect(chars[tagStart + 2].charCodeAt(0)).toBe(0xFFFB);
    });

    it('should preserve order of mixed PUA and display markers together', () => {
      const input = '\uFEE3\uE000\uE001\uE002\uFEB3';
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart].charCodeAt(0)).toBe(0xE000);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
      expect(chars[puaStart + 2].charCodeAt(0)).toBe(0xE002);
    });

    it('should not break when no technical markers exist', () => {
      const input = '\uFEE3\uFEE4\uFEB3\uFEB4';
      const reversed = reverseBidi(input);
      const chars = [...reversed];
      // Just reversed Arabic, no markers to worry about
      expect(chars.length).toBe(4);
    });
  });
});
