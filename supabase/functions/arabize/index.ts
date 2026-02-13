import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  init,
  createDCtx,
  decompressUsingDict,
  createCCtx,
  compressUsingDict,
  decompress,
  compress,
} from "https://deno.land/x/zstd_wasm@0.0.21/deno/zstd.ts";

await init();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Check if a char is Arabic (standard range)
function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function hasArabicChars(text: string): boolean {
  return [...text].some(ch => isArabicChar(ch));
}

// Check if text already has Arabic Presentation Forms (already reshaped/arabized)
function hasArabicPresentationForms(text: string): boolean {
  return [...text].some(ch => {
    const code = ch.charCodeAt(0);
    return (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
  });
}

// ============= Arabic Reshaping =============
// Maps base Arabic characters to their Presentation Forms-B glyphs:
// [Isolated, Final, Initial, Medial]
// null means that form doesn't exist (char doesn't connect in that direction)
const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],       // ء Hamza
  0x0622: [0xFE81, 0xFE82, null, null],       // آ Alef Madda
  0x0623: [0xFE83, 0xFE84, null, null],       // أ Alef Hamza Above
  0x0624: [0xFE85, 0xFE86, null, null],       // ؤ Waw Hamza
  0x0625: [0xFE87, 0xFE88, null, null],       // إ Alef Hamza Below
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], // ئ Yeh Hamza
  0x0627: [0xFE8D, 0xFE8E, null, null],       // ا Alef
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], // ب Beh
  0x0629: [0xFE93, 0xFE94, null, null],       // ة Teh Marbuta
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], // ت Teh
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], // ث Theh
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], // ج Jeem
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4], // ح Hah
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], // خ Khah
  0x062F: [0xFEA9, 0xFEAA, null, null],       // د Dal
  0x0630: [0xFEAB, 0xFEAC, null, null],       // ذ Thal
  0x0631: [0xFEAD, 0xFEAE, null, null],       // ر Reh
  0x0632: [0xFEAF, 0xFEB0, null, null],       // ز Zain
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], // س Seen
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], // ش Sheen
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], // ص Sad
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], // ض Dad
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], // ط Tah
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], // ظ Zah
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], // ع Ain
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], // غ Ghain
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // ـ Tatweel
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], // ف Feh
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], // ق Qaf
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], // ك Kaf
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], // ل Lam
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], // م Meem
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], // ن Noon
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], // ه Heh
  0x0648: [0xFEED, 0xFEEE, null, null],       // و Waw
  0x0649: [0xFEEF, 0xFEF0, null, null],       // ى Alef Maksura
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4], // ي Yeh
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

function reshapeArabic(text: string): string {
  const chars = [...text];
  const result: string[] = [];
  
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    
    if (isTashkeel(code)) {
      result.push(chars[i]);
      continue;
    }
    
    // Skip PUA tag markers - pass through as-is
    if (code >= 0xE000 && code <= 0xE0FF) {
      result.push(chars[i]);
      continue;
    }
    
    const forms = ARABIC_FORMS[code];
    if (!forms) {
      result.push(chars[i]);
      continue;
    }
    
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

function getPrevArabicCode(chars: string[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue; // Skip PUA tag markers
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextArabicCode(chars: string[], index: number): number | null {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue; // Skip PUA tag markers
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

// ============= End Arabic Reshaping =============

// BiDi reversal for LTR game engine
function reverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const code = ch.charCodeAt(0);
      // PUA tag markers are treated as neutral (stay with current segment)
      if (code >= 0xE000 && code <= 0xE0FF) {
        current += ch;
        continue;
      }
      
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = '';
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = '';
        }
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

function processArabicText(text: string): string {
  if (!hasArabicChars(text)) return text;
  return reshapeArabic(reverseBidi(text));
}

// ============= Tag tracking =============
interface TagInfo {
  markerCode: number; // PUA character code (0xE000+)
  bytes: Uint8Array;  // raw tag bytes from MSBT
}

interface MsbtEntry {
  label: string;
  originalText: string;
  processedText: string;
  offset: number;
  size: number;
  tags: TagInfo[];
}

function parseMSBT(data: Uint8Array): { entries: MsbtEntry[]; raw: Uint8Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 8));
  if (!magic.startsWith('MsgStdBn')) throw new Error('Not a valid MSBT file');

  const entries: MsbtEntry[] = [];
  let pos = 0x20;

  while (pos < data.length - 16) {
    const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);

    if (sectionMagic === 'TXT2') {
      const txt2Start = pos + 16;
      const entryCount = view.getUint32(txt2Start, true);

      for (let i = 0; i < entryCount; i++) {
        const entryOffset = view.getUint32(txt2Start + 4 + i * 4, true);
        const nextOffset = i < entryCount - 1
          ? view.getUint32(txt2Start + 4 + (i + 1) * 4, true)
          : sectionSize;

        const absOffset = txt2Start + entryOffset;
        const textLength = nextOffset - entryOffset;

        let text = '';
        const tags: TagInfo[] = [];

        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          if (charCode === 0x0E) {
            // Tag: 0x0E (2 bytes) + group (2 bytes) + size (2 bytes) + data (size bytes)
            const tagSize = view.getUint16(absOffset + j + 4, true);
            const totalTagBytes = 6 + tagSize;
            const markerCode = 0xE000 + tags.length;
            // Copy tag bytes (create a proper copy, not a view)
            const tagBytes = new Uint8Array(totalTagBytes);
            for (let b = 0; b < totalTagBytes; b++) {
              tagBytes[b] = data[absOffset + j + b];
            }
            tags.push({ markerCode, bytes: tagBytes });
            j += 4 + tagSize;
            text += String.fromCharCode(markerCode); // PUA marker instead of \uFFFC
            continue;
          }
          text += String.fromCharCode(charCode);
        }

        // DON'T apply processArabicText here - keep raw text
        // Processing will be applied selectively in build mode
        entries.push({
          label: `entry_${i}`,
          originalText: text,
          processedText: text, // same as original - no processing yet
          offset: absOffset,
          size: textLength,
          tags,
        });
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }

  return { entries, raw: data };
}

function injectMSBT(data: Uint8Array, entries: MsbtEntry[], entriesToModify?: Set<number>): Uint8Array {
  const result = new Uint8Array(data);
  const view = new DataView(result.buffer);

  for (let idx = 0; idx < entries.length; idx++) {
    // Skip entries not in the modify set (if provided)
    if (entriesToModify && !entriesToModify.has(idx)) continue;

    const entry = entries[idx];

    // Build tag lookup from PUA markers
    const tagMap = new Map<number, Uint8Array>();
    for (const tag of entry.tags) {
      tagMap.set(tag.markerCode, tag.bytes);
    }

    // Encode processedText, preserving tag bytes
    const outputBytes: number[] = [];
    for (let i = 0; i < entry.processedText.length; i++) {
      const code = entry.processedText.charCodeAt(i);
      const tagBytes = tagMap.get(code);
      if (tagBytes) {
        // Write original tag bytes instead of the PUA marker
        for (const b of tagBytes) outputBytes.push(b);
      } else {
        // Write character as UTF-16LE
        outputBytes.push(code & 0xFF);
        outputBytes.push((code >> 8) & 0xFF);
      }
    }

    if (outputBytes.length <= entry.size - 2) {
      for (let i = 0; i < outputBytes.length; i++) {
        result[entry.offset + i] = outputBytes[i];
      }
      // Null terminator
      view.setUint16(entry.offset + outputBytes.length, 0, true);
    } else {
      console.warn(`⚠️ Skipping entry ${idx} "${entry.label}" - encoded size (${outputBytes.length} bytes) exceeds slot size (${entry.size - 2} bytes)`);
    }
  }
  return result;
}

interface SarcFile { name: string; data: Uint8Array; }

function parseSARC(data: Uint8Array): SarcFile[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 4));
  if (magic !== 'SARC') throw new Error('Not a valid SARC archive');

  const headerSize = view.getUint16(4, true);
  const dataOffset = view.getUint32(0x0C, true);
  const sfatOffset = headerSize;
  const sfatMagic = String.fromCharCode(...data.slice(sfatOffset, sfatOffset + 4));
  if (sfatMagic !== 'SFAT') throw new Error('Missing SFAT section');

  const nodeCount = view.getUint16(sfatOffset + 6, true);
  const sfntOffset = sfatOffset + 12 + nodeCount * 16;
  const files: SarcFile[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const nodeOffset = sfatOffset + 12 + i * 16;
    const nameOffset = (view.getUint32(nodeOffset + 4, true) & 0x00FFFFFF) * 4;
    const fileDataStart = view.getUint32(nodeOffset + 8, true);
    const fileDataEnd = view.getUint32(nodeOffset + 12, true);

    let name = '';
    let p = sfntOffset + 8 + nameOffset;
    while (p < data.length && data[p] !== 0) { name += String.fromCharCode(data[p]); p++; }

    files.push({ name, data: data.slice(dataOffset + fileDataStart, dataOffset + fileDataEnd) });
  }
  return files;
}

function packSARC(files: SarcFile[], originalData: Uint8Array): Uint8Array {
  const view = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);
  const headerSize = view.getUint16(4, true);
  const dataOffset = view.getUint32(0x0C, true);
  const sfatOffset = headerSize;
  const nodeCount = view.getUint16(sfatOffset + 6, true);
  const result = new Uint8Array(originalData);

  for (let i = 0; i < nodeCount && i < files.length; i++) {
    const nodeOffset = sfatOffset + 12 + i * 16;
    const fileDataStart = view.getUint32(nodeOffset + 8, true);
    const fileDataEnd = view.getUint32(nodeOffset + 12, true);
    const originalSize = fileDataEnd - fileDataStart;
    if (files[i].data.length <= originalSize) {
      result.set(files[i].data, dataOffset + fileDataStart);
    }
  }
  return result;
}

function decompressLangFile(langData: Uint8Array, dictData: Uint8Array, langFileName: string): { sarcData: Uint8Array; rawDict: Uint8Array | null } {
  const isSARC = String.fromCharCode(...langData.slice(0, 4)) === 'SARC';
  if (isSARC) return { sarcData: langData, rawDict: null };

  const isZstd = langData[0] === 0x28 && langData[1] === 0xB5 && langData[2] === 0x2F && langData[3] === 0xFD;
  if (!isZstd) throw new Error('الملف غير معروف: لا يبدو أنه SARC مضغوط أو SARC غير مضغوط');

  let dictSarcData: Uint8Array;
  try { dictSarcData = decompress(dictData); } catch { dictSarcData = dictData; }

  const dictFiles = parseSARC(dictSarcData);
  console.log(`Found ${dictFiles.length} dictionaries: ${dictFiles.map(f => f.name).join(', ')}`);

  let rawDict: Uint8Array | null = null;
  let selectedDictName = '';
  const lowerName = langFileName.toLowerCase();

  if (lowerName.includes('.pack.')) {
    const f = dictFiles.find(f => f.name.endsWith('pack.zsdic'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict && lowerName.includes('.bcett.byml.')) {
    const f = dictFiles.find(f => f.name.endsWith('bcett.byml.zsdic'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict) {
    const f = dictFiles.find(f => f.name.endsWith('zs.zsdic') && !f.name.includes('pack') && !f.name.includes('bcett'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict && dictFiles.length > 0) { rawDict = dictFiles[0].data; selectedDictName = dictFiles[0].name; }
  if (!rawDict) throw new Error('لم يتم العثور على قاموس .zsdic في ملف القاموس');

  console.log(`Using dictionary: ${selectedDictName} (${rawDict.length} bytes)`);
  const dctx = createDCtx();
  const sarcData = decompressUsingDict(dctx, langData, rawDict);
  console.log(`Decompressed: ${langData.length} -> ${sarcData.length} bytes`);

  return { sarcData, rawDict };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'auto';

    const formData = await req.formData();
    const langFile = formData.get('langFile') as File;
    const dictFile = formData.get('dictFile') as File;

    if (!langFile || !dictFile) {
      return new Response(
        JSON.stringify({ error: 'يجب رفع ملف اللغة وملف القاموس' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const langData = new Uint8Array(await langFile.arrayBuffer());
    const dictData = new Uint8Array(await dictFile.arrayBuffer());

    const { sarcData, rawDict } = decompressLangFile(langData, dictData, langFile.name || '');

    const files = parseSARC(sarcData);
    console.log(`Extracted ${files.length} files from SARC`);

    // ===== EXTRACT MODE =====
    if (mode === 'extract') {
      const allEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number }[] = [];

      for (const file of files) {
        if (file.name.endsWith('.msbt')) {
          try {
            const { entries } = parseMSBT(file.data);
            for (let i = 0; i < entries.length; i++) {
              // Convert PUA markers back to \uFFFC for display in the editor
              const displayText = entries[i].originalText.replace(/[\uE000-\uE0FF]/g, '\uFFFC');
              allEntries.push({
                msbtFile: file.name,
                index: i,
                label: entries[i].label,
                original: displayText,
                maxBytes: entries[i].size,
              });
            }
          } catch (e) {
            console.warn(`Failed to parse MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
          }
        }
      }

      console.log(`Extract mode: found ${allEntries.length} entries across ${files.filter(f => f.name.endsWith('.msbt')).length} MSBT files`);

      return new Response(JSON.stringify({
        entries: allEntries,
        fileCount: files.length,
        msbtCount: files.filter(f => f.name.endsWith('.msbt')).length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== BUILD MODE =====
    const translationsRaw = formData.get('translations') as string | null;
    const protectedRaw = formData.get('protectedEntries') as string | null;
    const translations: Record<string, string> = translationsRaw ? JSON.parse(translationsRaw) : {};
    const protectedEntries = new Set(protectedRaw ? JSON.parse(protectedRaw) : []);
    const hasCustomTranslations = Object.keys(translations).length > 0;

    let modifiedCount = 0;
    let skippedOversize = 0;
    let skippedAlreadyArabized = 0;

    const processedFiles = files.map(file => {
      if (file.name.endsWith('.msbt')) {
        try {
          const { entries, raw } = parseMSBT(file.data);
          const entriesToModify = new Set<number>();

          if (hasCustomTranslations) {
            // BUILD mode with custom translations
            for (let i = 0; i < entries.length; i++) {
              const key = `${file.name}:${i}`;
              if (translations[key] !== undefined && translations[key] !== '') {
                // Convert \uFFFC in translation back to PUA markers from original entry
                let translationText = translations[key];
                let tagIdx = 0;
                translationText = translationText.replace(/\uFFFC/g, () => {
                  if (tagIdx < entries[i].tags.length) {
                    return String.fromCharCode(entries[i].tags[tagIdx++].markerCode);
                  }
                  return '\uFFFC'; // no corresponding tag, keep as-is
                });

                if (protectedEntries.has(key)) {
                  // Protected entry: apply reshaping only (NO BiDi reversal)
                  entries[i].processedText = reshapeArabic(translationText);
                } else if (translationText === entries[i].originalText) {
                  // Same as original - no processing needed, skip injection
                  continue;
                } else {
                  entries[i].processedText = processArabicText(translationText);
                }
                entriesToModify.add(i);
                modifiedCount++;
              }
              // Entries WITHOUT translations are NOT modified at all
            }
          } else {
            // AUTO mode (no custom translations) - process all non-arabized entries
            for (let i = 0; i < entries.length; i++) {
              if (hasArabicPresentationForms(entries[i].originalText)) {
                // Already arabized (has presentation forms) - skip to avoid double processing
                skippedAlreadyArabized++;
                continue;
              }
              entries[i].processedText = processArabicText(entries[i].originalText);
              entriesToModify.add(i);
              modifiedCount++;
            }
          }

          // Only inject entries that were actually modified
          const injected = injectMSBT(raw, entries, entriesToModify);
          return { ...file, data: injected };
        } catch (e) {
          console.warn(`Failed to process MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
          return file;
        }
      }
      return file;
    });

    console.log(`Modified ${modifiedCount} entries (mode: ${hasCustomTranslations ? 'custom' : 'auto'}), skipped already-arabized: ${skippedAlreadyArabized}`);

    const repackedData = packSARC(processedFiles, sarcData);

    let outputData: Uint8Array = repackedData;
    let isCompressed = false;
    try {
      console.log(`Re-compressing SARC (${repackedData.length} bytes)...`);
      if (rawDict) {
        const cctx = createCCtx();
        outputData = compressUsingDict(cctx, repackedData, rawDict, 3);
        isCompressed = true;
        console.log(`Compressed with dict: ${repackedData.length} -> ${outputData.length} bytes`);
      } else {
        outputData = compress(repackedData);
        isCompressed = true;
        console.log(`Compressed: ${repackedData.length} -> ${outputData.length} bytes`);
      }
    } catch (e) {
      console.error(`Re-compression failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    let entriesPreview: { label: string; original: string; processed: string }[] = [];
    try {
      for (const f of processedFiles) {
        if (f.name.endsWith('.msbt')) {
          const parsed = parseMSBT(f.data);
          entriesPreview = parsed.entries.slice(0, 20).map(e => ({
            label: e.label,
            original: e.originalText.substring(0, 100),
            processed: e.processedText.substring(0, 100),
          }));
          break;
        }
      }
    } catch { /* ignore */ }

    return new Response(outputData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="arabized_output.zs"',
        'X-Modified-Count': String(modifiedCount),
        'X-Skipped-Already-Arabized': String(skippedAlreadyArabized),
        'X-File-Size': String(repackedData.length),
        'X-Compressed-Size': isCompressed ? String(outputData.length) : '',
        'X-Is-Compressed': String(isCompressed),
        'X-Entries-Preview': encodeURIComponent(JSON.stringify(entriesPreview)),
      },
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
