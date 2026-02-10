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
  
    // Enable CORS
    app.enableCors({
        origin: true,
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
    }));

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    // Disable global prefix to match frontend's inconsistent routing
    // app.setGlobalPrefix('api');

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
