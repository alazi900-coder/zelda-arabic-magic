

# اصلاح حماية الوسوم التقنية في مقارنة المحركات

## المشكلة
عند استخدام "مقارنة المحركات"، الوسوم التقنية مثل `[ML:number digit=8 ]` و الاختصارات مثل `G` لا تُحمى بشكل صحيح:
- المحركات تترجم أو تشوّه العناصر النائبة `TAG_N`
- حماية الوسوم في الخادم (Edge Function) أبسط من حماية العميل (لا تشمل الاختصارات)
- لا يتم استعادة الوسوم بشكل موثوق

## الحل
تطبيق حماية الوسوم على **جانب العميل** في `CompareEnginesDialog` قبل الارسال، ثم استعادتها بعد استلام النتائج. هذا يضمن أن المحركات لا ترى الوسوم أصلاً.

## التغييرات

### 1. `src/components/editor/CompareEnginesDialog.tsx`
- استيراد `protectTags` و `restoreTags` من `@/lib/xc3-tag-protection`
- في `fetchProvider`:
  1. تطبيق `protectTags(entry.original)` للحصول على نص نظيف + قائمة الوسوم
  2. ارسال `cleanText` بدلاً من `entry.original` للترجمة
  3. عند استلام النتيجة، تطبيق `restoreTags(translation, tags)` لاستعادة الوسوم في مكانها

### 2. `supabase/functions/translate-entries/index.ts`
- توسيع `protectTags` في الخادم لتشمل الاختصارات المحمية (مثل `G`, `EXP`, `CP`, `SP`, `HP` الخ) بنفس القائمة الموجودة في العميل
- هذا يحمي الترجمة التلقائية العادية أيضاً وليس فقط المقارنة

## التفاصيل التقنية

```text
CompareEnginesDialog - fetchProvider():
  1. const { cleanText, tags } = protectTags(entry.original)
  2. ارسال cleanText بدلاً من entry.original
  3. const finalTranslation = restoreTags(rawTranslation, tags)
  4. عرض finalTranslation للمستخدم

Edge Function - protectTags():
  قبل: /\[[^\]]*\]|[\uFFF9-\uFFFC\uE000-\uE0FF]+/g
  بعد: اضافة نمط الاختصارات \b(EXP|CP|SP|HP|G|...)\b
```

## النتيجة المتوقعة
- النص الأصلي: `You received [ML:number digit=8 ]G.`
- ما يُرسل للمحركات: `You received TAG_0 TAG_1.`
- ترجمة المحرك: `لقد تلقيت TAG_0 TAG_1.`
- النتيجة النهائية: `لقد تلقيت [ML:number digit=8 ]G.`
