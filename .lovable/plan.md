

# إصلاح فقدان النصوص الأصلية عند إعادة الاستخراج

## المشكلة
عند إعادة استخراج ملف BDAT مبني سابقاً:
1. `idbClear()` يمسح كل IndexedDB بما فيها `originalTexts` المحفوظة
2. لأن الملف يحتوي Presentation Forms، لا يُعاد حفظ `originalTexts`
3. النصوص الإنجليزية الأصلية تضيع نهائياً
4. النظام لا يستطيع التمييز بين الأصل والترجمة

## الحل

### 1. تعديل `src/lib/idb-storage.ts` - إضافة دالة مسح انتقائي
- إضافة `idbClearExcept(keepKeys: string[])` تمسح كل شيء ما عدا مفاتيح محددة
- هذا يحمي `originalTexts` من المسح عند إعادة الاستخراج

### 2. تعديل `src/pages/XenobladeProcess.tsx` - حماية النصوص الأصلية
- استبدال `idbClear()` بـ `idbClearExcept(["originalTexts"])` عند إعادة الاستخراج من ملف مبني
- عند الاستخراج من ملف نظيف: الاستمرار بـ `idbClear()` العادي ثم إعادة حفظ `originalTexts`
- عند الاستخراج من ملف مبني: قراءة `originalTexts` المحفوظة واستعادة النصوص الإنجليزية في الإدخالات مباشرة قبل الحفظ

### 3. تعديل `src/hooks/useEditorState.ts` - تحسين كشف واستعادة النصوص
- إضافة فحص مبكر: إذا كانت جميع النصوص الأصلية بها Presentation Forms والترجمات فارغة، محاولة الاستعادة من `originalTexts`
- تحسين رسالة التنبيه لتكون أوضح

## التفاصيل التقنية

### الدالة الجديدة في `idb-storage.ts`:
```text
idbClearExcept(keepKeys: string[])
  - تقرأ قيم المفاتيح المطلوبة أولاً
  - تمسح كل شيء
  - تعيد كتابة المفاتيح المحفوظة
```

### تدفق الاستخراج المُحسَّن في `XenobladeProcess.tsx`:
```text
1. استخراج النصوص من الملف
2. فحص: هل يحتوي Presentation Forms؟
   - نعم (ملف مبني):
     a. قراءة originalTexts المحفوظة من IndexedDB
     b. استبدال النصوص المُشكَّلة بالإنجليزية المحفوظة في allEntries
     c. استخدام idbClearExcept(["originalTexts"]) بدلاً من idbClear()
   - لا (ملف نظيف):
     a. حفظ originalTexts جديدة
     b. idbClear() ثم إعادة حفظ originalTexts
3. حفظ editorState مع النصوص المُصحَّحة
```

### الملفات المتأثرة:
- `src/lib/idb-storage.ts` — إضافة `idbClearExcept`
- `src/pages/XenobladeProcess.tsx` — استخدام المسح الانتقائي + استعادة النصوص أثناء الاستخراج
- `src/hooks/useEditorState.ts` — تحسين منطق الاستعادة التلقائي
