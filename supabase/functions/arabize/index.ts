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

// BiDi reversal for LTR game engine - no reshaping needed (game handles Arabic shaping natively)
function reverseBidi(text: string): string {
  return text.split('\n').map(line => {
    // Split line into segments: Arabic runs vs LTR runs (Latin, digits, punctuation)
    // This ensures numbers and English words maintain correct LTR order after reversal
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
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
        // Neutral chars (spaces, punctuation) - attach to current run
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    // Reverse segment order (RTL base), but keep LTR segment content intact
    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text; // Keep English/numbers in original order
      return [...seg.text].reverse().join(''); // Reverse Arabic characters
    }).join('');
  }).join('\n');
}

function processArabicText(text: string): string {
  // Skip processing for text with no Arabic characters (keep English as-is)
  if (!hasArabicChars(text)) return text;
  // Only reverse for BiDi - NO reshaping needed (game engine handles Arabic shaping natively)
  return reverseBidi(text);
}

interface MsbtEntry {
  label: string;
  originalText: string;
  processedText: string;
  offset: number;
  size: number;
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
        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          if (charCode === 0x0E) {
            const tagSize = view.getUint16(absOffset + j + 4, true);
            j += 4 + tagSize;
            text += '\uFFFC';
            continue;
          }
          text += String.fromCharCode(charCode);
        }

        const processed = processArabicText(text);
        entries.push({ label: `entry_${i}`, originalText: text, processedText: processed, offset: absOffset, size: textLength });
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }

  return { entries, raw: data };
}

function injectMSBT(data: Uint8Array, entries: MsbtEntry[]): Uint8Array {
  const result = new Uint8Array(data);
  const view = new DataView(result.buffer);
  for (const entry of entries) {
    const encoded = new Uint8Array(entry.processedText.length * 2);
    for (let i = 0; i < entry.processedText.length; i++) {
      const code = entry.processedText.charCodeAt(i);
      encoded[i * 2] = code & 0xFF;
      encoded[i * 2 + 1] = (code >> 8) & 0xFF;
    }
    if (encoded.length <= entry.size - 2) {
      result.set(encoded, entry.offset);
      view.setUint16(entry.offset + encoded.length, 0, true);
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

// Decompress lang file helper
function decompressLangFile(langData: Uint8Array, dictData: Uint8Array, langFileName: string): { sarcData: Uint8Array; rawDict: Uint8Array | null } {
  const isSARC = String.fromCharCode(...langData.slice(0, 4)) === 'SARC';
  if (isSARC) return { sarcData: langData, rawDict: null };

  const isZstd = langData[0] === 0x28 && langData[1] === 0xB5 && langData[2] === 0x2F && langData[3] === 0xFD;
  if (!isZstd) throw new Error('الملف غير معروف: لا يبدو أنه SARC مضغوط أو SARC غير مضغوط');

  // Decompress dictionary SARC
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
    const mode = url.searchParams.get('mode') || 'auto'; // 'auto' | 'extract' | 'build'

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

    // Decompress
    const { sarcData, rawDict } = decompressLangFile(langData, dictData, langFile.name || '');

    // Extract SARC
    const files = parseSARC(sarcData);
    console.log(`Extracted ${files.length} files from SARC`);

    // ===== EXTRACT MODE: Return all entries as JSON =====
    if (mode === 'extract') {
      const allEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number }[] = [];

      for (const file of files) {
        if (file.name.endsWith('.msbt')) {
          try {
            const { entries } = parseMSBT(file.data);
            for (let i = 0; i < entries.length; i++) {
              allEntries.push({
                msbtFile: file.name,
                index: i,
                label: entries[i].label,
                original: entries[i].originalText,
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

    // ===== BUILD MODE: Use custom translations =====
    // translations = JSON map: { "msbtFile:index": "translated text" }
    // protectedEntries = Array of keys that should skip BiDi processing
    const translationsRaw = formData.get('translations') as string | null;
    const protectedRaw = formData.get('protectedEntries') as string | null;
    const translations: Record<string, string> = translationsRaw ? JSON.parse(translationsRaw) : {};
    const protectedEntries = new Set(protectedRaw ? JSON.parse(protectedRaw) : []);
    const hasCustomTranslations = Object.keys(translations).length > 0;

    let modifiedCount = 0;
    const processedFiles = files.map(file => {
      if (file.name.endsWith('.msbt')) {
        try {
          const { entries, raw } = parseMSBT(file.data);

          if (hasCustomTranslations) {
            // Apply custom translations with Arabic processing
            for (let i = 0; i < entries.length; i++) {
              const key = `${file.name}:${i}`;
              if (translations[key] !== undefined && translations[key] !== '') {
                // If entry is protected, skip processing (keep original or don't apply BiDi)
                if (protectedEntries.has(key) || translations[key] === entries[i].originalText) {
                  // Keep original - no processing needed
                  modifiedCount++;
                } else {
                  entries[i].processedText = processArabicText(translations[key]);
                  modifiedCount++;
                }
              }
            }
          } else {
            // Auto mode: process all entries
            modifiedCount += entries.length;
          }

          const injected = injectMSBT(raw, entries);
          return { ...file, data: injected };
        } catch (e) {
          console.warn(`Failed to process MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
          return file;
        }
      }
      return file;
    });

    console.log(`Modified ${modifiedCount} entries (mode: ${hasCustomTranslations ? 'custom' : 'auto'})`);

    // Repack
    const repackedData = packSARC(processedFiles, sarcData);

    // Re-compress
    let outputData: Uint8Array = repackedData;
    let isCompressed = false;
    try {
      console.log(`Re-compressing SARC (${repackedData.length} bytes)...`);
      if (rawDict) {
        const cctx = createCCtx();
        // Level 3 (default) to avoid CPU time limit on edge functions
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

    // Preview
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
