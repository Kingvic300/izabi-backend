import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class IngestTextDto {
    @IsString()
    @IsNotEmpty()
    text: string;

    @IsString()
    @IsNotEmpty()
    fileName: string;

    @IsString()
    @IsNotEmpty()
    type: 'summary' | 'flashcards' | 'quiz' | 'study-guide';

    @IsOptional()
    @IsObject()
    options?: any;

    @IsOptional()
    @IsString()
    lang?: string;
}
