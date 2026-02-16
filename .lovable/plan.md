
# تقرير التدقيق الشامل للمشروع

## الأخطاء والمشاكل المكتشفة

---

### 1. خطأ في الكونسول: "Function components cannot be given refs" (متوسط)

**المشكلة:** تظهر تحذيرات React في الكونسول بسبب تمرير `ref` لمكون وظيفي (function component) لا يستخدم `React.forwardRef()`.

**المصدر:** يبدو أن أحد المكونات المستخدمة في `App.tsx` (مثل `Index` أو أحد مكونات الصفحات) يُمرر له `ref` ضمنياً.

**الحل:** تغليف المكونات المعنية بـ `React.forwardRef()` أو التحقق من أن `react-router-dom` لا يمرر refs لمكونات الصفحات.

---

### 2. خطأ في `FindReplacePanel.tsx` - استدعاء `setApplied` داخل `useMemo` (حرج)

**المشكلة:** في السطر 40 من `FindReplacePanel.tsx`:
```typescript
const matches = useMemo(() => {
    if (!findText.trim()) return [];
    setApplied(false);  // <-- خطأ! لا يجوز تغيير الحالة داخل useMemo
```
استدعاء `setState` داخل `useMemo` يخالف قواعد React ويمكن أن يسبب سلوكاً غير متوقع وتحذيرات في بيئة التطوير.

**الحل:** نقل `setApplied(false)` إلى `useEffect` منفصل يعتمد على `findText`.

---

### 3. استخدام `useMemo` كـ `useEffect` (حرج)

**المشكلة:** في السطر 76-78 من `FindReplacePanel.tsx`:
```typescript
useMemo(() => {
    setSelectedKeys(new Set(matches.map(m => m.key)));
}, [matches]);
```
هذا استخدام خاطئ لـ `useMemo` كأداة لتنفيذ أثر جانبي (side effect). يجب أن يكون `useEffect`.

**الحل:** تحويله إلى `useEffect`.

---

### 4. خريطة الحروف العربية غير دقيقة في `normalizeArabicPresentationForms` (متوسط)

**المشكلة:** في `useEditorState.ts` السطور 753-767، الخريطة تحتوي على تعيينات غير صحيحة. مثلاً:
- `0xFB56` معيّن كـ `'ة'` بينما هو في الحقيقة `'پ'` (حرف فارسي)
- `0xFB58` معيّن كـ `'ت'` بينما هو `'پ'` أيضاً
- العديد من التعيينات الأخرى غير دقيقة

**التأثير:** قد يؤدي لتحويل خاطئ عند تصدير/استيراد الملفات. لكن الدالة `removeArabicPresentationForms` في `arabic-processing.ts` تعمل بشكل صحيح باستخدام خريطة عكسية دقيقة.

**الحل:** استخدام `removeArabicPresentationForms` من `arabic-processing.ts` بدلاً من الخريطة المحلية، أو تصحيح الخريطة.

---

### 5. تكرار دوال بين `types.tsx` و `arabic-processing.ts` (تحسين)

**المشكلة:** الدوال التالية موجودة بنسخ مكررة:
- `isArabicChar` في كلا الملفين
- `hasArabicChars` في كلا الملفين  
- `unReverseBidi` في `types.tsx` مقابل `reverseBidi` في `arabic-processing.ts`

**التأثير:** صعوبة الصيانة واحتمال تباين السلوك.

**الحل:** توحيد مصدر الحقيقة واستيراد من ملف واحد.

---

### 6. حساب البايت غير دقيق (متوسط)

**المشكلة:** في عدة أماكن (`EntryCard.tsx` السطر 95، `useEditorState.ts` السطر 325):
```typescript
const byteUsed = translation.length * 2;
```
هذا يفترض أن كل حرف يأخذ 2 بايت (UTF-16)، لكن الأحرف خارج BMP (مثل الإيموجي) تأخذ 4 بايت. أيضاً بعض الرموز التقنية الخاصة قد تأخذ أحجاماً مختلفة.

**الحل:** استخدام `new TextEncoder().encode(text).length` لحساب UTF-8، أو `new Blob([text]).size` للحساب الدقيق حسب ترميز MSBT (UTF-16LE).

---

### 7. عدم التحقق من `previousTranslations` بشكل صحيح (طفيف)

**المشكلة:** في `EntryCard.tsx` السطر 86:
```typescript
{previousTranslations[key] !== undefined && (
```
إذا كانت القيمة السابقة `""` (سلسلة فارغة)، سيظهر زر التراجع ولكن التراجع سيمسح الترجمة بالكامل. هذا سلوك صحيح لكن قد يكون مربكاً.

---

### 8. أمن قاعدة البيانات - تسريب كلمات المرور (طفيف)

**المشكلة:** حماية تسريب كلمات المرور معطلة (Leaked Password Protection Disabled).

**الحل:** تفعيل الحماية في إعدادات المصادقة.

---

## خطة الإصلاح المقترحة

| الأولوية | الإصلاح | الملف |
|-----------|---------|-------|
| 1 | إصلاح `setState` داخل `useMemo` في FindReplacePanel | `FindReplacePanel.tsx` |
| 2 | تحويل `useMemo` الخاطئ إلى `useEffect` | `FindReplacePanel.tsx` |
| 3 | تصحيح خريطة الحروف أو توحيد مع `arabic-processing.ts` | `useEditorState.ts` |
| 4 | توحيد الدوال المكررة | `types.tsx` |
| 5 | تحسين حساب البايت | `EntryCard.tsx`, `useEditorState.ts` |
| 6 | معالجة تحذير refs في المكونات | `App.tsx` / صفحات |

---

## ملاحظات إيجابية

- هيكلية المشروع بعد التقسيم أصبحت منظمة وواضحة
- نظام الحفظ التلقائي (IndexedDB + Cloud) يعمل بشكل سليم
- معالجة الأخطاء في Edge Functions شاملة ومفيدة للمستخدم
- نظام الفلاتر والإحصائيات الموحد فعال ومحسّن
- ميزة البحث والاستبدال تعمل بشكل صحيح (باستثناء الأخطاء التقنية المذكورة)
