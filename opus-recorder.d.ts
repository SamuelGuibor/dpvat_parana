// Tipos mínimos do opus-recorder (sem @types oficial). O encoder roda em um
// Web Worker servido de /public/encoderWorker.min.js (copiado do pacote).
declare module 'opus-recorder' {
  interface OpusRecorderOptions {
    encoderPath?: string;
    encoderSampleRate?: number;
    numberOfChannels?: number;
    /** 2048 = VOIP (voz), 2049 = áudio genérico. */
    encoderApplication?: number;
    streamPages?: boolean;
    maxFramesPerPage?: number;
    monitorGain?: number;
    recordingGain?: number;
  }

  export default class Recorder {
    constructor(options?: OpusRecorderOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): void;
    resume(): void;
    /** Chamado com o arquivo .ogg completo (opus) quando a gravação termina. */
    ondataavailable: (data: Uint8Array) => void;
    onstart: () => void;
    onstop: () => void;
  }
}
