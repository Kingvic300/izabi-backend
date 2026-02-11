import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // Extract the message from the exception
        const exceptionResponse =
            exception instanceof HttpException ? exception.getResponse() : null;

        const message =
            typeof exceptionResponse === 'object' && exceptionResponse !== null
                ? (exceptionResponse as any).message || exception.message
                : exception.message || 'Internal server error';

        // Log the error for the admin (server-side console)
        console.error(`[Error] ${request.method} ${request.url}`, {
            status,
            message,
            stack: exception instanceof Error ? exception.stack : null,
        });

        response.status(status).json({
            success: false,
            statusCode: status,
            message: Array.isArray(message) ? message[0] : message, // Handle validation arrays
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}
