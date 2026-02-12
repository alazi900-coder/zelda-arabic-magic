import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries } = await req.json() as {
      entries: { key: string; original: string }[];
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'لا توجد نصوص للترجمة' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build prompt with all entries
    const textsBlock = entries.map((e, i) => `[${i}] ${e.original}`).join('\n');

    const prompt = `You are a professional game translator. Translate the following game UI texts from English/Japanese to Arabic. 
Keep any placeholder tags like \uFFFC intact. Return ONLY a JSON array of strings in the same order. No explanations.

Texts:
${textsBlock}`;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('Missing LOVABLE_API_KEY');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Failed to parse AI response');

    // Replace ALL control characters with spaces (safe for both JSON whitespace and string values)
    const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');

    const translations: string[] = JSON.parse(sanitized);

    // Map back to keys
    const result: Record<string, string> = {};
    for (let i = 0; i < Math.min(entries.length, translations.length); i++) {
      if (translations[i] && translations[i].trim()) {
        result[entries[i].key] = translations[i];
      }
    }

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
