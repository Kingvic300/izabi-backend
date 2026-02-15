import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    userId: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    message: string;

    @IsOptional()
    @IsString()
    @MaxLength(256)
    documentId?: string;
}
