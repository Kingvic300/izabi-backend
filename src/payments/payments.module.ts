import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { PaymentLoggerService } from './payment-logger.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from './entities/payment.entity';
import { PaymentLog, PaymentLogSchema } from './entities/payment-log.entity';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Payment.name, schema: PaymentSchema },
            { name: PaymentLog.name, schema: PaymentLogSchema },
        ]),
        UsersModule,
    ],
    providers: [PaymentsService, PaystackService, PaymentLoggerService],
    controllers: [PaymentsController],
    exports: [PaymentsService, PaystackService],
})
export class PaymentsModule {}
