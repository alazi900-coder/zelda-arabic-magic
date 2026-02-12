

# إصلاح الأحرف المتقطعة وعلامات الاستفهام في الأسلحة

## المشاكل المكتشفة

### 1. الأحرف العربية متقطعة (غير متصلة)
السبب: الكود الحالي يفترض أن محرك اللعبة يربط الأحرف العربية تلقائياً، لكن هذا غير صحيح. يجب إضافة عملية **Arabic Reshaping** التي تحوّل الأحرف العربية من شكلها المنفصل (مثل: ا ل ع ر ب ي ة) إلى شكلها المتصل (العربية) باستخدام Unicode Presentation Forms.

### 2. الأسلحة والأدوات تظهر كعلامات استفهام
السبب: خطأ في منطق البناء (Build) - عندما يكون النص "محمي" (protected entry)، الكود الحالي يزيد العداد فقط ولا يحقن النص المترجم فعلياً في الملف. النص الأصلي يبقى كما هو. أيضاً، إذا كان النص المترجم أطول من حجم الخانة الأصلية في ملف MSBT، يتم تجاهله بصمت.

### 3. خطأ في حقن النصوص المحمية
في ملف `arabize/index.ts` سطر 331-335:
```text
if (protectedEntries.has(key) || ...) {
  // Keep original - no processing needed  <-- هذا خطأ!
  modifiedCount++;  
  // لا يتم وضع النص المترجم! يبقى النص الأصلي
}
```
يجب أن يضع النص المترجم بدون معالجة BiDi.

---

## التغييرات المطلوبة

### 1. إضافة Arabic Reshaping في `supabase/functions/arabize/index.ts`
- إضافة دالة `reshapeArabic(text)` التي تحوّل الأحرف العربية لأشكالها المتصلة (Initial, Medial, Final, Isolated) حسب موقعها في الكلمة
- تحديث دالة `processArabicText` لتطبيق Reshaping بعد BiDi Reversal
- يشمل جدول الأشكال العربية (Arabic Presentation Forms-B) لكل حرف

### 2. إصلاح حقن النصوص المحمية في `supabase/functions/arabize/index.ts`
- تعديل منطق البناء: عندما يكون النص محمياً، يتم حقن نص الترجمة مباشرة **بدون** معالجة BiDi (لأنه أصلاً نص عربي صحيح)
- تغيير من:
  ```text
  if (protectedEntries.has(key)) {
    modifiedCount++;  // لا يفعل شيء!
  }
  ```
  إلى:
  ```text
  if (protectedEntries.has(key)) {
    entries[i].processedText = reshapeArabic(translations[key]);
    modifiedCount++;
  }
  ```

### 3. إضافة تحذير عند تجاوز حجم النص
- في `injectMSBT`: إضافة تسجيل (logging) عندما يتم تخطي نص لأنه أطول من الحجم المسموح
- هذا يساعد في تشخيص مشاكل علامات الاستفهام مستقبلاً

---

## التفاصيل التقنية

### جدول Arabic Reshaping
كل حرف عربي له 4 أشكال حسب موقعه:
- **منفصل** (Isolated): عندما لا يتصل بشيء
- **بداية** (Initial): عندما يتصل بالحرف التالي فقط
- **وسط** (Medial): عندما يتصل بالحرف قبله وبعده
- **نهاية** (Final): عندما يتصل بالحرف قبله فقط

مثال: حرف العين (ع)
- منفصل: U+FEC9
- بداية: U+FECB
- وسط: U+FECC
- نهاية: U+FECA

### الملفات المتأثرة
- `supabase/functions/arabize/index.ts` - إضافة reshaping + إصلاح protected entries + تحسين logging

