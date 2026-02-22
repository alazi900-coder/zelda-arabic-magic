

## إضافة زر "استيراد ملف قديم" في المحرر

### المشكلة
ملفات الترجمة القديمة تستخدم مفاتيح بتنسيق تسلسلي مثل:
```
"bdat-bin:SYS_CharacterName.bdat:0": "نوح"
"bdat-bin:SYS_CharacterName.bdat:1": "ميو"
```

بينما النظام الحالي يستخدم مفاتيح هيكلية:
```
"bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name:0": "نوح"
```

عند استيراد ملف قديم، لا يتطابق أي مفتاح فيرفض المحرر الملف.

### الحل

**ملف: `src/hooks/useEditorFileIO.ts`**

1. إضافة دالة `convertLegacyKeys` تقوم بـ:
   - كشف المفاتيح القديمة (3 أجزاء مفصولة بنقطتين، الجزء الأخير رقم)
   - تجميع المدخلات الحالية حسب اسم الملف المصدر
   - مطابقة الفهرس التسلسلي القديم مع المدخلة المقابلة بالترتيب
   - إرجاع كائن ترجمات بالمفاتيح الجديدة

2. إضافة دالة `handleImportLegacyJson` جديدة تقوم بـ:
   - فتح منتقي ملفات
   - قراءة JSON وإصلاحه
   - تحويل المفاتيح القديمة عبر `convertLegacyKeys`
   - تطبيق الترجمات المحولة على المحرر
   - عرض رسالة توضح عدد المفاتيح المحولة بنجاح

3. تصدير `handleImportLegacyJson` من الـ hook

**ملف: `src/pages/Editor.tsx`**

4. إضافة زر جديد في قائمة "تصدير / استيراد" في كلا النسختين (موبايل وديسكتوب):
   - "استيراد JSON قديم" مع أيقونة مميزة
   - يظهر بعد أزرار الاستيراد الحالية

### التفاصيل التقنية

منطق كشف المفاتيح القديمة:
```text
مفتاح قديم: "bdat-bin:filename.bdat:5"
  -> 3 أجزاء، الأخير رقم صحيح

مفتاح جديد: "bdat-bin:filename.bdat:TableName:0:colName:0"
  -> 6 أجزاء
```

منطق التحويل:
```text
1. تجميع entries الحالية حسب اسم الملف:
   entries من "SYS_CharacterName.bdat" -> [entry0, entry1, entry2...]

2. لكل مفتاح قديم "bdat-bin:SYS_CharacterName.bdat:2":
   -> filename = "SYS_CharacterName.bdat"
   -> index = 2
   -> المدخلة المقابلة = entries["SYS_CharacterName.bdat"][2]
   -> المفتاح الجديد = entries[2].msbtFile + ":" + entries[2].index
```

