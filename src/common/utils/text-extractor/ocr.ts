import { BadRequestException } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import { OCR_MAX_QUEUE, OCR_WORKER_IDLE_MS } from './constants';

let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();
let ocrPending = 0;
let ocrIdleTimer: ReturnType<typeof setTimeout> | null = null;

const clearIdleTimer = () => {
    if (ocrIdleTimer) {
        clearTimeout(ocrIdleTimer);
        ocrIdleTimer = null;
    }
};

const scheduleIdleShutdown = () => {
    clearIdleTimer();
    ocrIdleTimer = setTimeout(() => {
        if (ocrPending === 0) {
            void resetOcrWorker();
        }
    }, OCR_WORKER_IDLE_MS);
    ocrIdleTimer.unref?.();
};

const getOcrWorker = async () => {
    clearIdleTimer();
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = createWorker('eng');
    }
    return ocrWorkerPromise;
};

const resetOcrWorker = async () => {
    clearIdleTimer();
    if (!ocrWorkerPromise) return;
    const current = ocrWorkerPromise;
    ocrWorkerPromise = null;
    try {
        const worker = await current;
        await worker.terminate();
    } catch {
        // Best-effort cleanup.
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
        if (ocrPending === 0) {
            scheduleIdleShutdown();
        }
    }
};
