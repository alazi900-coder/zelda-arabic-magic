

# بناء محلل BDAT V2 الثنائي لزينوبليد كرونيكلز 3

## ملخص
بناء محلل ثنائي كامل لملفات BDAT V2 يعمل في المتصفح مباشرة، بحيث يمكن رفع ملفات `.bdat` الخام بدون الحاجة لتحويلها لـ JSON عبر أدوات خارجية. يشمل المحلل (Parser)، مُعيد البناء (Writer)، وقاموس فك الهاشات.

## الملفات الجديدة

### 1. `src/lib/bdat-parser.ts` -- محلل BDAT الثنائي

يقرأ ملف BDAT ثنائي ويستخرج الجداول والنصوص:

```text
هيكل الملف:
File Header:
  [4 bytes] Magic: "BDAT"
  ...
  Table Count, File Size, Table Offsets

Table Header (لكل جدول):
  0x00: Magic "BDAT"
  0x08: Name Offset (اسم الجدول في string table)
  0x10: Row Count
  0x20: String Table Offset (من بداية الجدول)
  0x24: String Table Size
  + Column Definitions (نوع كل عمود + offset)
  + Row Data
  + String Table (UTF-8 null-terminated)
```

الدوال الرئيسية:
- `parseBdatFile(data: Uint8Array): BdatFile` -- يقرأ الملف ويعيد كل الجداول
- `BdatTable` -- اسم الجدول، الاعمدة، الصفوف، string table الخام
- `BdatColumn` -- النوع (string/int/float/hash)، الاسم، الـ offset داخل الصف
- استخراج النصوص من الاعمدة ذات النوع `String` عبر قراءة الـ offset من الصف ثم الذهاب لـ string table

### 2. `src/lib/bdat-writer.ts` -- مُعيد بناء BDAT

يعيد بناء ملف BDAT ثنائي بعد تعديل النصوص:
- يبني string table جديد كليا بالنصوص العربية المعالجة (reshaped + reversed)
- يحدّث مؤشرات النصوص (string offsets) في صفوف البيانات لتشير للمواقع الجديدة
- يحدّث قيم String Table Size و File Size في الترويسة
- يحافظ على كل البيانات غير النصية (ارقام، هاشات) كما هي

```text
تدفق اعادة البناء:
1. نسخ Table Header الاصلي
2. نسخ Column Definitions كما هي
3. لكل صف:
   - نسخ البيانات غير النصية كما هي
   - لكل عمود نصي: كتابة offset جديد يشير لموقع النص في الـ string table الجديد
4. بناء string table جديد:
   - كتابة كل النصوص (الاصلية او المترجمة) كـ UTF-8 null-terminated
5. تحديث 0x20 (String Table Offset) و 0x24 (String Table Size) في الترويسة
6. تحديث حجم الملف الكلي
```

### 3. `src/lib/bdat-hash-dictionary.ts` -- قاموس فك التشفير

- دالة `murmur3_32(key: string, seed?: number): number` -- حساب هاش Murmur3
- قاموس `KNOWN_HASHES: Map<number, string>` يحتوي اسماء الجداول والاعمدة الشائعة في XC3
- دالة `unhashLabel(hash: number): string` -- تعيد الاسم القابل للقراءة او الهاش كـ hex
- الاسماء تشمل: FLD_NpcList, BTL_Arts, MNU_Msg, name, caption, text, message, وغيرها

### 4. تعديل `src/pages/XenobladeProcess.tsx`

- اضافة قبول ملفات `.bdat` الثنائية (بالاضافة لـ .msbt و .json الحالية)
- عند رفع ملف .bdat: معالجته محليا في المتصفح باستخدام `bdat-parser.ts`
- عرض معلومات الملف: عدد الجداول، عدد الصفوف، عدد النصوص القابلة للترجمة
- تخزين البيانات الثنائية الاصلية في IndexedDB لاعادة البناء عند التصدير
- ازالة تعليمات التحويل عبر bdat-toolset (لم نعد نحتاجها)

### 5. تعديل `src/hooks/useEditorBuild.ts`

- عند التصدير (Build): استخدام `bdat-writer.ts` محليا في المتصفح
- قراءة ملفات BDAT الاصلية من IndexedDB
- تطبيق الترجمات + المعالجة العربية (reshape + bidi reverse)
- بناء string table جديد وتحديث الـ offsets
- تحميل ملفات `.bdat` المعدّلة في ZIP

### 6. تعديل `supabase/functions/arabize-xenoblade/index.ts`

- اضافة دعم استقبال ملفات `.bdat` الثنائية في وضع extract و build
- نسخ نفس منطق المحلل والكاتب للخادم (لدعم المعالجة السحابية كخيار بديل)

### 7. تحديث `.lovable/plan.md`

خطة المراحل القادمة بعد اكتمال محلل BDAT.

## القسم التقني

### انواع اعمدة BDAT:

| النوع | الحجم | ملاحظات |
|---|---|---|
| u8/i8 | 1 byte | عدد صحيح |
| u16/i16 | 2 bytes | عدد صحيح LE |
| u32/i32 | 4 bytes | عدد صحيح LE |
| String | 4 bytes | offset في string table (UTF-8 null-terminated) |
| Float | 4 bytes | f32 LE |
| HashRef | 4 bytes | murmur3 hash |

### استراتيجية الحقن (Injection Strategy):

بدلا من الاستبدال المباشر (in-place) الذي يحد من طول النص:
1. بناء string table جديد كليا
2. اضافة النصوص العربية المعالجة اليه
3. تحديث مؤشرات النصوص في كل صف بيانات
4. تحديث String Table Size و File Size في الترويسة

### المعالجة العربية (RTL Fix):

المشروع يحتوي بالفعل على مكتبة `arabic-processing.ts` تقوم بـ:
- `reshapeArabic()` -- تحويل الحروف لاشكالها المتصلة (presentation forms)
- `reverseBidi()` -- قلب ترتيب الحروف لمحرك LTR
- `convertToArabicNumerals()` -- تحويل الارقام
- `mirrorPunctuation()` -- قلب علامات الترقيم

هذه الدوال ستُستخدم مباشرة قبل حقن النص في string table.

### تدفق المعالجة الكامل:

```text
ملف .bdat (ثنائي)
    |
    v
bdat-parser.ts (في المتصفح)
    |-- قراءة File Header + Table Offsets
    |-- لكل جدول: قراءة Table Header
    |-- قراءة Column Definitions (تحديد اعمدة النصوص)
    |-- قراءة Row Data + استخراج string offsets
    |-- قراءة String Table + استخراج النصوص
    |-- فك اسماء الجداول/الاعمدة عبر Hash Dictionary
    |
    v
المحرر (Editor) -- ترجمة النصوص
    |
    v
bdat-writer.ts (في المتصفح)
    |-- بناء String Table جديد بالنصوص المعالجة
    |-- تحديث string offsets في Row Data
    |-- تحديث String Table Offset + Size في Table Header
    |-- تحديث File Size
    |
    v
ملف .bdat معرّب (تحميل مباشر)
```

### ملفات جديدة (3):
| الملف | المحتوى |
|---|---|
| `src/lib/bdat-parser.ts` | محلل BDAT الثنائي مع دعم V2 |
| `src/lib/bdat-writer.ts` | مُعيد بناء BDAT مع string table جديد |
| `src/lib/bdat-hash-dictionary.ts` | Murmur3 + قاموس اسماء XC3 |

### ملفات معدّلة (4):
| الملف | التغيير |
|---|---|
| `src/pages/XenobladeProcess.tsx` | قبول ملفات .bdat الثنائية + معالجة محلية |
| `src/hooks/useEditorBuild.ts` | تصدير BDAT محليا باستخدام bdat-writer |
| `supabase/functions/arabize-xenoblade/index.ts` | دعم BDAT الثنائي في الخادم |
| `.lovable/plan.md` | تحديث خطة المراحل القادمة |

