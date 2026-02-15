

# اصلاح ثغرة تحويل العلامات التقنية بين الاستخراج والبناء

## الوضع الحالي

النظام يطبّق بالفعل 95% مما اقترحه ChatGPT:
- استخراج أكواد التحكم (0x0E) وتخزين البايتات الخام
- عرض نص نظيف مع شارات ملوّنة
- إعادة الحقن عند البناء
- التحقق من الحجم والحفاظ على الهيكل

## المشكلة الفعلية

في مرحلة الاستخراج (extract mode)، يتم تحويل علامات PUA (`\uE000+`) الى علامات العرض (`\uFFF9`, `\uFFFA`, `\uFFFB`). لكن في مرحلة البناء (build mode)، السطر 597 يبحث فقط عن `\uFFFC`:

```text
translationText = translationText.replace(/\uFFFC/g, () => { ... });
```

اذا كانت الترجمة تحتوي على `\uFFF9` او `\uFFFA` او `\uFFFB` (مثلا نصوص تم اكتشافها تلقائيا كمعربة واستُخدم النص الاصلي كترجمة)، لن يتم تحويلها الى PUA markers وستبقى في الملف النهائي كما هي - مما قد يسبب خلل.

## الحل

### تعديل واحد في `supabase/functions/arabize/index.ts`

توسيع regex تحويل العلامات في build mode ليشمل جميع انواع العلامات:

```typescript
// بدلا من:
translationText = translationText.replace(/\uFFFC/g, () => { ... });

// يصبح:
translationText = translationText.replace(/[\uFFF9\uFFFA\uFFFB\uFFFC]/g, () => {
  if (tagIdx < entries[i].tags.length) {
    return String.fromCharCode(entries[i].tags[tagIdx++].markerCode);
  }
  return '';
});
```

### ملخص
- تعديل ملف واحد فقط: `supabase/functions/arabize/index.ts` (سطر 597)
- لا حاجة لاعادة بناء النظام من الصفر
- النظام الحالي قوي ومتكامل، ويحتاج فقط لهذا الاصلاح البسيط

