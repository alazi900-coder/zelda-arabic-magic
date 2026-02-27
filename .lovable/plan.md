

# اصلاح مشاكل الترجمة في مقارنة المحركات

## المشاكل المكتشفة

### 1. حماية مزدوجة للوسوم (Double Protection)
في `CompareEnginesDialog.tsx`، يتم حماية الوسوم على العميل (سطر 50) ثم ارسال النص المنظف للخادم، لكن الخادم يطبق `protectTags` مرة أخرى (سطر 715-718)، مما ينتج عناصر نائبة متداخلة مثل `TAG_TAG_0_0`.

### 2. تشويه أقواس قفل المصطلحات
الذكاء الاصطناعي يحوّل `⟪T0⟫` (U+27EA/U+27EB) إلى `《T0》` (U+300A/U+300B) وهي حروف مشابهة بصرياً لكن مختلفة، فلا يتم استبدالها مرة أخرى بواسطة `unlockTerms`.

### 3. MyMemory يُظهر TAG_0 حرفياً
MyMemory لا يفهم العناصر النائبة ويعيدها كنص عادي أو يشوّهها.

## الحل

### 1. ازالة الحماية المزدوجة من CompareEnginesDialog
**الملف: `src/components/editor/CompareEnginesDialog.tsx`**
- ارسال `entry.original` مباشرة بدلاً من `cleanText`
- ترك الخادم يتولى الحماية والاستعادة بالكامل
- حذف استيراد `protectTags/restoreTags` من هذا الملف لأنه غير ضروري

### 2. تطبيع أقواس قفل المصطلحات
**الملف: `supabase/functions/translate-entries/index.ts`**
- اضافة دالة `normalizeTermBrackets` في `unlockTerms` تستبدل المتغيرات المشابهة:
  - `《` و `〈` و `«` → `⟪`
  - `》` و `〉` و `»` → `⟫`
- تطبيقها على نص الترجمة قبل محاولة فك القفل
- اضافة تحقق اضافي: اذا لم يُعثر على `⟪T0⟫` بعد التطبيع، البحث بنمط regex عام مثل `/[⟪《〈«]T(\d+)[⟫》〉»]/g`

### 3. تحسين post-validation للوسوم TAG_N
**الملف: `supabase/functions/translate-entries/index.ts`**
- في `parseAndUnlock`: تنظيف متغيرات TAG المشوّهة (مثل `TAG _0` أو `tag_0` أو `TAG0`) واعادتها للشكل الصحيح `TAG_0` قبل استعادة الوسوم

## التفاصيل التقنية

### ازالة الحماية المزدوجة

```text
CompareEnginesDialog - fetchProvider():
  قبل: protectTags(entry.original) → ارسال cleanText → الخادم يحمي مرة أخرى
  بعد: ارسال entry.original مباشرة → الخادم يحمي ويستعيد
```

### تطبيع الأقواس

```text
function normalizeTermBrackets(text: string): string {
  return text
    .replace(/[《〈«]/g, '⟪')
    .replace(/[》〉»]/g, '⟫');
}

// في unlockTerms:
function unlockTerms(text, locks) {
  let result = normalizeTermBrackets(text);
  for (const lock of locks) {
    result = result.replace(lock.placeholder, lock.arabic);
  }
  // Fallback: regex للأقواس غير المعروفة
  result = result.replace(/[⟪《〈«]T(\d+)[⟫》〉»]/g, (match, num) => {
    const lock = locks.find(l => l.placeholder === `⟪T${num}⟫`);
    return lock ? lock.arabic : match;
  });
  return result;
}
```

### تنظيف TAG المشوّه

```text
// في parseAndUnlock، قبل استعادة الوسوم:
translated = translated
  .replace(/TAG\s+(\d+)/gi, 'TAG_$1')   // "TAG 0" → "TAG_0"
  .replace(/TAG(\d+)/gi, 'TAG_$1')       // "TAG0" → "TAG_0"
  .replace(/tag_(\d+)/g, 'TAG_$1');      // "tag_0" → "TAG_0"
```

## الملفات المتأثرة
1. `src/components/editor/CompareEnginesDialog.tsx` - ازالة الحماية المزدوجة
2. `supabase/functions/translate-entries/index.ts` - تطبيع الأقواس + تنظيف TAG

## النتيجة المتوقعة
- Gemini: `لقد أنعم عليك حكمة رئيس الحكماء بـ كتلة واحدة من شحن الإطلاق!` (مع استعادة الوسوم الأصلية)
- MyMemory: استعادة الوسوم بشكل صحيح بدلاً من عرض `TAG_0`
- Google: نفس التحسين

