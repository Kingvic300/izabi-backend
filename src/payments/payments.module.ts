import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from './entities/payment.entity';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
        UsersModule,
    ],
    providers: [PaymentsService, PaystackService],
    controllers: [PaymentsController],
    exports: [PaymentsService],
})
export class PaymentsModule {}
