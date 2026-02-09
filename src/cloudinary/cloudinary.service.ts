import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { ConfigService } from '@nestjs/config';

export type CloudinaryResponse = UploadApiResponse | UploadApiErrorResponse;

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {}

  uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'izabi_pdfs',
        },
        (error, result) => {
          if (error) return reject(error);
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Cloudinary upload failed: Unknown error (no result returned)"));
          }
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  // HOW: Generates a signature for secure client-side uploads directly to Cloudinary
  // WHY: Allows the backend to remain memory-safe by never touching the large file stream
  async generateSignature() {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const secret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    const folder = 'izabi_pdfs'; // Must match the folder used in frontend
    
    if (!secret) {
      throw new Error('Cloudinary configuration error: API Secret is missing in environment.');
    }

    // SIGNATURE MUST INCLUDE ALL PARAMS WE SEND IN BODY
    // We must include "folder" because the frontend sends it.
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: timestamp,
        folder: folder,
      },
      secret
    );

    return {
      signature,
      timestamp,
      cloudName: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      apiKey: this.configService.get('CLOUDINARY_API_KEY'),
      folder,
    };
  }
}