import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent } from 'expo-speech-recognition';

type SpeechRecognitionModule = typeof import('expo-speech-recognition')['ExpoSpeechRecognitionModule'];

export type SpeechRecognitionProvider = 'system' | 'cloud';
export type SpeechRecognitionInputError = 'permission-denied' | 'unavailable' | 'no-speech' | 'failed';

const systemSpeechRecognition = requireOptionalNativeModule<SpeechRecognitionModule>('ExpoSpeechRecognition');

export function useSpeechRecognitionInput({
  locale,
  value,
  onChange,
  onError,
  provider = 'system',
}: {
  locale: 'zh' | 'en';
  value: string;
  onChange: (value: string) => void;
  onError: (error: SpeechRecognitionInputError) => void;
  provider?: SpeechRecognitionProvider;
}) {
  const [isListening, setIsListening] = useState(false);
  const initialValueRef = useRef('');
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);

  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!systemSpeechRecognition) return;

    const startSubscription = systemSpeechRecognition.addListener('start', () => setIsListening(true));
    const endSubscription = systemSpeechRecognition.addListener('end', () => setIsListening(false));
    const resultSubscription = systemSpeechRecognition.addListener('result', (event: ExpoSpeechRecognitionResultEvent) => {
      const transcript = event.results[0]?.transcript.trim();
      if (!transcript) return;
      const initialValue = initialValueRef.current.trimEnd();
      onChangeRef.current(`${initialValue}${initialValue ? ' ' : ''}${transcript}`);
    });
    const errorSubscription = systemSpeechRecognition.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed') onErrorRef.current('permission-denied');
      else if (event.error === 'no-speech' || event.error === 'speech-timeout') onErrorRef.current('no-speech');
      else if (event.error === 'service-not-allowed' || event.error === 'language-not-supported') onErrorRef.current('unavailable');
      else onErrorRef.current('failed');
    });

    return () => {
      startSubscription.remove();
      endSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();
      systemSpeechRecognition.abort();
    };
  }, []);

  const start = useCallback(async () => {
    // Cloud recognition intentionally remains an unsupported provider until a backend is configured.
    if (provider !== 'system' || !systemSpeechRecognition || !systemSpeechRecognition.isRecognitionAvailable()) {
      onErrorRef.current('unavailable');
      return;
    }

    try {
      const permission = await systemSpeechRecognition.requestPermissionsAsync();
      if (!permission.granted) {
        onErrorRef.current('permission-denied');
        return;
      }
      initialValueRef.current = value;
      systemSpeechRecognition.start({
        lang: locale === 'zh' ? 'zh-CN' : 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch {
      setIsListening(false);
      onErrorRef.current('failed');
    }
  }, [locale, provider, value]);

  const stop = useCallback(() => {
    systemSpeechRecognition?.stop();
  }, []);

  const abort = useCallback(() => {
    systemSpeechRecognition?.abort();
    setIsListening(false);
  }, []);

  return { isListening, start, stop, abort };
}
