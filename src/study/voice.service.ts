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
        if (!text || text.trim().length === 0) {
            throw new InternalServerErrorException('Text is required for voice generation');
        }

        try {
            // 1. Clean and limit text (Google TTS allows splitting, but let's cap at 1000 for safety)
            const cleanText = text.substring(0, 1000);

            // 2. Get all audio URLs (Google TTS splits text into ~200 char chunks)
            const audioUrls = googleTTS.getAllAudioUrls(cleanText, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
                splitPunct: '. ',
            });

            // 3. Fetch all audio buffers in parallel for speed
            const audioBufferResults = await Promise.all(
                audioUrls.map(async (part) => {
                    const response = await axios.get(part.url, { responseType: 'arraybuffer' });
                    return Buffer.from(response.data);
                }),
            );

            // 4. Concatenate all buffers into one single audio file
            const finalAudioBuffer = Buffer.concat(audioBufferResults);

            // 5. Stream the buffer to Cloudinary
            return await this.uploadToCloudinary(finalAudioBuffer);
        } catch (error: any) {
            console.error('[VoiceService] Error:', error.message);
            throw new InternalServerErrorException('Neural Voice synchronization failed: ' + error.message);
        }
    }

    /**
     * Helper to handle Cloudinary Stream Upload
     */
    private async uploadToCloudinary(buffer: Buffer): Promise<string> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'auto', // Cloudinary detects mp3/wav automatically
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

            const readable = new Readable();
            readable._read = () => {};
            readable.push(buffer);
            readable.push(null);
            readable.pipe(uploadStream);
        });
    }
}