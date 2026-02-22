
# استبدال `bdat-writer.ts` بالنسخة المحسّنة من Manos

## ملخص التحسينات

الملف المحسّن يعالج 4 مشاكل حقيقية في الكود الحالي:

| المشكلة | الحل في النسخة الجديدة |
|---------|------------------------|
| MessageId u16 overflow (مؤشرات تتجاوز 65,535) | كشف مسبق + ضغط جدول النصوص (MessageId strings first) |
| تعارض النصوص المشتركة (صفوف مختلفة → نفس النص → ترجمات مختلفة) | تتبع per-cell بدل per-offset، إنشاء نسخ منفصلة |
| overflowErrors فارغة دائماً | تقارير مفصلة مع السبب (u16_offset_overflow / bounds_exceeded / write_error) |
| كتابة بدون فحص حدود | دوال safeSetUint16/safeSetUint32 مع فحص bounds |

## خطة التنفيذ

### 1. استبدال `src/lib/bdat-writer.ts`
- نسخ الملف المرفوع `bdat-writer-improved.ts` بالكامل ليحل محل الملف الحالي
- الملف يحافظ على نفس الـ API: `patchBdatFile()` و `rebuildBdatFile()` (legacy)
- التغييرات في `PatchResult`: إضافة حقل `tableStats` جديد (لا يكسر الكود الحالي لأنه حقل إضافي)

### 2. تحديث `src/hooks/useEditorBuild.ts`
- استخدام `tableStats` الجديد لعرض تفاصيل أفضل في سجل البناء (حجم جدول النصوص قبل/بعد، وجود أعمدة u16)
- عرض تحذيرات u16 overflow في واجهة المستخدم

### 3. تحديث `OverflowError` في المستدعين
- الحقل `reason` الجديد (`'u16_offset_overflow' | 'bounds_exceeded' | 'write_error'`) يحتاج تحديث عرض الأخطاء في `BdatBuildReport.tsx` إن وُجد

## التفاصيل التقنية

### التغييرات الهيكلية الرئيسية في الـ writer:

1. **Per-cell tracking**: بدل تجميع الخلايا بالـ offset فقط، يتم تتبع كل خلية مع ترجمتها المحددة. إذا صفين يشيرون لنفس النص الأصلي لكن بترجمات مختلفة، يُنشأ نسختان منفصلتان في جدول النصوص.

2. **u16 compaction**: عند اكتشاف تجاوز u16، يعاد ترتيب جدول النصوص لوضع النصوص المرتبطة بأعمدة MessageId أولاً (offsets أصغر). إذا نجح الضغط، تُزال أخطاء الـ overflow.

3. **Safe writes**: كل عملية كتابة تمر عبر `safeSetUint16`/`safeSetUint32` مع فحص الحدود.

### الملفات المتأثرة:
- `src/lib/bdat-writer.ts` — استبدال كامل
- `src/hooks/useEditorBuild.ts` — تحديث طفيف لاستخدام `tableStats`
- الاختبارات الحالية (`bdat-roundtrip-nochange.test.ts`, `bdat-expansion.test.ts`) ستعمل بدون تعديل لأن الـ API متوافق
