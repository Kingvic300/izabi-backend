import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
    Partnership,
    PartnershipDocument,
} from '../accountability/entities/partnership.entity';

const TARGET_STATUSES = ['pending', 'active'];
const isDryRun = process.argv.includes('--dry-run');

async function clearPartnershipRequests() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const partnershipModel = app.get<Model<PartnershipDocument>>(
        getModelToken(Partnership.name),
    );

    try {
        const filter = { status: { $in: TARGET_STATUSES } };
        const count = await partnershipModel.countDocuments(filter);

        console.log(
            `Found ${count} partnership record(s) with status in [${TARGET_STATUSES.join(', ')}].`,
        );

        if (isDryRun) {
            console.log('Dry run only — no records deleted.');
            return;
        }

        if (count === 0) {
            console.log('Nothing to delete.');
            return;
        }

        const result = await partnershipModel.deleteMany(filter);
        console.log(`Deleted ${result.deletedCount} partnership record(s).`);
    } catch (error) {
        console.error('Failed to clear partnership requests:', error);
        throw error;
    } finally {
        await app.close();
    }
}

clearPartnershipRequests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
