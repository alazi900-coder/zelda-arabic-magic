

# اصلاح مشكلة ظهور ترجمات من خارج الدفعة/الفلتر

## المشكلة الجذرية

عند ترجمة الصفحة بـ Lovable AI، تظهر ترجمات لجمل غير موجودة في الدفعة اصلاً. السبب الرئيسي:

### 1. تسريب السياق (Context Leakage)
الكود يرسل للذكاء الاصطناعي:
- 30 نص للترجمة (الدفعة)
- حتى 25 نص "سياق" كمرجع (من جيران الادخالات في المصفوفة الكاملة)

الموديل يرى 55 نصاً في البرومبت ويخلط بينها — يترجم نصوص السياق بدلاً من نصوص الدفعة، فتظهر ترجمات لجمل من ملفات اخرى او اماكن اخرى تماماً.

### 2. حجم الدفعة كبير (30 نص)
مع 30 نصاً مرقماً `[0]...[29]`، الموديل يتخطى بعض الارقام او يعيد عدداً مختلفاً، فتنزاح الترجمات عن مواقعها الصحيحة.

### 3. حماية مزدوجة للوسوم (لا تزال موجودة)
`handleTranslatePage` و `handleAutoTranslate` يستدعيان `protectTags` على العميل، ثم الخادم يستدعيها مرة اخرى.

## الحل

### 1. تقليل حجم الدفعة وتحديد السياق
**الملف: `src/components/editor/types.tsx`**
- تقليل `AI_BATCH_SIZE` من 30 الى 10

### 2. ازالة السياق من ترجمة الصفحة او تحديده بشدة
**الملف: `src/hooks/useEditorTranslation.ts`**

في `handleTranslatePage` (سطر 581-595):
- ازالة ارسال `context` بالكامل عند ترجمة الصفحة (لان السياق هو سبب التسريب)
- او تحديد السياق بـ 5 نصوص فقط بدلاً من 25

في `handleAutoTranslate` (سطر 226-252):
- تقليل السياق من 25 الى 8 نصوص
- ازالة "recently translated entries" (سطر 244-252) لانها تضيف نصوصاً من خارج المنطقة الحالية

### 3. ازالة الحماية المزدوجة
**الملف: `src/hooks/useEditorTranslation.ts`**

في `handleTranslatePage` (سطر 574-579):
- ارسال `e.original` مباشرة بدلاً من `p.cleanText`
- حذف `protectedMap` وترك الخادم يتولى الحماية

في `handleAutoTranslate` (سطر 218-224):
- نفس الاصلاح

تحديث `autoFixTags` (سطر 612):
- عدم تمرير `protectedMap` لانها لم تعد موجودة
- الاعتماد فقط على `restoreTagsLocally` الموجود في السطر 53-57

### 4. فحص نسبة الطول في الخادم
**الملف: `supabase/functions/translate-entries/index.ts`**

في `parseAndUnlock` (بعد سطر 610):
- اذا كانت الترجمة اقل من 3 احرف والاصلي اكثر من 20 حرف — تخطي
- اذا كانت نسبة طول الترجمة اقل من 15% من الاصلي (والاصلي اكثر من 30 حرف) — تخطي

## التفاصيل التقنية

### ازالة السياق من handleTranslatePage

```text
// سطر 581-603: حذف بناء contextEntries بالكامل
// وارسال context: undefined في body

body: JSON.stringify({
  entries,
  glossary: activeGlossary,
  // لا context — هذا يمنع تسريب جمل من خارج الفلتر
  userApiKey: userGeminiKey || undefined,
  provider: translationProvider,
})
```

### ازالة الحماية المزدوجة

```text
// handleTranslatePage سطر 574-580:
قبل:
  const protectedMap = new Map();
  const entries = batch.map(e => {
    const p = protectTags(e.original);
    protectedMap.set(key, p);
    return { key, original: p.cleanText };
  });

بعد:
  const entries = batch.map(e => ({
    key: `${e.msbtFile}:${e.index}`,
    original: e.original,
  }));

// نفس التغيير في handleAutoTranslate سطر 218-224
```

### تقليل السياق في handleAutoTranslate

```text
// سطر 226-252: تقليل السياق
// - ابقاء الجيران فقط (offsets -1, 1)
// - حذف "recently translated entries" (سطر 244-252)
// - تحديد context.slice(0, 8) بدلاً من slice(0, 25)
```

### فحص نسبة الطول في الخادم

```text
// في parseAndUnlock بعد سطر 610:
const originalLen = item.pe.cleaned.length;
if (translated.length < 3 && originalLen > 20) {
  console.warn(`Skipping short translation: "${translated}" for ${item.entry.key}`);
  continue;
}
if (originalLen > 30 && translated.length < originalLen * 0.15) {
  console.warn(`Translation ratio too low for ${item.entry.key}`);
  continue;
}
```

## الملفات المتأثرة
1. `src/components/editor/types.tsx` — تقليل AI_BATCH_SIZE من 30 الى 10
2. `src/hooks/useEditorTranslation.ts` — ازالة الحماية المزدوجة + ازالة/تقليل السياق
3. `supabase/functions/translate-entries/index.ts` — فحص نسبة الطول

## النتيجة المتوقعة
- لن تظهر ترجمات من خارج الدفعة/الفلتر
- كل ترجمة تتطابق مع نصها الاصلي
- دفعات اصغر (10 نصوص) تعطي دقة اعلى
- الوسوم تُحمى مرة واحدة فقط على الخادم

