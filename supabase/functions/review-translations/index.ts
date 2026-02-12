import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewEntry {
  key: string;
  original: string;
  translation: string;
  maxBytes: number;
}

interface ReviewIssue {
  key: string;
  type: 'missing_tag' | 'too_long' | 'inconsistent' | 'untranslated_term' | 'placeholder_mismatch';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

function extractTags(text: string): string[] {
  const tags = text.match(/\[[^\]]*\]/g) || [];
  return tags;
}

function extractPlaceholders(text: string): string[] {
  const placeholders = text.match(/\uFFFC/g) || [];
  return placeholders;
}

function getUtf16ByteLength(text: string): number {
  // MSBT uses UTF-16LE encoding
  return text.length * 2;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, glossary } = await req.json() as {
      entries: ReviewEntry[];
      glossary?: string;
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const issues: ReviewIssue[] = [];

    // Parse glossary for consistency checks
    const glossaryMap = new Map<string, string>();
    if (glossary) {
      for (const line of glossary.split('\n')) {
        const match = line.match(/^(.+?)\s*=\s*(.+)$/);
        if (match) {
          glossaryMap.set(match[1].trim().toLowerCase(), match[2].trim());
        }
      }
    }

    // Build translation consistency map (same original → same translation)
    const translationsByOriginal = new Map<string, { key: string; translation: string }[]>();

    for (const entry of entries) {
      if (!entry.translation?.trim()) continue;

      // 1. Missing tags check
      const originalTags = extractTags(entry.original);
      const translationTags = extractTags(entry.translation);
      
      for (const tag of originalTags) {
        if (!entry.translation.includes(tag)) {
          issues.push({
            key: entry.key,
            type: 'missing_tag',
            severity: 'error',
            message: `وسم مفقود في الترجمة: ${tag}`,
            suggestion: `أضف ${tag} في الموضع المناسب`,
          });
        }
      }

      // 2. Placeholder mismatch
      const origPlaceholders = extractPlaceholders(entry.original);
      const transPlaceholders = extractPlaceholders(entry.translation);
      if (origPlaceholders.length !== transPlaceholders.length) {
        issues.push({
          key: entry.key,
          type: 'placeholder_mismatch',
          severity: 'error',
          message: `عدد العناصر النائبة (￼) مختلف: الأصلي ${origPlaceholders.length}، الترجمة ${transPlaceholders.length}`,
        });
      }

      // 3. Text too long (byte limit)
      if (entry.maxBytes > 0) {
        const translationBytes = getUtf16ByteLength(entry.translation);
        const ratio = translationBytes / entry.maxBytes;
        if (ratio > 1) {
          issues.push({
            key: entry.key,
            type: 'too_long',
            severity: 'error',
            message: `الترجمة تتجاوز الحد (${translationBytes}/${entry.maxBytes} بايت) — لن يتم حقنها`,
            suggestion: `اختصر الترجمة بـ ${translationBytes - entry.maxBytes} بايت`,
          });
        } else if (ratio > 0.8) {
          issues.push({
            key: entry.key,
            type: 'too_long',
            severity: 'warning',
            message: `الترجمة قريبة من الحد (${Math.round(ratio * 100)}% من المساحة المتاحة)`,
          });
        }
      }

      // 4. Track for consistency
      const normOriginal = entry.original.trim().toLowerCase();
      if (!translationsByOriginal.has(normOriginal)) {
        translationsByOriginal.set(normOriginal, []);
      }
      translationsByOriginal.get(normOriginal)!.push({ key: entry.key, translation: entry.translation });

      // 5. Glossary term check
      for (const [term, expected] of glossaryMap) {
        if (entry.original.toLowerCase().includes(term) && !entry.translation.includes(expected)) {
          issues.push({
            key: entry.key,
            type: 'untranslated_term',
            severity: 'warning',
            message: `مصطلح "${term}" يجب أن يُترجم إلى "${expected}" حسب القاموس`,
            suggestion: expected,
          });
        }
      }
    }

    // 6. Consistency check: same original text → different translations
    for (const [original, translations] of translationsByOriginal) {
      if (translations.length > 1) {
        const uniqueTranslations = new Set(translations.map(t => t.translation.trim()));
        if (uniqueTranslations.size > 1) {
          for (const t of translations) {
            issues.push({
              key: t.key,
              type: 'inconsistent',
              severity: 'warning',
              message: `نفس النص الأصلي مترجم بأشكال مختلفة (${uniqueTranslations.size} ترجمات مختلفة)`,
              suggestion: translations[0].translation,
            });
          }
        }
      }
    }

    // Summary stats
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    return new Response(JSON.stringify({
      issues,
      summary: {
        total: issues.length,
        errors: errorCount,
        warnings: warningCount,
        checked: entries.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Review error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
