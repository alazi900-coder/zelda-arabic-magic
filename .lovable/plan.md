

# اضافة تصدير/استيراد حسب الفلتر + اصلاح انعكاس النصوص

## ملخص
سيتم تنفيذ التغييرين معاً في نفس الوقت:
1. **اصلاح مشكلة الانعكاس** - منع الحماية التلقائية للنصوص الخارجة من بناء سابق
2. **تصدير/استيراد مفلتر** - عند وجود فلتر نشط، التصدير والاستيراد يعملان فقط على النصوص المفلترة

## كيف يحل مشكلتك
- الاصلاح يمنع تكرار المشكلة مستقبلاً
- التصدير/الاستيراد المفلتر يتيح لك اصلاح النصوص المعكوسة الحالية: تصدّر ترجمات "القوائم" من مشروع سليم، ثم تستوردها في المشروع الحالي وهي تُطبّق فقط على القوائم

---

## التفاصيل التقنية

### 1. اصلاح الحماية التلقائية - `useEditorState.ts` (سطر 179-188)

اضافة شرط `hasArabicPresentationForms` لتخطي حماية النصوص من بناء سابق:

```text
for (const entry of stored.entries) {
  const key = `${entry.msbtFile}:${entry.index}`;
  if (arabicRegex.test(entry.original)) {
    // تخطي الحماية اذا كان الاصل من بناء سابق (يحتوي presentation forms)
    if (hasArabicPresentationForms(entry.original)) continue;
    const existingTranslation = mergedTranslations[key]?.trim();
    if (existingTranslation && existingTranslation !== entry.original && existingTranslation !== entry.original.trim()) {
      protectedSet.add(key);
    }
  }
}
```

`hasArabicPresentationForms` مستوردة بالفعل في الملف (سطر 3).

### 2. تعديل `useEditorFileIO.ts` - اضافة دعم الفلتر

**تغيير الواجهة (Interface):**
```text
interface UseEditorFileIOProps {
  state: EditorState | null;
  setState: ...;
  setLastSaved: ...;
  filteredEntries: ExtractedEntry[];  // جديد
  filterLabel: string;               // جديد - اسم الفلتر النشط
}
```

**تصدير JSON مفلتر (`handleExportTranslations`):**
- اذا `filteredEntries` اقل من كل الـ entries (يعني فلتر نشط)، يصدّر فقط مفاتيح النصوص المفلترة
- اسم الملف يتضمن اسم الفلتر: `translations_menus_2026-02-16.json`

**استيراد JSON مفلتر (`handleImportTranslations`):**
- اذا فلتر نشط، يطبّق فقط الترجمات التي مفاتيحها تنتمي للنصوص المفلترة

**تصدير CSV مفلتر (`handleExportCSV`):**
- يستخدم `filteredEntries` بدل `state.entries` عند وجود فلتر

**استيراد CSV مفلتر (`handleImportCSV`):**
- نفس منطق JSON - يفلتر التحديثات حسب المفاتيح المسموحة

### 3. تعديل `useEditorState.ts` - تمرير المعاملات الجديدة

```text
const fileIO = useEditorFileIO({
  state, setState, setLastSaved,
  filteredEntries,
  filterLabel: filterCategory !== "all" ? filterCategory
             : filterFile !== "all" ? filterFile
             : "",
});
```

### 4. تعديل `Editor.tsx` - تحديث نصوص الازرار

عند وجود فلتر نشط، الازرار تعرض اسم الفلتر:
- "تصدير JSON (القوائم)" بدل "تصدير JSON"
- "استيراد JSON (القوائم)" بدل "استيراد JSON"

### الملفات المعدلة
- `src/hooks/useEditorState.ts` - اصلاح الحماية + تمرير filteredEntries
- `src/hooks/useEditorFileIO.ts` - منطق الفلترة في التصدير/الاستيراد
- `src/pages/Editor.tsx` - تحديث نصوص الازرار

