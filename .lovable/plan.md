
# Schema Inspector مدمج في صفحة /process

## الفهم الكامل للبنية الحالية

بعد قراءة الكود، الوضع الحالي في `/process` هو:
- `parseBdatFile()` → يحلل الملف الثنائي إلى `BdatFile` (جداول + أعمدة + صفوف)
- `extractBdatStrings()` → يستخرج فقط النصوص للمحرر
- النتيجة تُخزن في IndexedDB وينتقل المستخدم للمحرر

المطلوب: إضافة `inspectBdatSchema()` يعمل على نفس `BdatFile` ويُنتج تقريراً يُعرض في تبويب داخل بطاقة النتائج.

---

## الملفات التي ستتغير

| الملف | نوع التغيير |
|-------|-------------|
| `src/lib/bdat-schema-inspector.ts` | ملف جديد كامل |
| `src/pages/XenobladeProcess.tsx` | إضافة استدعاء Inspector + واجهة تبويبات |

لا يتغير: `bdat-parser.ts`، `bdat-writer.ts`، المحرر، edge functions.

---

## 1. ملف جديد: `src/lib/bdat-schema-inspector.ts`

### الواجهات (Interfaces)

```typescript
interface InspectorOptions {
  include_samples?: boolean       // default: false
  sample_per_field?: number       // 1-10, default: 3
  sample_mask_mode?: "prefix5" | "statsOnly"
  max_records_for_full_scan?: number  // default: 5000
  sample_record_cap?: number      // default: 1000
}

interface BdatFieldSchema {
  field_name: string
  data_type: "string" | "int" | "float" | "bool" | "hash" | "other"
  translate: boolean
  translate_reason: string[]      // سبب القرار (للشفافية)
  record_count: number
  max_chars: number
  avg_chars: number
  max_utf8_bytes: number          // مهم لنينتندو (عربي = 2 بايت/حرف)
  avg_utf8_bytes: number
  multiline: boolean
  duplicate_ratio: number         // 0.0-1.0
  allowed_tags: string[]
  tag_counts: Record<string, number>
  samples?: string[]              // masked فقط
  notes?: string
}

interface BdatTableSchema {
  table: string
  primary_key: string | null
  translatable_count: number
  fields: BdatFieldSchema[]
}

interface BdatSchemaReport {
  file: string
  generated_at: string
  table_count: number
  translatable_tables: number
  all_discovered_tags: string[]
  safety_contract: string[]
  tables: BdatTableSchema[]
}
```

### منطق القرار: هل الحقل قابل للترجمة؟

قرار محافظ متعدد المراحل:

**شروط الاستبعاد المطلق (translate=false دائماً):**
- نوع الحقل ليس `String (7)` أو `DebugString (11)` → false فوراً
- اسم العمود يحتوي: `_id`, `_key`, `hash`, `ref`, `index`, `idx`, `ptr`, `guid`, `uuid`, `crc`, `offset`, `count`, `size`, `flag`, `type` → false

**شروط التفعيل (translate=true):**
- اسم الجدول ينتهي بـ `_ms` → true (أولوية قصوى)
- اسم الحقل يطابق allowlist: `name`, `title`, `desc`, `description`, `text`, `help`, `caption`, `label`, `message`, `msg`, `hint`, `detail`, `note`, `tooltip`, `caption`

**فلاتر إضافية (تحذير وليس منع إذا كان الجدول `_ms`):**
- avg_chars < 3 → false (إلا إذا الجدول `_ms`)

**translate_reason:** يُسجل سبب القرار بدقة لمساعدة المستخدم على الفهم.

### منطق اكتشاف الأكواد (Tags)

```typescript
// Regex patterns
const TAG_PATTERNS = [
  /<color[^>]*>/gi,
  /<br\s*\/?>/gi,
  /<item[^>]*>/gi,
  /<voice[^>]*>/gi,
  /<target[^>]*>/gi,
  /<[^>]{1,24}>/g,   // generic fallback
];

// Unicode control ranges
const hasUnicodeControl = (text: string) =>
  /[\uFFF9-\uFFFC\uE000-\uF8FF]/.test(text);
```

يجمع `allowed_tags` فريدة + `tag_counts` لكل حقل.

### حساب max_utf8_bytes

العربي يحتاج 2 بايت في UTF-8، الإنجليزي 1 بايت:
```typescript
function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}
```
هذا ضروري لأن اللعبة تخصص مساحة محددة لكل نص.

### نظام Sampling لتوفير الموارد

إذا كان عدد الصفوف > `sample_record_cap` (1000):
- يأخذ عينة عشوائية موزعة (أول، وسط، آخر)
- يحسب الإحصاءات من العينة
- يُشير في `notes` أن الإحصاءات تقريبية

### Masking للعينات

```typescript
function maskSample(text: string): string {
  const prefix = [...text].slice(0, 5).join('');
  return prefix + "***";
}
```
لا يُعرض النص الكامل أبداً.

### قواعد السلامة الثابتة (Safety Contract)

```typescript
const SAFETY_CONTRACT = [
  "لا تغيّر ترتيب الصفوف أو عددها داخل BDAT",
  "لا تغيّر IDs أو الحقول غير القابلة للترجمة (translate=false)",
  "لا تحذف الوسوم الموجودة — اعتبرها محفوظة",
  "لا تُضِف وسوماً خارج allowed_tags لكل حقل",
  "لا تتجاوز max_utf8_bytes لكل نص",
  "لا تُضِف أسطراً جديدة إذا كان multiline=false",
];
```

---

## 2. تعديل `src/pages/XenobladeProcess.tsx`

### أ) State جديد

```typescript
const [schemaReports, setSchemaReports] = useState<BdatSchemaReport[]>([]);
const [schemaTab, setSchemaTab] = useState<"summary" | "tables">("summary");
const [selectedTable, setSelectedTable] = useState<string | null>(null);
```

### ب) توليد Schema في حلقة BDAT (السطر 100)

بعد `parseBdatFile` مباشرة، قبل `extractBdatStrings`:

```typescript
const bdatFile = parseBdatFile(data, unhashLabel);
// ← جديد
const { inspectBdatSchema } = await import("@/lib/bdat-schema-inspector");
const schema = inspectBdatSchema(bdatFile, file.name, {
  include_samples: false,
  sample_mask_mode: "statsOnly",
  max_records_for_full_scan: 5000,
  sample_record_cap: 1000,
});
schemaReportsAccumulator.push(schema);
// ← نهاية الجديد
const strings = extractBdatStrings(bdatFile, file.name);
```

### ج) واجهة النتائج (stage === "done")

تُضاف بطاقة Schema بعد بطاقة سجل العمليات، وقبل زر "انتقل إلى المحرر":

**تبويب الملخص (Summary):**
- عدد الجداول الكلي + الجداول القابلة للترجمة
- أكواد التحكم المكتشفة (chips)
- قواعد السلامة كقائمة مرقمة
- زر "تفعيل العينات" (يُعيد التحليل مع `include_samples: true`)

**تبويب الجداول (Tables):**
- قائمة بأسماء الجداول مع badge يُظهر عدد الحقول القابلة للترجمة
- عند الضغط: جدول يعرض:
  - اسم الحقل
  - badge أخضر/رمادي للترجمة
  - max_chars / max_utf8_bytes
  - multiline
  - allowed_tags
  - record_count
  - عينة مموهة (إن فُعّلت)

**زر تصدير Schema JSON:**

```typescript
const exportSchema = () => {
  const payload = {
    meta: {
      game: "Xenoblade Chronicles 3",
      generated_at: new Date().toISOString(),
      tool: "XC3 BDAT Schema Inspector v1"
    },
    reports: schemaReports
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bdat-schema-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

---

## تدفق المستخدم بعد التعديل

```text
رفع menu.bdat
      ↓
parseBdatFile()        → للمحرر (كما هو)
inspectBdatSchema()    → للـ Schema (جديد)
      ↓
stage === "done"
      ↓
┌──────────────────────────────────────┐
│  ✅ 1,240 نص مستخرج للمحرر          │
│                                      │
│  📊 Schema BDAT ─────────────────── │
│  [ملخص] [الجداول]                   │
│                                      │
│  ملخص:                               │
│   8 جداول | 3 قابلة للترجمة         │
│   أكواد: <br> <color> <item>         │
│   قواعد السلامة: ①②③④⑤⑥           │
│                                      │
│  [تصدير Schema JSON]                 │
└──────────────────────────────────────┘
      ↓
[انتقل إلى المحرر →]
```

---

## ملاحظة من Manus مُطبَّقة

ملاحظة Manus الأولى حول `max_utf8_bytes` تُطبَّق: نستخدم `TextEncoder().encode(str).length` وليس `str.length * 2`. هذا يعطي الحجم الحقيقي لأن العربي يأخذ 2 بايت في UTF-8.

ملاحظة Manus الثانية حول الـ Regex: نضيف فحص Unicode `[\uFFF9-\uFFFC\uE000-\uF8FF]` بجانب الـ `<tag>` العادية.

ملاحظة Manus الثالثة: شرط `avg_chars < 3` يصبح تحذيراً (يُضاف في `notes`) وليس رفضاً إذا كان الجدول `_ms`.
