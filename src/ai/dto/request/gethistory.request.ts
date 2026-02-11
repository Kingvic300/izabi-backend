import { Request } from 'express';

export interface GetHistoryRequest extends Request {
    user: {
        userId: string;
    };
}
