// Client-side Arabic text processing (ported from arabize edge function)

export function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

export function hasArabicChars(text: string): boolean {
  return [...text].some(ch => isArabicChar(ch));
}

export function hasArabicPresentationForms(text: string): boolean {
  return [...text].some(ch => {
    const code = ch.charCodeAt(0);
    return (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
  });
}

const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],
  0x0622: [0xFE81, 0xFE82, null, null],
  0x0623: [0xFE83, 0xFE84, null, null],
  0x0624: [0xFE85, 0xFE86, null, null],
  0x0625: [0xFE87, 0xFE88, null, null],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, null, null],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, null, null],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, null, null],
  0x0630: [0xFEAB, 0xFEAC, null, null],
  0x0631: [0xFEAD, 0xFEAE, null, null],
  0x0632: [0xFEAF, 0xFEB0, null, null],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, null, null],
  0x0649: [0xFEEF, 0xFEF0, null, null],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6],
  0x0623: [0xFEF7, 0xFEF8],
  0x0625: [0xFEF9, 0xFEFA],
  0x0627: [0xFEFB, 0xFEFC],
};

function canConnectAfter(code: number): boolean {
  const forms = ARABIC_FORMS[code];
  if (!forms) return false;
  return forms[2] !== null;
}

function isTashkeel(code: number): boolean {
  return code >= 0x064B && code <= 0x065F;
}

function getPrevArabicCode(chars: string[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextArabicCode(chars: string[], index: number): number | null {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

export function reshapeArabic(text: string): string {
  const chars = [...text];
  const result: string[] = [];
  
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    
    if (isTashkeel(code)) { result.push(chars[i]); continue; }
    if (code >= 0xE000 && code <= 0xE0FF) { result.push(chars[i]); continue; }
    
    const forms = ARABIC_FORMS[code];
    if (!forms) { result.push(chars[i]); continue; }
    
    if (code === 0x0644) {
      let nextIdx = i + 1;
      while (nextIdx < chars.length && isTashkeel(chars[nextIdx].charCodeAt(0))) nextIdx++;
      if (nextIdx < chars.length) {
        const nextCode = chars[nextIdx].charCodeAt(0);
        const ligature = LAM_ALEF_LIGATURES[nextCode];
        if (ligature) {
          const prevCode = getPrevArabicCode(chars, i);
          const prevConnects = prevCode !== null && canConnectAfter(prevCode);
          result.push(String.fromCharCode(prevConnects ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    
    const prevCode = getPrevArabicCode(chars, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextArabicCode(chars, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== undefined;
    
    let formIndex: number;
    if (prevConnects && nextExists && forms[2] !== null) {
      formIndex = 3;
      if (forms[3] === null) formIndex = 1;
    } else if (prevConnects) {
      formIndex = 1;
    } else if (nextExists && forms[2] !== null) {
      formIndex = 2;
    } else {
      formIndex = 0;
    }
    
    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }
  
  return result.join('');
}

export function reverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const code = ch.charCodeAt(0);
      if (code >= 0xE000 && code <= 0xE0FF) { current += ch; continue; }
      
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) { segments.push({ text: current, isLTR: true }); current = ''; }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) { segments.push({ text: current, isLTR: false }); current = ''; }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      return [...seg.text].reverse().join('');
    }).join('');
  }).join('\n');
}

const NUMERAL_MAP: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

export function convertToArabicNumerals(text: string): string {
  return [...text].map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0xE000 && code <= 0xE0FF) return ch;
    return NUMERAL_MAP[ch] || ch;
  }).join('');
}

export function mirrorPunctuation(text: string): string {
  const PUNCT_MAP: Record<string, string> = { '?': '؟', ',': '،', ';': '؛' };
  const BRACKET_MAP: Record<string, string> = { '(': ')', ')': '(' };
  
  return [...text].map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0xE000 && code <= 0xE0FF) return ch;
    return PUNCT_MAP[ch] || BRACKET_MAP[ch] || ch;
  }).join('');
}

export function processArabicText(text: string, options?: { arabicNumerals?: boolean; mirrorPunct?: boolean }): string {
  if (!hasArabicChars(text)) return text;
  let result = reshapeArabic(reverseBidi(text));
  if (options?.arabicNumerals) result = convertToArabicNumerals(result);
  if (options?.mirrorPunct) result = mirrorPunctuation(result);
  return result;
}
