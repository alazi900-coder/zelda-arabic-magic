

# خطة التحسينات الآمنة للكود

## هل التعديلات آمنة؟

نعم، جميع التعديلات هي **إعادة هيكلة داخلية** (Refactoring) لا تغير سلوك التطبيق أو مظهره. المستخدم لن يلاحظ أي فرق في الواجهة، لكن الأداء سيتحسن والكود سيصبح أنظف.

## التعديلات المخطط لها (بالترتيب)

### 1. استبدال Blob بحساب مباشر للبايت
- إنشاء ملف جديد `src/lib/byte-utils.ts` يحتوي على دالة `utf16leByteLength`
- استبدال `new Blob([...]).size` في `EntryCard.tsx` و `useEditorState.ts`
- **التأثير:** تحسين أداء ملحوظ، بدون تغيير في النتائج

### 2. توحيد دوال تحميل القواميس
- استبدال 6 دوال متطابقة بدالة واحدة `loadGlossary(url, name)`
- **التأثير:** تقليل ~100 سطر مكرر، نفس الوظيفة

### 3. إنشاء hook للرسائل المؤقتة
- إنشاء `src/hooks/useTimedMessage.ts`
- استبدال نمط `setTimeout(() => setter(""), 3000)` المكرر
- **التأثير:** كود أنظف، نفس السلوك

### 4. تعريف TypeScript interfaces
- إضافة interfaces في `types.tsx` بدلا من `any`
- **التأثير:** أمان أفضل للأنواع، بدون تغيير في التشغيل

### 5. تمرير isMobile كـ prop
- تمرير `isMobile` من `Editor.tsx` إلى `EntryCard` بدلا من استدعاء hook منفصل في كل بطاقة
- **التأثير:** تقليل اشتراكات media query المتكررة

## التفاصيل التقنية

### الملفات الجديدة:
- `src/lib/byte-utils.ts` - دالة حساب البايت المباشرة
- `src/hooks/useTimedMessage.ts` - hook الرسائل المؤقتة

### الملفات المعدلة:
- `src/components/editor/EntryCard.tsx` - استبدال Blob + إضافة prop isMobile
- `src/components/editor/types.tsx` - إضافة interfaces
- `src/hooks/useEditorState.ts` - توحيد القواميس + استبدال Blob + استخدام hook الرسائل
- `src/pages/Editor.tsx` - تمرير isMobile

### ملاحظة مهمة:
تقسيم ملف `useEditorState.ts` إلى hooks أصغر (الخطوة 6 من التقرير) سيتم في مرحلة لاحقة لأنه تغيير كبير يحتاج تخطيط دقيق. التحسينات الحالية كافية لتحسين الأداء والجودة بشكل واضح.

