import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getAllAudioUrls } from 'google-tts-api';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import * as streamifier from 'streamifier';

@Injectable()
export class VoiceService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async generateVoice(text: string, lang: string = 'en'): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new InternalServerErrorException(
        'Text is required for voice generation',
      );
    }

    try {
      // 1. Clean and limit text - Google TTS allows splitting, let's allow up to 2400 chars for richer lessons
      const cleanText = text.substring(0, 2400);

      // 2. Get all audio URLs (Google TTS splits text into ~200 char chunks)
      const audioUrls = getAllAudioUrls(cleanText, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
        splitPunct: '. ',
      });

      // 3. Fetch all audio buffers in parallel for speed
      const audioBufferResults = await Promise.all(
        audioUrls.map(async (part) => {
          const response = await axios.get(part.url, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
          });
          return Buffer.from(response.data);
        }),
      );

      // 4. Concatenate all buffers into one single audio file
      const finalAudioBuffer = Buffer.concat(audioBufferResults);

      // 5. Stream the buffer to Cloudinary
      return await this.uploadToCloudinary(finalAudioBuffer);
    } catch (error: any) {
      console.error('[VoiceService] Error:', error.message);
      throw new InternalServerErrorException(
        'Neural Voice synchronization failed: ' + error.message,
      );
    }
  }

  /**
   * Helper to handle Cloudinary Stream Upload
   */
  private async uploadToCloudinary(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video', // 'video' is more reliable for audio files in Cloudinary
          folder: 'izabi_voice',
          format: 'mp3',
        },
        (error, result) => {
          if (error) return reject(error);
          if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Cloudinary upload returned empty result'));
          }
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}
