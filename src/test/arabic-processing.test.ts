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
});
