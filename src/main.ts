import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import {
    MAX_JSON_BODY_MB,
} from './common/constants/upload.constants';
import * as express from 'express';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    // Safer payload limits (override with env)
    app.use(express.json({ limit: `${MAX_JSON_BODY_MB}mb` }));
    app.use(express.urlencoded({ limit: `${MAX_JSON_BODY_MB}mb`, extended: true }));

    const defaultCorsOrigins = [
        'https://izabi.halixe.com',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://izabi.onrender.com',
    ];
    const normalizeOrigin = (value: string): string =>
        value.trim().replace(/\/+$/, '').toLowerCase();

    const envCorsOrigins = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);
    const corsOrigins = new Set(
        [...defaultCorsOrigins, ...envCorsOrigins].map((origin) =>
            normalizeOrigin(origin),
        ),
    );

    const isAllowedVercelPreview = (origin: string): boolean => {
        try {
            const url = new URL(origin);
            if (url.protocol !== 'https:') return false;

            // Allow Vercel preview deployments for the "inkluziv" project.
        return url.hostname.endsWith('.vercel.app');
        } catch {       
            return false;
        }
    };

    // Enable CORS with explicit allowlist
    app.enableCors({
        origin: (
            origin: string | undefined,
            callback: (error: Error | null, allow?: boolean) => void,
        ) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            const normalizedOrigin = normalizeOrigin(origin);
            if (
                corsOrigins.has(normalizedOrigin) ||
                isAllowedVercelPreview(normalizedOrigin)
            ) {
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
