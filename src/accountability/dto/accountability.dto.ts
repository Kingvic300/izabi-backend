import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class InvitePartnerDto {
    @IsEmail()
    email!: string;
}

export class RedeemInviteDto {
    @IsString()
    @MinLength(1)
    code!: string;
}

export class RespondToInviteDto {
    @IsBoolean()
    accept!: boolean;
}

export class SaveGoalDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsIn(['daily', 'weekly'])
    cadence?: 'daily' | 'weekly';

    @IsOptional()
    @IsString()
    deadline?: string;
}

export class CheckInDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    note?: string;
}

export class SendMessageDto {
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    content!: string;

    @IsOptional()
    @IsIn(['message', 'nudge'])
    type?: 'message' | 'nudge';
}
