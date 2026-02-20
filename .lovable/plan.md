
## تشخيص المشكلة

الـ Edge Function `font-proxy` تعمل بشكل مثالي — أثبت الاختبار المباشر أنها ترجع ملف الخط كاملاً (123,768 bytes). 

المشكلة في **كيف يستقبل `ModPackager.tsx` الرد**:

```
supabase.functions.invoke("font-proxy", {...})
```

هذه الدالة تتوقع ردًا بصيغة JSON. عندما ترجع الـ Edge Function بيانات ثنائية (`application/octet-stream`)، تحاول `invoke()` تحليلها كـ JSON وتفشل، مما يجعل `responseData` يكون `null` أو غير صالح — ولهذا لا يعمل الشرط:

```typescript
if (responseData instanceof ArrayBuffer && responseData.byteLength > 0) {
  // لا يُنفَّذ أبدًا لأن responseData ليس ArrayBuffer
}
```

## الحل

استبدال `supabase.functions.invoke()` بـ `fetch()` مباشرة إلى URL الـ Edge Function، مع قراءة الرد كـ `arrayBuffer()`:

```typescript
const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const edgeFunctionUrl = `https://${projectId}.supabase.co/functions/v1/font-proxy`;

const response = await fetch(edgeFunctionUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fontUrl: url }),
});

if (response.ok) {
  data = await response.arrayBuffer();
  break;
}
```

## التغييرات المطلوبة

### `src/pages/ModPackager.tsx`

تعديل دالة `handleDownloadNotoFont`:
- حذف استخدام `supabase.functions.invoke()`
- استبدالها بـ `fetch()` مباشرة إلى URL الـ Edge Function
- قراءة الرد بـ `.arrayBuffer()` بشكل صحيح
- إضافة رسالة حالة أثناء التحميل لإعلام المستخدم بالتقدم

### لماذا هذا أفضل؟

| الطريقة | المشكلة |
|---------|---------|
| `supabase.functions.invoke()` | تتوقع JSON، تفشل مع البيانات الثنائية |
| `fetch()` مباشرة | تعطي تحكماً كاملاً في نوع الرد، تقرأ `arrayBuffer()` بشكل صحيح |

### تحسينات إضافية
- إضافة رسالة "جاري تحميل الخط..." أثناء التحميل
- تحسين رسالة الخطأ لتشير إلى أن الـ Edge Function نفسها تعمل وأن المشكلة مؤقتة
