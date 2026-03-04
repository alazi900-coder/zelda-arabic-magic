

## تحليل المشكلة الجذرية

المشكلة في `getEntriesGrouped`: يستخدم `filteredEntries` الذي يتأثر بالفلاتر النشطة (بحث، تصنيف، حالة...). عندما يختار المستخدم صفحة 14-26، يتم تقطيع `filteredEntries` وليس `state.entries` الأصلي. إذا كان هناك أي فلتر نشط، الصفحة 14 في `filteredEntries` ≠ الصفحة 14 الحقيقية. حتى لو لم يكن هناك فلتر، `totalPages` المُمرَّر للنافذة مبني على `filteredEntries`.

## الخطة

### 1. إصلاح منطق التصدير (`useEditorFileIO.ts`)
- تعديل `getEntriesGrouped` ليستخدم **`state.entries`** دائماً (وليس `filteredEntries`) عند تحديد نطاق الصفحات
- تمرير `state.entries.length` و `Math.ceil(state.entries.length / 50)` كقيم إجمالية للنافذة

### 2. زر تصدير الإنجليزية المنفصل (`Editor.tsx`)
- إضافة **زر مستقل** "تصدير الإنجليزية 📦" في شريط الأدوات (mobile + desktop) بجانب أزرار الحفظ/التحميل
- الزر يفتح نافذة `ExportEnglishDialog` مباشرة

### 3. زر تصدير الصفحة الحالية السريع (`Editor.tsx`)
- إضافة **زر سريع** بجانب أزرار التنقل (PaginationControls) يصدّر الصفحة الحالية مباشرة بدون نافذة
- يأخذ `currentPage` ويصدّر 50 نص إنجليزي كـ JSON

### 4. تحديث نافذة التصدير (`ExportEnglishDialog.tsx`)
- تمرير `totalEntries` من `state.entries.length` (بدلاً من `filteredEntries.length`)
- تمرير `totalPages` من إجمالي الصفحات الحقيقي

### الملفات المتأثرة
- `src/hooks/useEditorFileIO.ts` — إصلاح `getEntriesGrouped` + إضافة `handleExportCurrentPageEnglish`
- `src/pages/Editor.tsx` — إضافة الزرين المنفصلين + تحديث props النافذة
- `src/components/editor/ExportEnglishDialog.tsx` — لا تغيير جوهري

