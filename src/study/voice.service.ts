import { Injectable } from '@nestjs/common';
const gTTS = require('gtts');
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as streamifier from 'streamifier';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class VoiceService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async generateVoice(text: string, lang: string = 'en'): Promise<string> {
    // Limit text length to avoid gtts issues
    
    return new Promise((resolve, reject) => {
      const gtts = new gTTS(text, lang);
      
      // Use a temporary file-like approach or pipe it
      // gtts doesn't provide a direct buffer, it has a .stream() or .save(path)
      const speechStream = gtts.stream();
      
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video', // Audio is uploaded as 'video' in Cloudinary
          folder: 'izabi_voice',
        },
        (error, result) => {
          if (error) return reject(error);
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Failed to upload voice to Cloudinary'));
          }
        }
      );

      speechStream.pipe(uploadStream);
    });
  }
}
