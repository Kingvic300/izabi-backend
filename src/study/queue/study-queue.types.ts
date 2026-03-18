export const STUDY_QUEUE_NAME = 'study-ingest';

export type StudyQueueJobPayload = {
    jobId: string;
    historyId: string;
    userId: string;
    type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';
    fileUrls: string[];
    fileNames: string[];
    language?: string;
    options?: any;
};
