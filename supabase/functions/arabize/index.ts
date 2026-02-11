import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Arabic character maps for reshaping
const ARABIC_CHARS: Record<string, [string, string, string, string]> = {
  // [isolated, initial, medial, final]
  'ا': ['ﺍ', 'ﺍ', 'ﺎ', 'ﺎ'],
  'أ': ['ﺃ', 'ﺃ', 'ﺄ', 'ﺄ'],
  'إ': ['ﺇ', 'ﺇ', 'ﺈ', 'ﺈ'],
  'آ': ['ﺁ', 'ﺁ', 'ﺂ', 'ﺂ'],
  'ب': ['ﺏ', 'ﺑ', 'ﺒ', 'ﺐ'],
  'ت': ['ﺕ', 'ﺗ', 'ﺘ', 'ﺖ'],
  'ث': ['ﺙ', 'ﺛ', 'ﺜ', 'ﺚ'],
  'ج': ['ﺝ', 'ﺟ', 'ﺠ', 'ﺞ'],
  'ح': ['ﺡ', 'ﺣ', 'ﺤ', 'ﺢ'],
  'خ': ['ﺥ', 'ﺧ', 'ﺨ', 'ﺦ'],
  'د': ['ﺩ', 'ﺩ', 'ﺪ', 'ﺪ'],
  'ذ': ['ﺫ', 'ﺫ', 'ﺬ', 'ﺬ'],
  'ر': ['ﺭ', 'ﺭ', 'ﺮ', 'ﺮ'],
  'ز': ['ﺯ', 'ﺯ', 'ﺰ', 'ﺰ'],
  'س': ['ﺱ', 'ﺳ', 'ﺴ', 'ﺲ'],
  'ش': ['ﺵ', 'ﺷ', 'ﺸ', 'ﺶ'],
  'ص': ['ﺹ', 'ﺻ', 'ﺼ', 'ﺺ'],
  'ض': ['ﺽ', 'ﺿ', 'ﻀ', 'ﺾ'],
  'ط': ['ﻁ', 'ﻃ', 'ﻄ', 'ﻂ'],
  'ظ': ['ﻅ', 'ﻇ', 'ﻈ', 'ﻆ'],
  'ع': ['ﻉ', 'ﻋ', 'ﻌ', 'ﻊ'],
  'غ': ['ﻍ', 'ﻏ', 'ﻐ', 'ﻎ'],
  'ف': ['ﻑ', 'ﻓ', 'ﻔ', 'ﻒ'],
  'ق': ['ﻕ', 'ﻗ', 'ﻘ', 'ﻖ'],
  'ك': ['ﻙ', 'ﻛ', 'ﻜ', 'ﻚ'],
  'ل': ['ﻝ', 'ﻟ', 'ﻠ', 'ﻞ'],
  'م': ['ﻡ', 'ﻣ', 'ﻤ', 'ﻢ'],
  'ن': ['ﻥ', 'ﻧ', 'ﻨ', 'ﻦ'],
  'ه': ['ﻩ', 'ﻫ', 'ﻬ', 'ﻪ'],
  'و': ['ﻭ', 'ﻭ', 'ﻮ', 'ﻮ'],
  'ي': ['ﻱ', 'ﻳ', 'ﻴ', 'ﻲ'],
  'ى': ['ﻯ', 'ﻯ', 'ﻰ', 'ﻰ'],
  'ة': ['ﺓ', 'ﺓ', 'ﺔ', 'ﺔ'],
  'ء': ['ء', 'ء', 'ء', 'ء'],
  'ؤ': ['ﺅ', 'ﺅ', 'ﺆ', 'ﺆ'],
  'ئ': ['ﺉ', 'ﺋ', 'ﺌ', 'ﺊ'],
  'لا': ['ﻻ', 'ﻻ', 'ﻼ', 'ﻼ'],
};

// Characters that don't connect to the next letter
const NON_CONNECTING = new Set(['ا', 'أ', 'إ', 'آ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة']);

function isArabic(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function reshapeArabic(text: string): string {
  const result: string[] = [];
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const forms = ARABIC_CHARS[ch];

    if (!forms) {
      result.push(ch);
      continue;
    }

    const prevArabic = i > 0 && isArabic(chars[i - 1]) && !NON_CONNECTING.has(chars[i - 1]);
    const nextArabic = i < chars.length - 1 && isArabic(chars[i + 1]) && ARABIC_CHARS[chars[i + 1]];

    if (prevArabic && nextArabic && !NON_CONNECTING.has(ch)) {
      result.push(forms[2]); // medial
    } else if (prevArabic && !NON_CONNECTING.has(ch)) {
      result.push(forms[3]); // final  
    } else if (nextArabic && !NON_CONNECTING.has(ch)) {
      result.push(forms[1]); // initial
    } else {
      result.push(forms[0]); // isolated
    }
  }

  return result.join('');
}

function reverseBidi(text: string): string {
  // Split text into lines, reverse Arabic segments while keeping LTR (numbers, Latin) in place
  const lines = text.split('\n');
  return lines.map(line => {
    // Simple bidi: reverse the entire line character by character for game engine display
    return [...line].reverse().join('');
  }).join('\n');
}

function processArabicText(text: string): string {
  const reshaped = reshapeArabic(text);
  return reverseBidi(reshaped);
}

// ---- MSBT Parser ----
function readUTF16String(data: Uint8Array, offset: number, length: number): string {
  const decoder = new TextDecoder('utf-16le');
  return decoder.decode(data.slice(offset, offset + length));
}

function writeUTF16String(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const buf = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    buf[i * 2] = code & 0xFF;
    buf[i * 2 + 1] = (code >> 8) & 0xFF;
  }
  return buf;
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
  
  if (!magic.startsWith('MsgStdBn')) {
    throw new Error('Not a valid MSBT file');
  }

  const entries: MsbtEntry[] = [];
  // Simplified parser - find TXT2 section
  let pos = 0x20; // Skip header
  
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
        
        // Read UTF-16LE string, stopping at null terminator
        let text = '';
        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          // Skip control codes (< 0x20 except newline-like)
          if (charCode === 0x0E) {
            // MSBT control code: skip tag (2 bytes group + 2 bytes type + 2 bytes size + size bytes)
            const tagSize = view.getUint16(absOffset + j + 4, true);
            j += 4 + tagSize;
            text += '\uFFFC'; // placeholder for control code
            continue;
          }
          text += String.fromCharCode(charCode);
        }

        const processed = processArabicText(text);
        entries.push({
          label: `entry_${i}`,
          originalText: text,
          processedText: processed,
          offset: absOffset,
          size: textLength,
        });
      }
      break;
    }
    
    pos += 16 + sectionSize;
    // Align to 16 bytes
    pos = (pos + 15) & ~15;
  }

  return { entries, raw: data };
}

function injectMSBT(data: Uint8Array, entries: MsbtEntry[]): Uint8Array {
  // For now, create a copy and inject text in-place
  // This is simplified - full implementation needs to handle size changes
  const result = new Uint8Array(data);
  const view = new DataView(result.buffer);
  
  for (const entry of entries) {
    const encoded = writeUTF16String(entry.processedText);
    // Only inject if it fits in the original size
    if (encoded.length <= entry.size - 2) {
      result.set(encoded, entry.offset);
      // Null terminate
      view.setUint16(entry.offset + encoded.length, 0, true);
    }
  }
  
  return result;
}

// ---- SARC Parser (simplified) ----
interface SarcFile {
  name: string;
  data: Uint8Array;
}

function parseSARC(data: Uint8Array): SarcFile[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 4));
  
  if (magic !== 'SARC') {
    throw new Error('Not a valid SARC archive');
  }
  
  const headerSize = view.getUint16(4, true);
  const dataOffset = view.getUint32(0x0C, true);
  
  // Read SFAT
  const sfatOffset = headerSize;
  const sfatMagic = String.fromCharCode(...data.slice(sfatOffset, sfatOffset + 4));
  if (sfatMagic !== 'SFAT') throw new Error('Missing SFAT section');
  
  const nodeCount = view.getUint16(sfatOffset + 6, true);
  
  // Read SFNT
  const sfntOffset = sfatOffset + 12 + nodeCount * 16;
  
  const files: SarcFile[] = [];
  
  for (let i = 0; i < nodeCount; i++) {
    const nodeOffset = sfatOffset + 12 + i * 16;
    const nameOffset = (view.getUint32(nodeOffset + 4, true) & 0x00FFFFFF) * 4;
    const fileDataStart = view.getUint32(nodeOffset + 8, true);
    const fileDataEnd = view.getUint32(nodeOffset + 12, true);
    
    // Read filename from SFNT
    let name = '';
    let pos = sfntOffset + 8 + nameOffset;
    while (pos < data.length && data[pos] !== 0) {
      name += String.fromCharCode(data[pos]);
      pos++;
    }
    
    files.push({
      name,
      data: data.slice(dataOffset + fileDataStart, dataOffset + fileDataEnd),
    });
  }
  
  return files;
}

function packSARC(files: SarcFile[], originalData: Uint8Array): Uint8Array {
  // Simplified: rebuild SARC with the same structure
  // For full compatibility, we'd need to reconstruct the full archive
  // For now, we inject modified files back into the original data
  
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const _dictData = new Uint8Array(await dictFile.arrayBuffer());

    // Step 1: Zstandard decompression
    // NOTE: Full zstd with dictionary decompression requires a native implementation
    // For now, we'll attempt to parse the data directly (assuming pre-decompressed for testing)
    // In production, this would use a WASM zstd library
    
    let sarcData: Uint8Array;
    const isSARC = String.fromCharCode(...langData.slice(0, 4)) === 'SARC';
    
    if (isSARC) {
      sarcData = langData;
    } else {
      // Try to detect if it's zstd compressed (magic: 0xFD2FB528)
      const isZstd = langData[0] === 0x28 && langData[1] === 0xB5 && langData[2] === 0x2F && langData[3] === 0xFD;
      if (isZstd) {
        return new Response(
          JSON.stringify({ 
            error: 'الملف مضغوط بـ Zstandard. يرجى فك الضغط أولاً باستخدام أداة zstd ثم إعادة الرفع.',
            stage: 'decompressing',
            needsDecompression: true,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      sarcData = langData;
    }

    // Step 2: Extract SARC
    const files = parseSARC(sarcData);
    
    // Step 3: Process MSBT files
    let modifiedCount = 0;
    const processedFiles = files.map(file => {
      if (file.name.endsWith('.msbt')) {
        try {
          const { entries, raw } = parseMSBT(file.data);
          const injected = injectMSBT(raw, entries);
          modifiedCount += entries.length;
          return { ...file, data: injected };
        } catch {
          return file;
        }
      }
      return file;
    });

    // Step 4: Repack SARC
    const repackedData = packSARC(processedFiles, sarcData);

    // Return as downloadable file
    const base64 = btoa(String.fromCharCode(...repackedData));
    
    return new Response(
      JSON.stringify({
        success: true,
        modifiedCount,
        fileSize: repackedData.length,
        data: base64,
        entries: processedFiles
          .filter(f => f.name.endsWith('.msbt'))
          .flatMap(f => {
            try {
              return parseMSBT(f.data).entries.slice(0, 20).map(e => ({
                label: e.label,
                original: e.originalText.substring(0, 100),
                processed: e.processedText.substring(0, 100),
              }));
            } catch { return []; }
          }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
