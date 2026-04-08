import { Logger } from '@nestjs/common';

const logger = new Logger('StudyQueueWorker');

async function bootstrap() {
    logger.warn('Study queue worker has been explicitly disabled. Exiting worker process...');
    process.exit(0);
}

bootstrap();
