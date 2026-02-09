declare module 'google-tts-api' {
  interface TTSOptions {
    lang?: string;
    slow?: boolean;
    host?: string;
    splitPunct?: string;   // ← add this
  }

  function getAudioUrl(
    text: string,
    options?: TTSOptions
  ): string;

  function getAllAudioUrls(
    text: string,
    options?: TTSOptions
  ): Array<{
    url: string;
    shortText: string;
  }>;

  const googleTTS: {
    getAudioUrl: typeof getAudioUrl;
    getAllAudioUrls: typeof getAllAudioUrls;
  };

  export = googleTTS;
}
