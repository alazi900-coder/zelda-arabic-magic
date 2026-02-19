
# تصحيح مسار الخط + تطبيق المعالجة العربية تلقائياً عند البناء

## المشكلة الأولى: مسار الخط الخاطئ في أداة بناء حزمة المود

### الوضع الحالي (خاطئ):
في `src/pages/ModPackager.tsx` السطر 125:
```
romfs/menu/font/${fontName}
```

### الوضع الصحيح:
المودات التي تعتمد على Skyline plugin (مثل Unburger) لا تقرأ الخط من `menu/font` أبداً. البلغين يقرأ الخط من مسار محدد داخل مجلد skyline:
```
romfs/skyline/font/font_main.bfttf
```

ملاحظتان مهمتان:
1. **اسم الملف ثابت**: يجب أن يكون `font_main.bfttf` بغض النظر عن اسم ملف الخط الذي رفعه المستخدم
2. **المسار ثابت**: `romfs/skyline/font/` وليس `romfs/menu/font/`

### التغييرات في `src/pages/ModPackager.tsx`:
- السطر 125: تغيير `romfs/menu/font/${fontName}` إلى `romfs/skyline/font/font_main.bfttf`
- السطر 332 (عرض هيكل المجلدات): تحديث عرض المسار من `menu/font/` إلى `skyline/font/`
- السطر 332: عرض الاسم الثابت `font_main.bfttf` بدل اسم الملف الأصلي
- تحديث لوحة المعلومات (Info banner) لتوضيح أن هذا للمودات المعتمدة على Skyline

---

## المشكلة الثانية: المعالجة العربية لا تُطبَّق تلقائياً عند البناء

### الوضع الحالي:
في `handleBuildXenoblade` (السطر 122-123 في `useEditorBuild.ts`):
```typescript
const nonEmptyTranslations: Record<string, string> = {};
for (const [k, v] of Object.entries(state.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }
```
هذا يأخذ الترجمات كما هي دون تطبيق أي معالجة عربية. إذا نسي المستخدم الضغط على "تطبيق المعالجة العربية" فستظهر النصوص مكسورة أو غير مقروءة في اللعبة.

### الحل:
إضافة خطوة تلقائية في `handleBuildXenoblade` (وأيضاً `handleBuild` للحالات الأخرى) مباشرة بعد تجميع `nonEmptyTranslations`:

```typescript
// Auto Arabic processing
let autoProcessedCount = 0;
for (const [key, value] of Object.entries(nonEmptyTranslations)) {
  if (!value?.trim()) continue;
  if (hasArabicPresentationForms(value)) continue; // already processed
  if (!hasArabicCharsProcessing(value)) continue;  // not arabic
  nonEmptyTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
  autoProcessedCount++;
}
if (autoProcessedCount > 0) {
  setBuildProgress(`✅ تمت معالجة ${autoProcessedCount} نص عربي تلقائياً...`);
  await new Promise(r => setTimeout(r, 800));
}
```

هذا يضمن أن:
- النصوص المعالجة مسبقاً (تحتوي Presentation Forms) لا تُعالج مرة ثانية
- النصوص الإنجليزية لا تُمس
- فقط النصوص العربية غير المعالجة تُعالج تلقائياً

### الملفات التي ستتغير:

| الملف | التغيير |
|-------|---------|
| `src/pages/ModPackager.tsx` | تصحيح مسار الخط إلى `romfs/skyline/font/font_main.bfttf` + تحديث العرض المرئي للمسار |
| `src/hooks/useEditorBuild.ts` | إضافة المعالجة العربية التلقائية في `handleBuildXenoblade` قبل إرسال الترجمات |

---

## تفصيل التغييرات

### في ModPackager.tsx:
```
// قبل:
path: `romfs/menu/font/${fontName}`
// بعد:
path: `romfs/skyline/font/font_main.bfttf`
```

عرض هيكل المجلدات (font structure preview):
```
// قبل:
romfs/
  menu/
    font/
      NotoSansArabic-Regular.bfttf

// بعد:
romfs/
  skyline/
    font/
      font_main.bfttf
```

لوحة المعلومات: إضافة تنبيه يوضح أن هذه الأداة مُصممة للمودات المعتمدة على Skyline plugin.

### في useEditorBuild.ts:
في `handleBuildXenoblade` بعد السطر 123 وبعد كل موضع يُنشأ فيه `nonEmptyTranslations`:
إضافة حلقة المعالجة التلقائية.

يوجد موضعان في الكود:
1. السطر 122-123 (للملفات الثنائية BDAT)
2. السطر 201-202 (للملفات MSBT/JSON BDAT)

كلاهما يحتاج الإضافة.
