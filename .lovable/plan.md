

# خطة تحديث نظام التصنيف الذكي بناءً على أسماء الأعمدة

## ملخص التغييرات

سيتم تطوير نظام التصنيف ليعتمد على **أسماء الأعمدة** (Column Names) بالإضافة إلى بادئات الجداول، مع إضافة ميزة البحث داخل فئة محددة وإخفاء الجداول التي لا تحتوي على نصوص قابلة للترجمة.

---

## التغييرات المطلوبة

### 1. تحديث دالة التصنيف (`src/components/editor/types.tsx`)

تعديل `categorizeBdatTable` لتفحص اسم العمود (الجزء بعد النقطة في Label) كخطوة ثانية إذا لم يتطابق اسم الجدول مع أي بادئة معروفة:

**قواعد الكلمات المفتاحية للأعمدة:**

| الفئة | كلمات مفتاحية في اسم العمود |
|---|---|
| القوائم والواجهة | Window, Btn, Caption, Title, Dialog, Label, Layout, Menu |
| المهام والقصص | Task, Purpose, Summary, Quest, Event, Scenario, After, Client, Talk |
| المواقع والمستعمرات | Landmark, Spot, Colony, Area, Map, Place, Field |
| الأدوات والقتال | Skill, Price, Armor, Weapon, Description, Pouch, Gem, Art |
| الإعدادات | Voice, Audio, Config, Option, Setting, Display |

**المنطق:** يتم فحص اسم الجدول اولاً (النظام الحالي)، وإذا كانت النتيجة "other"، يتم فحص اسم العمود بالكلمات المفتاحية أعلاه.

### 2. إضافة فئة "إعدادات الصوت والعرض" (`src/components/editor/types.tsx`)

اضافة فئة جديدة `bdat-settings` لتغطية أعمدة الإعدادات (Voice, Audio, Config, Option, Setting, Display) مع أيقونة `SlidersHorizontal`.

### 3. ميزة البحث داخل فئة محددة (`src/hooks/useEditorState.ts`)

هذه الميزة **موجودة بالفعل** -- عند اختيار فئة من شريط الفلاتر ثم كتابة نص في خانة البحث، يتم تصفية النتائج داخل تلك الفئة فقط. لا حاجة لتغيير إضافي هنا، لكن سأتأكد من وضوح التكامل بين فلتر الفئة وخانة البحث.

### 4. إخفاء الجداول بدون نصوص قابلة للقراءة

هذا يحدث تلقائياً في المحلل (Parser) -- فقط الأعمدة من نوع `String` أو `DebugString` يتم استخراجها كمدخلات. الجداول التي تحتوي فقط على بيانات رقمية لا تظهر أصلاً في المحرر.

---

## التفاصيل التقنية

### الملف: `src/components/editor/types.tsx`

```text
التغييرات:
1. إضافة فئة bdat-settings إلى BDAT_CATEGORIES
2. تعديل categorizeBdatTable لتستقبل label كاملاً بدل اسم الجدول فقط
3. إضافة دالة categorizeByColumnName كخطوة ثانية
```

**الدالة المحدثة:**

```typescript
function categorizeByColumnName(columnName: string): string | null {
  const col = columnName.toLowerCase();
  // القوائم والواجهة
  if (/window|btn|caption|title|dialog|label|layout|menu/i.test(col)) return "bdat-menu";
  // المهام والقصص
  if (/task|purpose|summary|quest|event|scenario|after|client|talk/i.test(col)) return "bdat-quest";
  // المواقع
  if (/landmark|spot|colony|area|map|place|field/i.test(col)) return "bdat-field";
  // الأدوات والقتال
  if (/skill|price|armor|weapon|description|pouch|gem|art/i.test(col)) return "bdat-item";
  // الإعدادات
  if (/voice|audio|config|option|setting|display/i.test(col)) return "bdat-settings";
  return null;
}
```

### الملف: `src/components/editor/CategoryProgress.tsx`

```text
إضافة أيقونة SlidersHorizontal للفئة الجديدة bdat-settings
```

### ملفات لا تحتاج تعديل

- `src/hooks/useEditorState.ts` -- البحث داخل الفئات يعمل بالفعل
- `src/lib/bdat-parser.ts` -- إخفاء الجداول الثنائية يحدث تلقائياً
- `src/lib/arabic-processing.ts` -- معالجة النصوص العربية (reshaping + bidi) تعمل بالفعل على كل النصوص بما فيها متعددة الأسطر

