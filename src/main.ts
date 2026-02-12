import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import * as express from 'express';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    // Increase payload size limit using express directly
    app.use(express.json({ limit: '500mb' }));
    app.use(express.urlencoded({ limit: '500mb', extended: true }));

    const defaultCorsOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://izabi.onrender.com',
    ];
    const envCorsOrigins = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const corsOrigins = [...new Set([...defaultCorsOrigins, ...envCorsOrigins])];

    // Enable CORS with explicit allowlist
    app.enableCors({
        origin: (
            origin: string | undefined,
            callback: (error: Error | null, allow?: boolean) => void,
        ) => {
            if (!origin || corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
        }),
    );

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    // Disable global prefix to match frontend's inconsistent routing
    // app.setGlobalPrefix('api');

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
