

## إضافة زر "استيراد JSON قديم" في المحرر

### المشكلة
ملفات الترجمة القديمة تستخدم مفاتيح تسلسلية مثل:
```text
"bdat-bin:SYS_CharacterName.bdat:0": "نوح"
"bdat-bin:SYS_CharacterName.bdat:1": "ميو"
```

النظام الحالي يستخدم مفاتيح هيكلية:
```text
"bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name:0": "نوح"
```

عند استيراد ملف قديم بالطريقة العادية، لا يتطابق أي مفتاح فيُرفض الملف.

### الحل
إضافة زر استيراد مخصص يحوّل المفاتيح القديمة تلقائياً إلى الجديدة.

### التغييرات

**1. ملف `src/hooks/useEditorFileIO.ts`**

- إضافة دالة `convertLegacyKeys(imported, entries)`:
  - تكشف المفاتيح القديمة (3 أجزاء مفصولة بنقطتين، الجزء الأخير رقم صحيح)
  - تجمّع المدخلات الحالية حسب اسم الملف المصدر
  - تطابق الفهرس التسلسلي القديم مع المدخلة المقابلة بالترتيب
  - تُرجع كائن ترجمات بالمفاتيح الجديدة

- إضافة دالة `handleImportLegacyJson()`:
  - تفتح منتقي ملفات JSON
  - تقرأ الملف وتصلحه بـ `repairJson`
  - تستدعي `convertLegacyKeys` للتحويل
  - تطبّق الترجمات المحوّلة على المحرر عبر `setState`
  - تعرض رسالة نجاح بعدد المفاتيح المحوّلة

- تصدير `handleImportLegacyJson` من الـ hook

**2. ملف `src/pages/Editor.tsx`**

- إضافة زر "استيراد JSON قديم" في قائمة الاستيراد (في نسختي الموبايل والديسكتوب) بعد أزرار الاستيراد الحالية (سطر 695 وسطر 763)
- الزر يستدعي `editor.handleImportLegacyJson`

### التفاصيل التقنية

منطق كشف المفاتيح القديمة:
```text
مفتاح قديم: "bdat-bin:filename.bdat:5"
  -> split(":") = ["bdat-bin", "filename.bdat", "5"]
  -> 3 أجزاء، parseInt("5") ليس NaN = قديم

مفتاح جديد: "bdat-bin:filename.bdat:TableName:0:colName:0"
  -> 6 أجزاء = جديد
```

منطق التحويل:
```text
1. تجميع entries حسب اسم الملف:
   استخراج filename من msbtFile (الجزء الثاني من المفتاح الهيكلي)
   مثلاً: "bdat-bin:test.bdat:Table:0:col:0" -> filename = "test.bdat"

2. لكل مفتاح قديم "bdat-bin:test.bdat:2":
   -> filename = "test.bdat"
   -> index = 2
   -> entries من "test.bdat" مرتبة حسب ظهورها
   -> المدخلة رقم 2 = entries[filename][2]
   -> المفتاح الجديد = entries[2].msbtFile + ":" + entries[2].index
```

