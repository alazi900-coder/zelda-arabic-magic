/**
 * Arabic text fix utilities:
 * 1. Taa Marbuta vs Haa (ة vs ه)
 * 2. Yaa vs Alef Maqsura (ي vs ى)
 * 3. Repeated consecutive words
 * 4. AI translation artifacts cleanup
 */

// === Tag protection ===
const TAG_PATTERN = /[\uE000-\uE0FF]+|\[\s*\w+\s*:[^\]]*?\s*\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}|[\uFFF9-\uFFFC]+/g;

function shieldTags(text: string): { shielded: string; tags: string[] } {
  const tags: string[] = [];
  const shielded = text.replace(TAG_PATTERN, (m) => { tags.push(m); return `\uE800${tags.length - 1}\uE801`; });
  return { shielded, tags };
}

function unshieldTags(text: string, tags: string[]): string {
  return text.replace(/\uE800(\d+)\uE801/g, (_, i) => tags[parseInt(i)] || '');
}

// ============================================================
// 1. Taa Marbuta (ة) vs Haa (ه) fix
// ============================================================

// Common words that end with ة (not ه)
const TAA_MARBUTA_WORDS = new Set([
  'لعبة', 'مرة', 'قوة', 'مهمة', 'منطقة', 'قطعة', 'شخصية', 'قصة', 'معركة', 'مغامرة',
  'رحلة', 'جزيرة', 'قرية', 'مدينة', 'قلعة', 'غرفة', 'ساحة', 'طريقة', 'حالة', 'نتيجة',
  'مكافأة', 'خريطة', 'وصفة', 'قائمة', 'رسالة', 'مشكلة', 'فكرة', 'ذاكرة', 'صورة', 'نسخة',
  'حركة', 'ضربة', 'هجمة', 'دورة', 'جولة', 'محطة', 'نقطة', 'خطوة', 'كلمة', 'جملة',
  'قدرة', 'مهارة', 'سرعة', 'قفزة', 'لحظة', 'فترة', 'مرحلة', 'بداية', 'نهاية', 'عودة',
  'أداة', 'تجربة', 'ميزة', 'عملية', 'حماية', 'طاقة', 'شجرة', 'صخرة', 'بحيرة', 'كهفة',
  'مساحة', 'مسافة', 'سلسلة', 'حلقة', 'وحدة', 'مجموعة', 'قطعة', 'درجة', 'مرتبة', 'رتبة',
  'عائلة', 'ذكرى', 'ثروة', 'جائزة', 'شارة', 'علامة', 'إشارة', 'خزانة', 'حقيبة', 'زجاجة',
  'بوابة', 'نافذة', 'شاشة', 'واجهة', 'لوحة', 'خلفية', 'أمامية', 'جانبية', 'سفلية', 'علوية',
  'ترجمة', 'لغة', 'كتابة', 'قراءة', 'محادثة', 'عبارة', 'حوارية',
]);

// Patterns: word ending with ه that should be ة
// We check if removing the final ه and adding ة gives a known word
export function fixTaaMarbutaHaa(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  
  // Match Arabic words ending with ه
  const fixed = shielded.replace(/(\b[\u0600-\u064A\u066E-\u06FF]+)(ه)(\s|$|[^\u0600-\u06FF])/g, (match, stem, haa, after) => {
    const withTaa = stem + 'ة';
    if (TAA_MARBUTA_WORDS.has(withTaa)) {
      changes++;
      return withTaa + after;
    }
    return match;
  });
  
  return { fixed: unshieldTags(fixed, tags), changes };
}

// ============================================================
// 2. Yaa (ي) vs Alef Maqsura (ى) fix
// ============================================================

// Common words/prepositions that end with ى (not ي)
const ALEF_MAQSURA_WORDS = new Set([
  'على', 'إلى', 'حتى', 'متى', 'أنى', 'لدى', 'سوى', 'مدى', 'هدى', 'ندى',
  'رؤى', 'قرى', 'ذكرى', 'أخرى', 'كبرى', 'صغرى', 'إحدى', 'منتهى', 'مستوى', 'مغزى',
  'مستشفى', 'ملتقى', 'منتدى', 'مأوى', 'مبنى', 'معنى', 'مجرى', 'موسى', 'عيسى', 'يحيى',
  'مصطفى', 'مرتضى', 'أدنى', 'أعلى', 'أقصى', 'أدفى', 'أولى',
]);

// Words that end with ي (not ى) - adjectives/nisba
const YAA_WORDS_SUFFIXES = ['ي', 'تي', 'ني', 'لي', 'بي', 'في', 'كي'];

export function fixYaaAlefMaqsura(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  
  const fixed = shielded.replace(/(\b[\u0600-\u064A\u066E-\u06FF]+)(ي|ى)(\s|$|[^\u0600-\u06FF])/g, (match, stem, lastChar, after) => {
    const fullWord = stem + lastChar;
    
    // If ends with ي but known to end with ى
    if (lastChar === 'ي') {
      const withAlefMaqsura = stem + 'ى';
      if (ALEF_MAQSURA_WORDS.has(withAlefMaqsura)) {
        changes++;
        return withAlefMaqsura + after;
      }
    }
    
    // If ends with ى but known to end with ي
    if (lastChar === 'ى') {
      const withYaa = stem + 'ي';
      if (ALEF_MAQSURA_WORDS.has(fullWord)) {
        return match; // Correct as is
      }
      // Check common ى→ي patterns: preposition "في" written as "فى"
      if (fullWord === 'فى' || fullWord === 'الذى' || fullWord === 'التى') {
        changes++;
        return withYaa + after;
      }
    }
    
    return match;
  });
  
  return { fixed: unshieldTags(fixed, tags), changes };
}

// ============================================================
// 3. Repeated consecutive words
// ============================================================

export function fixRepeatedWords(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  
  // Match consecutive duplicate words (Arabic or English, 2+ chars)
  const fixed = shielded.replace(/\b([\u0600-\u06FF\w]{2,})\s+\1\b/g, (match, word) => {
    changes++;
    return word;
  });
  
  return { fixed: unshieldTags(fixed, tags), changes };
}

// ============================================================
// 4. AI translation artifacts cleanup
// ============================================================

const AI_ARTIFACT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /^(بالتأكيد[!!\s]*[،,]?\s*)/u, label: 'بالتأكيد' },
  { pattern: /^(بالطبع[!!\s]*[،,]?\s*)/u, label: 'بالطبع' },
  { pattern: /^(حسنا[ً]?[!!\s]*[،,]?\s*)/u, label: 'حسناً' },
  { pattern: /^(إليك الترجمة[:\s]*)/u, label: 'إليك الترجمة' },
  { pattern: /^(الترجمة هي[:\s]*)/u, label: 'الترجمة هي' },
  { pattern: /^(هذه هي الترجمة[:\s]*)/u, label: 'هذه هي الترجمة' },
  { pattern: /^(الترجمة العربية[:\s]*)/u, label: 'الترجمة العربية' },
  { pattern: /^(ها هي الترجمة[:\s]*)/u, label: 'ها هي الترجمة' },
  { pattern: /^(Here'?s? (?:the )?translation[:\s]*)/i, label: 'English prefix' },
  { pattern: /^(Translation[:\s]*)/i, label: 'Translation prefix' },
  { pattern: /^(Sure[!,.\s]*(?:here(?:'s| is)[:\s]*)?)/i, label: 'Sure prefix' },
  { pattern: /(\s*\(ترجمة\)|\s*\(مترجم\)|\s*\(translated\))\s*$/iu, label: 'suffix tag' },
  // Quotation wrapping the entire text
  { pattern: /^["«"](.+)["»"]$/u, label: 'wrapping quotes' },
];

export function cleanAIArtifacts(text: string): { fixed: string; changes: number; removedLabels: string[] } {
  let fixed = text.trim();
  let changes = 0;
  const removedLabels: string[] = [];
  
  for (const { pattern, label } of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fixed)) {
      const before = fixed;
      if (label === 'wrapping quotes') {
        fixed = fixed.replace(pattern, '$1');
      } else {
        fixed = fixed.replace(pattern, '');
      }
      if (fixed !== before) {
        changes++;
        removedLabels.push(label);
      }
    }
  }
  
  return { fixed: fixed.trim(), changes, removedLabels };
}

// ============================================================
// Combined scan
// ============================================================

export interface TextFixResult {
  key: string;
  before: string;
  after: string;
  fixType: 'taa-haa' | 'yaa-alef' | 'repeated' | 'ai-artifact';
  fixLabel: string;
  details: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export function scanAllTextFixes(translations: Record<string, string>): TextFixResult[] {
  const results: TextFixResult[] = [];
  
  for (const [key, value] of Object.entries(translations)) {
    if (!value?.trim()) continue;
    
    // 1. Taa/Haa
    const taaResult = fixTaaMarbutaHaa(value);
    if (taaResult.changes > 0) {
      results.push({
        key, before: value, after: taaResult.fixed,
        fixType: 'taa-haa', fixLabel: 'تاء/هاء',
        details: `${taaResult.changes} إصلاح (ه→ة)`,
        status: 'pending',
      });
    }
    
    // 2. Yaa/Alef Maqsura
    const yaaResult = fixYaaAlefMaqsura(value);
    if (yaaResult.changes > 0) {
      results.push({
        key, before: value, after: yaaResult.fixed,
        fixType: 'yaa-alef', fixLabel: 'ياء/ألف مقصورة',
        details: `${yaaResult.changes} إصلاح (ي↔ى)`,
        status: 'pending',
      });
    }
    
    // 3. Repeated words
    const repResult = fixRepeatedWords(value);
    if (repResult.changes > 0) {
      results.push({
        key, before: value, after: repResult.fixed,
        fixType: 'repeated', fixLabel: 'كلمات مكررة',
        details: `${repResult.changes} تكرار`,
        status: 'pending',
      });
    }
    
    // 4. AI artifacts
    const aiResult = cleanAIArtifacts(value);
    if (aiResult.changes > 0) {
      results.push({
        key, before: value, after: aiResult.fixed,
        fixType: 'ai-artifact', fixLabel: 'مخلفات AI',
        details: aiResult.removedLabels.join('، '),
        status: 'pending',
      });
    }
  }
  
  return results;
}
