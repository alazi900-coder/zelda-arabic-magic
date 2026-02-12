

## إصلاح خطأ code -32: استخراج القاموس الصحيح من أرشيف SARC

### المشكلة
ملف `ZsDic.pack.zs` عند فك ضغطه ينتج **أرشيف SARC** يحتوي على عدة قواميس `.zsdic` منفصلة. الكود الحالي يستخدم أرشيف SARC الكامل (~393KB) كقاموس، وهذا خاطئ -- يجب استخراج ملف `.zsdic` المناسب منه.

بالإضافة لذلك، يوجد كتلة كود مكررة (الأسطر 311-324) تفك ضغط القاموس مرتين.

### التغييرات في `supabase/functions/arabize/index.ts`

#### 1. إزالة الكتلة المكررة (الأسطر 318-324)
حذف فك ضغط القاموس المكرر الذي لا فائدة منه.

#### 2. استبدال منطق القاموس (الأسطر 309-331)
بدلاً من استخدام الناتج الخام كقاموس مباشرة، سيتم:

1. فك ضغط `ZsDic.pack.zs` بالطريقة العادية (بدون قاموس)
2. استخدام `parseSARC()` الموجودة بالفعل لاستخراج ملفات `.zsdic`
3. اختيار القاموس المناسب تلقائياً حسب اسم ملف اللغة:
   - `.pack.zs` --> `pack.zsdic`
   - `.bcett.byml.zs` --> `bcett.byml.zsdic`
   - غير ذلك --> `zs.zsdic`
4. استخدام القاموس المستخرج مع `decompressUsingDict` و `compressUsingDict`

### التدفق المصحح

```text
ZsDic.pack.zs
  | decompress() -- عادي بدون قاموس
  v
SARC Archive (~393KB)
  | parseSARC()
  v
zs.zsdic / pack.zsdic / bcett.byml.zsdic
  |
  v
langFile.zs + pack.zsdic --> decompressUsingDict() --> SARC Data
  |
  v
MSBT Processing --> Modified SARC
  |
  v
compressUsingDict(modified, pack.zsdic) --> output.zs
```

### التفاصيل التقنية

الكود الجديد للأسطر 309-342:

```typescript
// Step 1: Decompress dictionary SARC archive
console.log(`Decompressing dictionary file (${dictData.length} bytes)...`);
let dictSarcData: Uint8Array;
try {
  dictSarcData = decompress(dictData);
  console.log(`Dictionary SARC decompressed: ${dictData.length} -> ${dictSarcData.length} bytes`);
} catch {
  dictSarcData = dictData;
  console.log(`Dictionary file is raw: ${dictSarcData.length} bytes`);
}

// Step 2: Parse SARC to extract individual .zsdic files
const dictFiles = parseSARC(dictSarcData);
console.log(`Found ${dictFiles.length} dictionaries: ${dictFiles.map(f => f.name).join(', ')}`);

// Step 3: Select correct dictionary based on language filename
const langFileName = (langFile?.name || '').toLowerCase();
let selectedDictName = '';

if (langFileName.includes('.pack.')) {
  const found = dictFiles.find(f => f.name.endsWith('pack.zsdic'));
  if (found) { rawDict = found.data; selectedDictName = found.name; }
}
if (!rawDict && langFileName.includes('.bcett.byml.')) {
  const found = dictFiles.find(f => f.name.endsWith('bcett.byml.zsdic'));
  if (found) { rawDict = found.data; selectedDictName = found.name; }
}
if (!rawDict) {
  const found = dictFiles.find(f => f.name.endsWith('zs.zsdic') && !f.name.includes('pack') && !f.name.includes('bcett'));
  if (found) { rawDict = found.data; selectedDictName = found.name; }
}
if (!rawDict && dictFiles.length > 0) {
  rawDict = dictFiles[0].data;
  selectedDictName = dictFiles[0].name;
}

if (!rawDict) {
  return new Response(
    JSON.stringify({ error: 'لم يتم العثور على قاموس .zsdic في ملف القاموس' }),
    { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

console.log(`Using dictionary: ${selectedDictName} (${rawDict.length} bytes)`);

// Step 4: Decompress language file using selected dictionary
console.log(`Decompressing language file (${langData.length} bytes) with dictionary...`);
const dctx = createDCtx();
sarcData = decompressUsingDict(dctx, langData, rawDict);
console.log(`Decompressed successfully: ${langData.length} -> ${sarcData.length} bytes`);
```

### النتيجة المتوقعة
- اختفاء خطأ code -32 لأن القاموس الآن هو ملف `.zsdic` الفعلي وليس أرشيف SARC كامل
- إعادة ضغط النتيجة بنفس القاموس لضمان التوافق مع اللعبة

