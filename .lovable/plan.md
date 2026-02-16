

# إصلاح مشكلة البناء + تشخيص تفصيلي

## المشاكل المكتشفة

### 1. إحصائيات البناء تظهر 0 دائماً (خلل مؤكد)
الخادم يرسل رؤوس HTTP مخصصة (`X-Modified-Count`, `X-Build-Stats`) لكن بدون `Access-Control-Expose-Headers`, المتصفح يحظر الوصول لها. لذلك `response.headers.get('X-Modified-Count')` يعيد `null` دائماً → يظهر 0.

هذا يعني أنك لم تكن تعرف العدد الحقيقي للنصوص المعدلة في أي بناء سابق.

### 2. الترجمات الجديدة لا تظهر في البناء (يحتاج تشخيص)
عند رفع ملف مبني سابقاً وإضافة ترجمات جديدة ثم البناء، الجديدة لا تظهر. السبب المحتمل: مشكلة في مطابقة المفاتيح أو في حالة الترجمات.

## الحل

### الخطوة 1: إصلاح رؤوس CORS في Edge Function
ملف: `supabase/functions/arabize/index.ts`

إضافة `Access-Control-Expose-Headers` للاستجابة:
```text
'Access-Control-Expose-Headers': 'X-Modified-Count, X-Expanded-Count, X-File-Size, X-Compressed-Size, X-Build-Stats, X-Entries-Preview, X-Skipped-Already-Arabized, X-Is-Compressed',
```
هذا يصلح عرض الإحصائيات فوراً.

### الخطوة 2: إضافة تسجيل تشخيصي في البناء
ملف: `src/hooks/useEditorBuild.ts`

قبل إرسال FormData, إضافة console.log تفصيلي:
```text
console.log('[BUILD] Total translations:', Object.keys(nonEmptyTranslations).length);
console.log('[BUILD] Protected entries:', Array.from(state.protectedEntries || []).length);
console.log('[BUILD] Sample keys:', Object.keys(nonEmptyTranslations).slice(0, 10));
```

### الخطوة 3: إضافة نافذة تأكيد قبل البناء
ملف جديد: `src/components/editor/BuildConfirmDialog.tsx`
ملف: `src/pages/Editor.tsx`

نافذة تظهر قبل البناء تعرض:
- عدد الترجمات الإجمالي التي ستُرسل
- توزيعها حسب الفئة (واجهة: X, إعدادات: Y, حوارات: Z)
- عدد المحمية
- زر "بناء" و"إلغاء"

هذا يتيح لك التأكد أن كل ترجماتك مشمولة قبل البناء.

### الخطوة 4: إضافة تسجيل على الخادم
ملف: `supabase/functions/arabize/index.ts`

إضافة console.log في وضع البناء لعرض:
- عدد الترجمات المستلمة
- عدد المفاتيح المطابقة
- أمثلة على المفاتيح المرسلة vs المفاتيح في الملف

```text
console.log(`[BUILD] Received ${Object.keys(translations).length} translations`);
console.log(`[BUILD] Sample translation keys: ${Object.keys(translations).slice(0,5).join(', ')}`);
console.log(`[BUILD] MSBT file: ${file.name}, entries: ${entries.length}`);
```

## الملفات المعدلة
- `supabase/functions/arabize/index.ts` - إصلاح CORS headers + تسجيل تشخيصي
- `src/hooks/useEditorBuild.ts` - تسجيل تشخيصي + منطق التأكيد
- `src/components/editor/BuildConfirmDialog.tsx` - ملف جديد (نافذة التأكيد)
- `src/pages/Editor.tsx` - ربط النافذة

## النتيجة المتوقعة
1. إحصائيات البناء تظهر الأعداد الصحيحة (بدلاً من 0)
2. نافذة تأكيد تساعدك على التحقق قبل كل بناء
3. سجلات تشخيصية تساعد في تحديد سبب عدم ظهور الترجمات الجديدة

