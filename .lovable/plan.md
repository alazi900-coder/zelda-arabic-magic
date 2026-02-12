
## تنفيذ الحل الجذري لضغط Zstandard مع القاموس

### المشكلة الأساسية
ملفات Zelda مضغوطة باستخدام **Zstandard مع قاموس (Dictionary)**. المكتبة الحالية `jsr:@yu7400ki/zstd-wasm` توفر فقط `compress` و `decompress` بدون دعم القاموس، مما يسبب فشل فك الضغط بخطأ "Unknown error" (code -32).

### التغييرات المطلوبة

#### 1. تحديث المكتبة والاستيرادات (الأسطر 1-2)
**من:**
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { compress, decompress } from "jsr:@yu7400ki/zstd-wasm";
```

**إلى:**
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  init,
  createDCtx,
  decompressUsingDict,
  createCCtx,
  compressUsingDict,
  decompress,
  compress,
} from "https://deno.land/x/zstd_wasm@0.0.21/deno/zstd.ts";

// Initialize WASM module
await init();
```

**السبب:** المكتبة الجديدة من `deno.land/x/zstd_wasm` توفر الدوال الكاملة:
- `decompressUsingDict(dctx, buffer, dict)` -- فك ضغط بالقاموس
- `compressUsingDict(cctx, buffer, dict, level)` -- ضغط بالقاموس
- `createDCtx()` / `createCCtx()` -- إنشاء سياقات الضغط

#### 2. معالجة ملف القاموس (الأسطر 298-312)
**قبل** (معالجة غير صحيحة):
```typescript
try {
  console.log(`Decompressing language file (${langData.length} bytes)...`);
  sarcData = await decompress(langData);
  console.log(`Decompressed successfully: ${sarcData.length} bytes`);
} catch (e) {
  // خطأ ...
}
```

**بعد** (معالجة صحيحة مع القاموس):
```typescript
try {
  // Step 1: Decompress dictionary file
  console.log(`Decompressing dictionary file (${dictData.length} bytes)...`);
  let rawDict: Uint8Array;
  try {
    // Dictionary file itself may be Zstandard compressed
    rawDict = await decompress(dictData);
    console.log(`Dictionary decompressed: ${dictData.length} -> ${rawDict.length} bytes`);
  } catch {
    // If decompression fails, assume it's already raw
    rawDict = dictData;
    console.log(`Dictionary is raw format: ${rawDict.length} bytes`);
  }

  // Step 2: Decompress language file using dictionary
  console.log(`Decompressing language file (${langData.length} bytes) with dictionary...`);
  const dctx = createDCtx();
  sarcData = await decompressUsingDict(dctx, langData, rawDict);
  console.log(`Decompressed successfully: ${langData.length} -> ${sarcData.length} bytes`);
} catch (e) {
  const error = e instanceof Error ? e.message : 'Unknown error';
  console.error(`Decompression with dictionary failed: ${error}`);
  return new Response(
    JSON.stringify({ 
      error: `فشل فك الضغط مع القاموس: ${error}`,
      hint: 'تأكد من أن الملف مضغوط بـ Zstandard مع القاموس بشكل صحيح',
    }),
    { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

#### 3. إعادة ضغط النتيجة بالقاموس (الأسطر 337-346)
**قبل** (ضغط بدون قاموس):
```typescript
try {
  console.log(`Re-compressing SARC (${repackedData.length} bytes)...`);
  compressedData = await compress(repackedData);
  console.log(`Compressed: ${repackedData.length} -> ${compressedData.length} bytes`);
} catch (e) {
  console.error(`Re-compression failed: ${e instanceof Error ? e.message : 'Unknown'}`);
}
```

**بعد** (ضغط بالقاموس):
```typescript
try {
  // We need the raw dictionary from decompression phase
  // Make rawDict accessible by declaring it outside the try-catch block above
  console.log(`Re-compressing SARC (${repackedData.length} bytes) with dictionary...`);
  const cctx = createCCtx();
  compressedData = await compressUsingDict(cctx, repackedData, rawDict, 3);
  console.log(`Compressed: ${repackedData.length} -> ${compressedData.length} bytes`);
} catch (e) {
  console.error(`Re-compression failed: ${e instanceof Error ? e.message : 'Unknown'}`);
  // Continue without compression
}
```

### نقطة حرجة: إمكانية الوصول إلى rawDict
يجب جعل متغير `rawDict` متاحاً في كل المراحل:
- تصريح `rawDict` خارج كتل try-catch الداخلية
- استخدامه في مرحلة إعادة الضغط

### التدفق الصحيح
```
ZsDic.pack.zs 
  ↓ (decompress)
rawDict (القاموس الخام)
  ↓
langFile.zs + rawDict
  ↓ (decompressUsingDict)
SARC Data
  ↓
MSBT Processing (Arabic Reshaping/Bidi)
  ↓
Modified SARC
  ↓ (compressUsingDict + rawDict)
output.zs (متوافق مع اللعبة)
```

### الفوائد
✓ فك الضغط الصحيح للملفات المضغوطة بالقاموس
✓ إعادة ضغط النتيجة بنفس الطريقة لضمان توافقية اللعبة
✓ معالجة جميع الملفات بشكل صحيح
✓ سجلات واضحة لكل مرحلة من المعالجة

### الملفات المتأثرة
- `supabase/functions/arabize/index.ts` -- تحديث شامل للمكتبة ودعم القاموس

### الاختبار المتوقع
بعد التنفيذ، سيكون بإمكان المستخدم:
1. رفع ملفات الزيلدا المضغوطة بالقاموس
2. معالجة النصوص العربية بنجاح
3. تحميل النتيجة مضغوطة أو غير مضغوطة
4. رؤية رسائل تسجيل واضحة لكل مرحلة
