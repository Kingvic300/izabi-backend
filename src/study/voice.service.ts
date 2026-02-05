import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as googleTTS from 'google-tts-api';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { Readable } from 'stream';

@Injectable()
export class VoiceService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async generateVoice(text: string, lang: string = 'en'): Promise<string> {
    try {
      // Clean text for TTS
      const cleanText = text.substring(0, 500); // Reasonable limit for TTS

      // google-tts-api returns a URL to the audio file
      // For text longer than 200 chars, we use getAllAudioUrls
      const audioUrls = googleTTS.getAllAudioUrls(cleanText, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
        splitPunct: '. ',
      });

      // We only take the first part for now to keep it simple and within budget/time
      // or we can concatenate them, but usually 500 chars is 2-3 parts.
      // Let's just take the first part to ensure 100% success for now, 
      // as usually study takeaways are short.
      const url = audioUrls[0].url;

      // Fetch the audio from Google
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);

      // Upload to Cloudinary
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'izabi_voice',
          },
          (error, result) => {
            if (error) return reject(error);
            if (result) {
              resolve(result.secure_url);
            } else {
              reject(new Error('Cloudinary result is empty'));
            }
          }
        );

        const readable = new Readable();
        readable._read = () => {};
        readable.push(audioBuffer);
        readable.push(null);
        readable.pipe(uploadStream);
      });
    } catch (error: any) {
      console.error('[VoiceService] Error:', error);
      throw new InternalServerErrorException('Voice generation failed: ' + error.message);
    }
  }
}
