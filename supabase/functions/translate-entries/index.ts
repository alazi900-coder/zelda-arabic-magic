import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Tag Protection: replace [content] with TAG_N placeholders ---
function protectTags(text: string): { cleaned: string; tags: Map<string, string> } {
  const tags = new Map<string, string>();
  let counter = 0;
  const cleaned = text.replace(/\[[^\]]*\]|[\uFFF9-\uFFFC\uE000-\uE0FF]+/g, (match) => {
    const placeholder = `TAG_${counter++}`;
    tags.set(placeholder, match);
    return placeholder;
  });
  return { cleaned, tags };
}

function restoreTags(text: string, tags: Map<string, string>): string {
  let result = text;
  for (const [placeholder, original] of tags) {
    result = result.replace(placeholder, original);
  }
  return result;
}

// --- Apply glossary replacements to translated text (post-processing) ---
function applyGlossaryPost(text: string, glossaryMap: Map<string, string>): string {
  let result = text;
  // Also build a reverse map: English term → Arabic term for post-replacement
  for (const [eng, ara] of glossaryMap) {
    // Case-insensitive whole-word replacement of English terms left in translation
    const escaped = eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, ara);
  }
  return result;
}

// --- Fetch with retry ---
async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 400) return response;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      } else {
        return response;
      }
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

// --- Pick best translation from MyMemory matches ---
function pickBestTranslation(data: any): string | null {
  // Primary result
  const primary = data?.responseData?.translatedText;
  const primaryMatch = data?.responseData?.match;
  
  // Check TM matches for higher quality
  const matches = data?.matches;
  if (Array.isArray(matches) && matches.length > 0) {
    // Sort by quality (match score), prefer human translations
    const ranked = matches
      .filter((m: any) => m.translation?.trim() && m.segment?.trim())
      .sort((a: any, b: any) => {
        // Prefer "human" created-by over "MT"
        const aHuman = a['created-by'] !== 'MT' ? 1 : 0;
        const bHuman = b['created-by'] !== 'MT' ? 1 : 0;
        if (aHuman !== bHuman) return bHuman - aHuman;
        // Then by match quality
        return (b.match || 0) - (a.match || 0);
      });
    
    if (ranked.length > 0 && ranked[0].match >= 0.5) {
      return ranked[0].translation;
    }
  }
  
  // Fallback to primary if quality is acceptable
  if (primary?.trim() && primaryMatch >= 0.3) {
    return primary;
  }
  
  return primary?.trim() ? primary : null;
}

// --- MyMemory free translation (with email for 50k/day limit) ---
async function translateWithMyMemory(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossaryMap?: Map<string, string>,
  email?: string,
): Promise<{ translations: Record<string, string>; charsUsed: number }> {
  const result: Record<string, string> = {};
  let charsUsed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const pe = protectedEntries[i];
    const textToTranslate = pe.cleaned.trim();
    
    if (!textToTranslate) continue;

    // Check glossary for exact match first
    if (glossaryMap) {
      const norm = textToTranslate.toLowerCase();
      const hit = glossaryMap.get(norm);
      if (hit) {
        result[entry.key] = restoreTags(hit, pe.tags);
        continue;
      }
    }

    try {
      let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=en|ar`;
      if (email?.trim()) {
        url += `&de=${encodeURIComponent(email.trim())}`;
      }
      
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.error(`MyMemory error for key ${entry.key}: ${response.status}`);
        await response.text(); // consume body
        continue;
      }
      const data = await response.json();
      
      // Pick best translation from primary + TM matches
      let translation = pickBestTranslation(data);
      
      if (translation?.trim()) {
        // Post-process: apply glossary terms to fix any English words left
        if (glossaryMap) {
          translation = applyGlossaryPost(translation, glossaryMap);
        }
        result[entry.key] = restoreTags(translation, pe.tags);
        charsUsed += textToTranslate.length;
      }
    } catch (err) {
      console.error(`MyMemory fetch error for key ${entry.key}:`, err);
    }
    
    // Small delay between requests to avoid rate limiting
    if (i < entries.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return { translations: result, charsUsed };
}

// --- Google Translate (unofficial free endpoint) ---
async function translateWithGoogle(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossaryMap?: Map<string, string>,
): Promise<{ translations: Record<string, string>; charsUsed: number }> {
  const result: Record<string, string> = {};
  let charsUsed = 0;

  // For small batches (≤5), translate individually for better accuracy
  // For larger batches, use newline-joined batching for speed
  const useIndividual = entries.length <= 5;

  if (useIndividual) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const pe = protectedEntries[i];
      const text = pe.cleaned.trim();
      if (!text) continue;

      // Check glossary
      if (glossaryMap) {
        const norm = text.toLowerCase();
        const hit = glossaryMap.get(norm);
        if (hit) {
          result[entry.key] = restoreTags(hit, pe.tags);
          continue;
        }
      }

      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetchWithRetry(url);
        if (!response.ok) {
          console.error(`Google Translate error for key ${entry.key}: ${response.status}`);
          await response.text();
          continue;
        }
        const data = await response.json();

        // Parse Google's response: concatenate all segments
        let translation = '';
        if (Array.isArray(data) && Array.isArray(data[0])) {
          for (const segment of data[0]) {
            if (Array.isArray(segment) && segment[0]) {
              translation += segment[0];
            }
          }
        }
        translation = translation.trim();

        if (translation) {
          if (glossaryMap) {
            translation = applyGlossaryPost(translation, glossaryMap);
          }
          result[entry.key] = restoreTags(translation, pe.tags);
          charsUsed += text.length;
        }
      } catch (err) {
        console.error(`Google Translate error for key ${entry.key}:`, err);
      }

      // Small delay between requests
      if (i < entries.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  } else {
    // Batch mode for larger sets
    const batchSize = 20;
    for (let start = 0; start < entries.length; start += batchSize) {
      const batchEntries = entries.slice(start, start + batchSize);
      const batchProtected = protectedEntries.slice(start, start + batchSize);

      const toTranslate: { idx: number; text: string }[] = [];
      for (let i = 0; i < batchEntries.length; i++) {
        const pe = batchProtected[i];
        const text = pe.cleaned.trim();
        if (!text) continue;
        if (glossaryMap) {
          const norm = text.toLowerCase();
          const hit = glossaryMap.get(norm);
          if (hit) {
            result[batchEntries[i].key] = restoreTags(hit, pe.tags);
            continue;
          }
        }
        toTranslate.push({ idx: i, text });
      }

      if (toTranslate.length === 0) continue;

      const joinedText = toTranslate.map(t => t.text).join('\n');

      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(joinedText)}`;
        const response = await fetchWithRetry(url);
        if (!response.ok) {
          console.error(`Google Translate batch error: ${response.status}`);
          await response.text();
          continue;
        }
        const data = await response.json();

        let fullTranslation = '';
        if (Array.isArray(data) && Array.isArray(data[0])) {
          for (const segment of data[0]) {
            if (Array.isArray(segment) && segment[0]) {
              fullTranslation += segment[0];
            }
          }
        }

        const translations = fullTranslation.split('\n');

        for (let j = 0; j < Math.min(toTranslate.length, translations.length); j++) {
          const t = toTranslate[j];
          let translation = translations[j]?.trim();
          if (translation) {
            if (glossaryMap) {
              translation = applyGlossaryPost(translation, glossaryMap);
            }
            result[batchEntries[t.idx].key] = restoreTags(translation, batchProtected[t.idx].tags);
            charsUsed += t.text.length;
          }
        }
      } catch (err) {
        console.error('Google Translate batch error:', err);
      }

      if (start + batchSize < entries.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  return { translations: result, charsUsed };
}

// --- Parse glossary text into a map ---
function parseGlossaryToMap(glossary: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!glossary?.trim()) return map;
  for (const line of glossary.split('\n')) {
    const parts = line.split(/[=→\t]/);
    if (parts.length >= 2) {
      map.set(parts[0].trim().toLowerCase(), parts[1].trim());
    }
  }
  return map;
}

// --- AI translation (Gemini / Lovable gateway) ---
async function translateWithAI(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossary: string | undefined,
  context: { key: string; original: string; translation?: string }[] | undefined,
  userApiKey: string | undefined,
): Promise<Record<string, string>> {
  const textsBlock = protectedEntries.map((e, i) => `[${i}] ${e.cleaned}`).join('\n');

  let glossarySection = '';
  if (glossary?.trim()) {
    glossarySection = `\n\nIMPORTANT - Use this glossary for consistent terminology:\n${glossary}\n`;
  }

  let contextSection = '';
  if (context && context.length > 0) {
    const contextLines = context
      .filter(c => c.translation?.trim())
      .map(c => `"${c.original}" → "${c.translation}"`)
      .slice(0, 10)
      .join('\n');
    if (contextLines) {
      contextSection = `\n\nHere are some nearby already-translated texts for context and consistency:\n${contextLines}\n`;
    }
  }

  let categoryHint = '';
  const sampleKey = entries[0]?.key || '';
  if (/ActorMsg\/PouchContent/i.test(sampleKey)) categoryHint = 'هذه نصوص أسماء أسلحة وأدوات ومواد - استخدم صيغة مختصرة ومباشرة.';
  else if (/LayoutMsg/i.test(sampleKey)) categoryHint = 'هذه نصوص واجهة مستخدم وقوائم - استخدم صيغة مختصرة وواضحة.';
  else if (/EventFlowMsg/i.test(sampleKey)) categoryHint = 'هذه حوارات قصة ومهام - استخدم أسلوباً سردياً طبيعياً وممتعاً.';
  else if (/ChallengeMsg/i.test(sampleKey)) categoryHint = 'هذه نصوص مهام وتحديات - استخدم أسلوباً تحفيزياً واضحاً.';
  else if (/LocationMsg/i.test(sampleKey)) categoryHint = 'هذه أسماء مواقع وخرائط - حافظ على الأسماء العلم أو ترجمها بالطريقة الشائعة.';
  else if (/ActorMsg/i.test(sampleKey)) categoryHint = 'هذه أسماء شخصيات وأعداء - حافظ على الأسماء العلم الشهيرة كما هي.';

  const categorySection = categoryHint ? `\n\n${categoryHint}` : '';

  const prompt = `You are a professional game translator specializing in The Legend of Zelda series. Translate the following game texts from English/Japanese to Arabic.

CRITICAL RULES:
- Keep placeholder tags like \uFFFC and TAG_0, TAG_1, etc. intact in their exact positions.
- Keep the translation length close to the original to fit in-game text boxes.
- Use terminology consistent with the Arabic gaming community (e.g. تريفورس for Triforce, سيف الماستر for Master Sword).
- Preserve proper nouns like Link, Zelda, Ganon, Hyrule as-is or use their well-known Arabic equivalents.
- Return ONLY a JSON array of strings in the same order. No explanations.${categorySection}${glossarySection}${contextSection}

Texts:
${textsBlock}`;

  if (userApiKey?.trim()) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userApiKey.trim()}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'You are a game text translator. Output only valid JSON arrays.' }] },
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', errText);
      if (geminiResponse.status === 400 || geminiResponse.status === 403) throw new Error('مفتاح API غير صالح أو منتهي الصلاحية');
      if (geminiResponse.status === 429) throw new Error('تم تجاوز حد الطلبات، حاول لاحقاً');
      throw new Error(`خطأ Gemini: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('فشل في تحليل استجابة Gemini');
    const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
    const translations: string[] = JSON.parse(sanitized);

    const result: Record<string, string> = {};
    for (let i = 0; i < Math.min(protectedEntries.length, translations.length); i++) {
      if (translations[i]?.trim()) {
        result[protectedEntries[i].key] = restoreTags(translations[i], protectedEntries[i].tags);
      }
    }
    return result;
  } else {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('Missing LOVABLE_API_KEY');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a game text translator. Output only valid JSON arrays.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('AI gateway error:', err);
      if (response.status === 402) throw new Error('انتهت نقاط الذكاء الاصطناعي — استخدم مفتاح Gemini الشخصي');
      if (response.status === 429) throw new Error('تم تجاوز حد الطلبات، حاول لاحقاً');
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Failed to parse AI response');
    const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
    const translations: string[] = JSON.parse(sanitized);

    const result: Record<string, string> = {};
    for (let i = 0; i < Math.min(protectedEntries.length, translations.length); i++) {
      if (translations[i]?.trim()) {
        result[protectedEntries[i].key] = restoreTags(translations[i], protectedEntries[i].tags);
      }
    }
    return result;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, glossary, context, userApiKey, provider, myMemoryEmail } = await req.json() as {
      entries: { key: string; original: string }[];
      glossary?: string;
      context?: { key: string; original: string; translation?: string }[];
      userApiKey?: string;
      provider?: string;
      myMemoryEmail?: string;
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'لا توجد نصوص للترجمة' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Protect tags in brackets before translation
    const protectedEntries = entries.map(e => {
      const { cleaned, tags } = protectTags(e.original);
      return { ...e, cleaned, tags };
    });

    if (provider === 'mymemory') {
      const glossaryMap = glossary ? parseGlossaryToMap(glossary) : undefined;
      const { translations, charsUsed } = await translateWithMyMemory(entries, protectedEntries, glossaryMap, myMemoryEmail);
      return new Response(JSON.stringify({ translations, charsUsed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (provider === 'google') {
      const glossaryMap = glossary ? parseGlossaryToMap(glossary) : undefined;
      const { translations, charsUsed } = await translateWithGoogle(entries, protectedEntries, glossaryMap);
      return new Response(JSON.stringify({ translations, charsUsed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const result = await translateWithAI(entries, protectedEntries, glossary, context, userApiKey);
      return new Response(JSON.stringify({ translations: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
