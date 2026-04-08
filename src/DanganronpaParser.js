/**
 * Danganronpa Switch (Unity) File Parser for Zelda Arabic Magic
 * المبرمج: [اسمك/Zelda Arabic Magic]
 * الوظيفة: فك وضغط ملفات .pak و .lin مع دعم قلب النص العربي وتحديث العناوين.
 */

// استدعاء مكتبة قلب النص العربي (تأكد من استخدام المكتبة الموجودة في أداتك)
// import { reshape } from 'arabic-reshaper'; 

class DanganronpaParser {
    constructor() {
        // الأوامر البرمجية (Opcodes) الخاصة بالنصوص في Danganronpa
        this.TEXT_OPCODE = 0x02; // الأمر الذي يسبق ظهور النص
        this.END_OF_STRING = 0x00; // البايت الذي ينهي النص (Null Terminator)
    }

    /**
     * 1. فك ملفات .pak واستخراج ملفات .lin منها
     * @param {Buffer} pakBuffer - ملف الـ .pak كـ Buffer
     * @returns {Array} - مصفوفة تحتوي على ملفات الـ .lin المستخرجة
     */
    extractPak(pakBuffer) {
        const linFiles = [];
        let offset = 0;

        // قراءة عدد الملفات (أول 4 بايت)
        const numFiles = pakBuffer.readUInt32LE(offset);
        offset += 4;

        const fileEntries = [];
        // قراءة جدول العناوين والأحجام
        for (let i = 0; i < numFiles; i++) {
            const fileOffset = pakBuffer.readUInt32LE(offset);
            const fileSize = pakBuffer.readUInt32LE(offset + 4);
            fileEntries.push({ fileOffset, fileSize });
            offset += 8;
        }

        // استخراج البيانات الخام (ملفات .lin)
        for (let i = 0; i < fileEntries.length; i++) {
            const { fileOffset, fileSize } = fileEntries[i];
            const linBuffer = pakBuffer.slice(fileOffset, fileOffset + fileSize);
            
            // ملاحظة: ملفات .pak لا تخزن الأسماء، لذا نستخدم Index كاسم مؤقت
            // يمكنك لاحقاً ربطها بملف JSON خارجي يحتوي على الأسماء الحقيقية إذا توفرت
            linFiles.push({ name: `script_${i.toString().padStart(3, '0')}.lin`, buffer: linBuffer });
        }

        return linFiles;
    }

    /**
     * 2. استخراج النصوص من ملف .lin
     * @param {Buffer} linBuffer - ملف الـ .lin كـ Buffer
     * @returns {Array} - مصفوفة تحتوي على النصوص وعناوينها
     */
    extractLin(linBuffer) {
        const texts = [];
        let currentOffset = 0;

        while (currentOffset < linBuffer.length) {
            const opcode = linBuffer.readUInt8(currentOffset);

            // إذا وجدنا أمر "ظهور النص"
            if (opcode === this.TEXT_OPCODE) {
                let stringStart = currentOffset + 1;
                let stringEnd = stringStart;

                // البحث عن نهاية النص (0x00)
                while (stringEnd < linBuffer.length && linBuffer.readUInt8(stringEnd) !== this.END_OF_STRING) {
                    stringEnd++;
                }

                if (stringEnd < linBuffer.length) {
                    const originalTextBuffer = linBuffer.slice(stringStart, stringEnd);
                    const originalText = originalTextBuffer.toString('utf8');

                    texts.push({
                        original: originalText,
                        offset: stringStart,
                        length: originalTextBuffer.length
                    });
                    currentOffset = stringEnd + 1; // تجاوز النص ونهايته
                } else {
                    currentOffset++;
                }
            } else {
                // تجاوز الأوامر الأخرى (Bytecode)
                currentOffset++;
            }
        }
        return texts;
    }

    /**
     * 3. إعادة ضغط ملف .lin مع النصوص المعربة (وتحديث العناوين)
     * @param {Buffer} originalLinBuffer - الملف الأصلي
     * @param {Array} translatedTexts - مصفوفة النصوص المترجمة
     * @returns {Buffer} - ملف الـ .lin الجديد
     */
    repackLin(originalLinBuffer, translatedTexts) {
        let newLinBuffer = Buffer.alloc(0);
        let lastOffset = 0;

        for (const textEntry of translatedTexts) {
            // 1. نسخ الـ Bytecode الذي يسبق النص
            newLinBuffer = Buffer.concat([
                newLinBuffer,
                originalLinBuffer.slice(lastOffset, textEntry.offset - 1) // -1 لتجاوز الـ Opcode القديم
            ]);

            // 2. كتابة أمر النص (0x02)
            newLinBuffer = Buffer.concat([
                newLinBuffer,
                Buffer.from([this.TEXT_OPCODE])
            ]);

            // 3. معالجة النص العربي (قلب ووصل)
            // استدعِ دالة الـ Reshape الخاصة بأداتك هنا
            // const reshapedText = reshape(textEntry.translated).split('').reverse().join('');
            const reshapedText = textEntry.translated; // استبدل هذا بسطر الـ Reshape

            // 4. كتابة النص الجديد ونهايته (0x00)
            newLinBuffer = Buffer.concat([
                newLinBuffer,
                Buffer.from(reshapedText, 'utf8'),
                Buffer.from([this.END_OF_STRING])
            ]);

            // تحديث المؤشر لتجاوز النص القديم
            lastOffset = textEntry.offset + textEntry.length + 1;
        }

        // 5. نسخ ما تبقى من الملف (Bytecode النهائي)
        newLinBuffer = Buffer.concat([
            newLinBuffer,
            originalLinBuffer.slice(lastOffset)
        ]);

        return newLinBuffer;
    }

    /**
     * 4. إعادة ضغط ملفات .lin داخل ملف .pak جديد
     * @param {Array} linFiles - مصفوفة ملفات الـ .lin المعربة
     * @returns {Buffer} - ملف الـ .pak الجديد
     */
    repackPak(linFiles) {
        const numFiles = linFiles.length;
        const headerSize = 4 + (numFiles * 8); // 4 بايت للعدد + (4 للعنوان + 4 للحجم) لكل ملف
        let currentDataOffset = headerSize;

        const headerBuffer = Buffer.alloc(headerSize);
        headerBuffer.writeUInt32LE(numFiles, 0);

        const dataBuffers = [];

        for (let i = 0; i < numFiles; i++) {
            const linBuffer = linFiles[i].buffer;
            const fileSize = linBuffer.length;

            // كتابة العنوان (Offset) والحجم (Size) في الترويسة
            headerBuffer.writeUInt32LE(currentDataOffset, 4 + (i * 8));
            headerBuffer.writeUInt32LE(fileSize, 4 + (i * 8) + 4);

            dataBuffers.push(linBuffer);
            currentDataOffset += fileSize; // تحديث العنوان للملف التالي
        }

        // دمج الترويسة مع البيانات
        return Buffer.concat([headerBuffer, ...dataBuffers]);
    }
}

module.exports = DanganronpaParser;
