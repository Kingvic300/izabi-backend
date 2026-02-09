import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class IngestRemoteDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsObject()
  options?: any;
}
