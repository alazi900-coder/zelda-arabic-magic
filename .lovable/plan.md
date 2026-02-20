
# Byte-Patch Mode for BDAT Writer

## المشكلة الحالية

الكاتب الحالي يعيد بناء جدول النصوص بالكامل مما يغير حجمه:
- النص العربي أطول بكثير من الإنجليزي في UTF-8
- تتغير مؤشرات (Offsets) داخل الجدول
- محرك اللعبة يتوقع أحجاماً ثابتة → تنهار كل المؤشرات → نصوص مفقودة

## الحل: Byte-Patch Mode

بدلاً من إعادة بناء الجدول، نكتب مباشرة فوق البايتات في مكانها الأصلي:

```text
[Header - لا يُمَس]
[Column Defs - لا يُمَس]  
[Row Data - لا يُمَس (المؤشرات تبقى كما هي)]
[String Table - نكتب النص الجديد في نفس الموقع + نملأ الباقي بـ 0x00]
```

## القواعد الصارمة

1. **لا تغيير في الحجم الكلي للملف** — الـ Buffer يبقى نفسه بالضبط
2. **لا تغيير في المؤشرات** — Row Data لا يُلمَس إطلاقاً
3. **لا تغيير في عدد الصفوف أو الأعمدة**
4. **الكتابة فقط عند الـ Offset الأصلي للنص** في String Table
5. **Padding بـ 0x00** لملء المساحة المتبقية إذا كان النص الجديد أقصر
6. **Block عند التجاوز**: إذا كان UTF-8 byte length للترجمة > الحجم الأصلي للنص → نتوقف ولا نكتب (نبلّغ المستخدم)
7. **Tag sequences محمية**: لا تُمَس أبداً

## الملفات التي ستتغير

### 1. `src/lib/bdat-writer.ts` (إعادة كتابة كاملة)

```typescript
export function patchBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>
): { result: Uint8Array; overflowErrors: OverflowError[] }
```

- **إنشاء نسخة طبق الأصل** من الملف الأصلي أولاً (`result = originalData.slice()`)
- لكل ترجمة: حساب موقع النص في String Table
- **قياس الحجم الأصلي** للنص الحالي (عدد بايتاته + null terminator)
- إذا كان UTF-8 bytes للترجمة > الحجم الأصلي → تسجيل خطأ overflow، تخطّي
- إذا كان مناسب → كتابة bytes الترجمة في نفس الموضع
- ملء الباقي بـ 0x00 حتى نهاية المساحة الأصلية

```typescript
interface OverflowError {
  key: string;
  originalBytes: number;
  translationBytes: number;
}
```

### 2. `src/hooks/useEditorBuild.ts`

- استبدال `rebuildBdatFile` بـ `patchBdatFile`
- جمع `overflowErrors` من كل ملف
- عرض تحذيرات واضحة في الـ UI عن النصوص التي تجاوزت الحد وتم تخطيها

### 3. `src/lib/bdat-parser.ts` (تعديل طفيف)

إضافة دالة مساعدة `getStringByteSize(tableData, stringTableOffset, strOffset)` تحسب حجم النص الأصلي بالبايت (من الـ offset حتى null terminator).

## مثال توضيحي

```text
String Table في الملف الأصلي (الـ offset = 0x1A0):
  offset 0x10: "Attack" = 41 74 74 61 63 6B 00  (7 bytes: 6 + null)

ترجمة: "هجوم" = E8 AC 87 E9 87 8 8 00  (5 bytes عربية + null = 9 bytes)
→ 9 > 7 → OVERFLOW → skip, تسجيل تحذير

ترجمة: "هجم" = E9 87 8 8 00  (4 bytes + null = 5 bytes)
→ 5 ≤ 7 → كتابة: E9 87 8 8 00 00 00  (النص + padding)
```

## التأثير على الـ Editor

- **تحذير ناعم في المحرر**: حقول تتجاوز الحجم الأصلي ستظهر بلون مختلف وتحذير "سيتم تخطي هذا النص في البناء"
- **تقرير بعد البناء**: يظهر عدد النصوص التي طُبِّقَت vs عدد التي تجاوزت الحد

## التسلسل التقني

```
parseBdatFile() → قراءة الملف الأصلي كاملاً
    ↓
للكل نص: حساب original_byte_size من String Table
    ↓
للكل ترجمة: قياس utf8_size
    ↓
utf8_size ≤ original_byte_size → patch مباشرة في البايتات
utf8_size > original_byte_size → تسجيل overflow، تخطّي
    ↓
الملف الناتج = نفس حجم الأصل تماماً، مؤشرات سليمة 100%
```

## ماذا يحدث مع النصوص الأطول من الأصل؟

هذا هو القيد الأساسي لـ Byte-Patch Mode. الحلول المتاحة للمستخدم:
1. **تقصير الترجمة** حتى تناسب الحجم
2. **استخدام اختصارات** (مثل "هج" بدلاً من "هجوم")
3. **قبول أن النص يُتخطى** والاعتماد على الترجمات المناسبة الحجم فقط

هذه هي المقايضة الصحيحة: **استقرار اللعبة أهم من اكتمال الترجمة**.
