const { PDFParse } = require('pdf-parse');
console.log('PDFParse:', PDFParse);
try {
    const parser = new PDFParse({ data: Buffer.from('%PDF-1.4') });
    console.log('Parser created successfully');
} catch (e) {
    console.log('Error creating parser:', e.message);
}
