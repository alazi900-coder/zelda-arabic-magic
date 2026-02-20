
# خطة التنظيف الشامل للكود

## ما سيتم تنفيذه

### 1. حذف `ZeldaDialoguePreview.tsx`
الملف موجود في `src/components/ZeldaDialoguePreview.tsx` ولا يُستدعى من أي مكان في الكود — تحقق من البحث: صفر نتائج خارج الملف نفسه. سيُحذف بالكامل.

### 2. تنظيف `useEditorState.ts`

**أ. إزالة الاستيراد الميت (سطر 7):**
```
import { utf16leByteLength } from "@/lib/byte-utils";
```
هذا الاستيراد لم يعد يُستخدم في الملف بعد التحويل لـ `TextEncoder`. يُحذف.

**ب. تصحيح القيمة الافتراضية لـ `gameType` (سطر 21):**
```ts
// قبل:
const [gameType, setGameType] = useState<string>("zelda");
// بعد:
const [gameType, setGameType] = useState<string>("xenoblade");
```
المشروع مخصص حصرياً لـ Xenoblade Chronicles 3، و`"zelda"` كانت الافتراضية القديمة.

**ج. حذف الحالات الميتة الثلاث (أسطر 33-35):**
```ts
const [technicalEditingMode, setTechnicalEditingMode] = useState<string | null>(null);
const [showPreview, setShowPreview] = useState(false);
const [previewKey, setPreviewKey] = useState<string | null>(null);
```
تم التحقق: لا يوجد أي استخدام لهذه المتغيرات في `Editor.tsx` أو أي صفحة أخرى.

**د. حذف `categoryCounts` useMemo (أسطر 322-332):**
```ts
const categoryCounts = useMemo(() => { ... }, [state?.entries]);
```
يُحسَب ولكن لا يُصدَّر ولا يُستخدم داخل الهوك نفسه — هدر خالص.

**هـ. إزالة من قائمة الـ return (أسطر 993 و1012):**
- حذف `technicalEditingMode, showPreview, previewKey,` من كتلة الـ state المُصدَّرة (سطر 993)
- حذف `setShowPreview, setPreviewKey,` من كتلة الـ setters المُصدَّرة (سطر 1012)

### 3. تنظيف `Editor.tsx` (سطر 53)
```ts
// قبل:
const gameType = editor.gameType || "xenoblade";
// بعد:
const gameType = "xenoblade";
```
بما أن `gameType` صار دائماً `"xenoblade"` من المصدر، هذا السطر يبسَّط لثابت.

### 4. إزالة `getUntranslatedCount` من `useEditorFileIO.ts` (سطر 289)
```ts
const getUntranslatedCount = () => getUntranslatedGrouped().totalCount;
```
هذه الدالة معرَّفة لكنها لا تُستدعى ولا تُصدَّر من الهوك — كود ميت.

### 5. تحديث بيانات الديمو القديمة في `useEditorState.ts` (أسطر 250-285)
بيانات الديمو الأصلية (عند عدم وجود ملف محفوظ) تستخدم أنماط زيلدا:
- `msbtFile: "ActorMsg/Link.msbt"` ← Zelda
- `msbtFile: "LayoutMsg/Common.msbt"` ← Zelda
- شخصيات زيلدا: Hyrule, Link, Impa

هذه الأنماط مربكة لأن المستخدم يشاهدها عند أول تشغيل. ستُستبدل ببيانات ديمو مطابقة لـ Xenoblade (مثل `loadDemoBdatData`) أو ستُوجَّه مباشرة لـ `loadDemoBdatData`.

> **ملاحظة**: `byte-utils.ts` يبقى كما هو — مكتبة مرجعية، لن يُحذف.

---

## ترتيب التنفيذ

```text
1. حذف src/components/ZeldaDialoguePreview.tsx
2. useEditorState.ts:
   - حذف import utf16leByteLength
   - تغيير gameType default → "xenoblade"
   - حذف technicalEditingMode + showPreview + previewKey states
   - حذف categoryCounts useMemo
   - حذفها من قائمة return
   - تبسيط بيانات الديمو
3. Editor.tsx: تبسيط سطر gameType
4. useEditorFileIO.ts: حذف getUntranslatedCount
```

## ما لن يتغير
- منطق `byte-utils.ts` — يبقى كمرجع
- منطق القاموس والترجمة — يعمل بشكل صحيح
- `reviewing` و `setReviewing` — يُستخدمان فعلياً في `Editor.tsx` (سطر 582)
- `isFilterActive` — يُستخدم في `useEditorFileIO.ts`
