/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Gravação de áudio para o WhatsApp em ogg/opus — o ÚNICO formato que a Meta
 * entrega como mensagem de voz (PTT) no celular do cliente. O MediaRecorder
 * nativo do Chrome só grava webm (que a Meta rejeita), então o encode é feito
 * pelo opus-recorder (WebAssembly, worker em /encoderWorker.min.js).
 */
export function useVoiceRecorder({ onFinish }: { onFinish: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recorderRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Desmontou no meio da gravação: para o mic sem enviar nada.
  useEffect(() => () => {
    cancelRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* já parado */ }
    clearTimer();
  }, []);

  async function start() {
    if (recording) return;
    try {
      // Import dinâmico: o pacote toca AudioContext no load, então não pode
      // entrar no bundle SSR.
      const { default: Recorder } = await import('opus-recorder');
      const rec = new Recorder({
        encoderPath: '/encoderWorker.min.js',
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP: otimizado pra voz
      });
      rec.ondataavailable = (data: Uint8Array) => {
        clearTimer();
        setRecording(false);
        recorderRef.current = null;
        if (cancelRef.current) return;
        // Gravação relâmpago (clique acidental) não vira mensagem.
        if (data.byteLength < 1000) return;
        const file = new File([data], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' });
        onFinishRef.current(file);
      };
      recorderRef.current = rec;
      cancelRef.current = false;
      await rec.start(); // pede permissão do microfone
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error('[VOICE] Falha ao iniciar gravação:', err);
      toast.error('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
      setRecording(false);
      recorderRef.current = null;
    }
  }

  /** Para a gravação e dispara onFinish com o .ogg pronto. */
  function stopAndSend() {
    cancelRef.current = false;
    try { recorderRef.current?.stop(); } catch { /* já parado */ }
  }

  /** Para e descarta a gravação. */
  function cancel() {
    cancelRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* já parado */ }
    clearTimer();
    setRecording(false);
  }

  return { recording, seconds, start, stopAndSend, cancel };
}

export function formatRecordingTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
