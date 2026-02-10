import { IsEnum, IsNotEmpty } from 'class-validator';

export class InitializePaymentDto {
  @IsEnum(['pro_monthly', 'premium_monthly'], {
    message: 'Plan must be either pro_monthly or premium_monthly',
  })
  @IsNotEmpty()
  plan: 'pro_monthly' | 'premium_monthly';
}
