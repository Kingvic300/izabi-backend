import { BadRequestException } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import { OCR_MAX_QUEUE } from './constants';

let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();
let ocrPending = 0;

const getOcrWorker = async () => {
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = createWorker('eng');
    }
    return ocrWorkerPromise;
};

const resetOcrWorker = async () => {
    if (!ocrWorkerPromise) return;
    try {
        const worker = await ocrWorkerPromise;
        await worker.terminate();
    } catch {
        // Best-effort cleanup.
    } finally {
        ocrWorkerPromise = null;
    }
};

export const runOcr = async (image: Buffer | Uint8Array): Promise<string> => {
    if (ocrPending >= OCR_MAX_QUEUE) {
        throw new BadRequestException('OCR queue is busy. Please try again.');
    }
    const worker = await getOcrWorker();
    ocrPending += 1;
    const task = ocrQueue.then(() => worker.recognize(image));
    ocrQueue = task.then(
        () => undefined,
        () => undefined,
    );
    try {
        const { data } = await task;
        return data?.text || '';
    } catch (error) {
        await resetOcrWorker();
        throw error;
    } finally {
        ocrPending = Math.max(ocrPending - 1, 0);
    }
};
