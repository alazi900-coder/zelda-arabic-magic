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
        if (!Buffer.isBuffer(pakBuffer)) {
            throw new TypeError('pakBuffer must be a Buffer');
        }

        if (pakBuffer.length < 4) {
            throw new Error('Invalid PAK file: too small to contain file count');
        }

        const linFiles = [];
        let offset = 0;

        const numFiles = pakBuffer.readUInt32LE(offset);
        offset += 4;

        if (numFiles < 0 || numFiles > 100000) {
            throw new RangeError('Invalid number of files in PAK');
        }

        const headerSize = 4 + (numFiles * 8);
        if (pakBuffer.length < headerSize) {
            throw new Error('Invalid PAK file: header truncated');
        }

        const fileEntries = [];
        for (let i = 0; i < numFiles; i++) {
            const fileOffset = pakBuffer.readUInt32LE(offset);
            const fileSize = pakBuffer.readUInt32LE(offset + 4);
            offset += 8;

            if (fileOffset < headerSize || fileSize < 0 || fileOffset + fileSize > pakBuffer.length) {
                throw new RangeError(`Invalid file entry at index ${i}`);
            }

            fileEntries.push({ fileOffset, fileSize });
        }

        for (let i = 0; i < fileEntries.length; i++) {
            const { fileOffset, fileSize } = fileEntries[i];
            const linBuffer = pakBuffer.slice(fileOffset, fileOffset + fileSize);
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
        if (!Buffer.isBuffer(linBuffer)) {
            throw new TypeError('linBuffer must be a Buffer');
        }

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
        if (!Buffer.isBuffer(originalLinBuffer)) {
            throw new TypeError('originalLinBuffer must be a Buffer');
        }

        if (!Array.isArray(translatedTexts)) {
            throw new TypeError('translatedTexts must be an array');
        }

        const sortedTexts = [...translatedTexts].sort((a, b) => a.offset - b.offset);
        let newLinBuffer = Buffer.alloc(0);
        let lastOffset = 0;

        for (const textEntry of sortedTexts) {
            const offset = Number(textEntry.offset);
            const length = Number(textEntry.length);

            if (!Number.isInteger(offset) || offset < 1 || !Number.isInteger(length) || length < 0) {
                throw new TypeError('translatedTexts entries must include valid offset and length');
            }

            if (offset - 1 < lastOffset) {
                throw new Error('translatedTexts entries must be non-overlapping and ordered by offset');
            }

            if (offset + length > originalLinBuffer.length) {
                throw new RangeError('translated text range is outside the original .lin buffer');
            }

            newLinBuffer = Buffer.concat([
                newLinBuffer,
                originalLinBuffer.slice(lastOffset, offset - 1) // -1 لتجاوز الـ Opcode القديم
            ]);

            newLinBuffer = Buffer.concat([
                newLinBuffer,
                Buffer.from([this.TEXT_OPCODE])
            ]);

            const reshapedText = this.reshapeArabicText(textEntry.translated);

            newLinBuffer = Buffer.concat([
                newLinBuffer,
                Buffer.from(reshapedText, 'utf8'),
                Buffer.from([this.END_OF_STRING])
            ]);

            lastOffset = offset + length + 1;
        }

        newLinBuffer = Buffer.concat([
            newLinBuffer,
            originalLinBuffer.slice(lastOffset)
        ]);

        return newLinBuffer;
    }

    reshapeArabicText(text) {
        if (typeof text !== 'string') {
            throw new TypeError('translated text must be a string');
        }

        // إذا كنت تستخدم مكتبة reshaper، ففعل السطر التالي:
        // return reshape(text);

        return text;
    }

    /**
     * 4. إعادة ضغط ملفات .lin داخل ملف .pak جديد
     * @param {Array} linFiles - مصفوفة ملفات الـ .lin المعربة
     * @returns {Buffer} - ملف الـ .pak الجديد
     */
    repackPak(linFiles) {
        if (!Array.isArray(linFiles)) {
            throw new TypeError('linFiles must be an array');
        }

        const numFiles = linFiles.length;
        if (numFiles < 0 || numFiles > 100000) {
            throw new RangeError('Invalid number of files in PAK');
        }

        const headerSize = 4 + (numFiles * 8); // 4 بايت للعدد + (4 للعنوان + 4 للحجم) لكل ملف
        let currentDataOffset = headerSize;

        const headerBuffer = Buffer.alloc(headerSize);
        headerBuffer.writeUInt32LE(numFiles, 0);

        const dataBuffers = [];

        for (let i = 0; i < numFiles; i++) {
            const linFile = linFiles[i];
            if (!linFile || !Buffer.isBuffer(linFile.buffer)) {
                throw new TypeError(`linFiles[${i}].buffer must be a Buffer`);
            }

            const linBuffer = linFile.buffer;
            const fileSize = linBuffer.length;

            headerBuffer.writeUInt32LE(currentDataOffset, 4 + (i * 8));
            headerBuffer.writeUInt32LE(fileSize, 4 + (i * 8) + 4);

            dataBuffers.push(linBuffer);
            currentDataOffset += fileSize;
        }

        return Buffer.concat([headerBuffer, ...dataBuffers]);
    }
}

export default DanganronpaParser;
