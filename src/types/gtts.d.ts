declare module 'gtts' {
  class gTTS {
    constructor(text: string, lang: string);
    stream(): any;
    save(path: string, callback: (err: any, result: any) => void): void;
  }
  export = gTTS;
}
an