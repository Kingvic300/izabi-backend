import { IsString, IsObject, IsOptional } from 'class-validator';

export class WebhookPayloadDto {
    @IsString()
    event: string;

    @IsObject()
    @IsOptional()
    data?: {
        reference: string;
        status: string;
        amount: number;
        customer?: {
            customer_code?: string;
            email?: string;
        };
        paid_at?: string;
        [key: string]: any;
    };
}
