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
  const [isStarting, setIsStarting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const initialValueRef = useRef('');
  const startRequestRef = useRef(0);
  const acceptResultsRef = useRef(false);
  const hasResultRef = useRef(false);
  const suppressErrorsRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);

  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!systemSpeechRecognition) return;

    const startSubscription = systemSpeechRecognition.addListener('start', () => {
      setIsStarting(false);
      setIsListening(true);
    });
    const endSubscription = systemSpeechRecognition.addListener('end', () => {
      acceptResultsRef.current = false;
      setIsStarting(false);
      setIsListening(false);
    });
    const resultSubscription = systemSpeechRecognition.addListener('result', (event: ExpoSpeechRecognitionResultEvent) => {
      if (!acceptResultsRef.current) return;
      const transcript = event.results[0]?.transcript.trim();
      if (!transcript) return;
      hasResultRef.current = true;
      const initialValue = initialValueRef.current.trimEnd();
      onChangeRef.current(`${initialValue}${initialValue ? ' ' : ''}${transcript}`);
    });
    const errorSubscription = systemSpeechRecognition.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) => {
      const suppress = suppressErrorsRef.current || hasResultRef.current || !acceptResultsRef.current;
      acceptResultsRef.current = false;
      setIsStarting(false);
      setIsListening(false);
      if (suppress || event.error === 'aborted') return;
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
      acceptResultsRef.current = false;
      systemSpeechRecognition.abort();
    };
  }, []);

  const start = useCallback(async () => {
    const requestId = ++startRequestRef.current;
    setIsStarting(true);
    hasResultRef.current = false;
    suppressErrorsRef.current = false;
    // Cloud recognition intentionally remains an unsupported provider until a backend is configured.
    if (provider !== 'system' || !systemSpeechRecognition || !systemSpeechRecognition.isRecognitionAvailable()) {
      setIsStarting(false);
      onErrorRef.current('unavailable');
      return;
    }

    try {
      const permission = await systemSpeechRecognition.requestPermissionsAsync();
      if (requestId !== startRequestRef.current) return;
      if (!permission.granted) {
        setIsStarting(false);
        onErrorRef.current('permission-denied');
        return;
      }
      initialValueRef.current = value;
      acceptResultsRef.current = true;
      systemSpeechRecognition.start({
        lang: locale === 'zh' ? 'zh-CN' : 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch {
      setIsStarting(false);
      setIsListening(false);
      onErrorRef.current('failed');
    }
  }, [locale, provider, value]);

  const stop = useCallback(() => {
    startRequestRef.current += 1;
    suppressErrorsRef.current = true;
    systemSpeechRecognition?.stop();
    setIsStarting(false);
  }, []);

  const abort = useCallback(() => {
    startRequestRef.current += 1;
    acceptResultsRef.current = false;
    suppressErrorsRef.current = true;
    systemSpeechRecognition?.abort();
    setIsStarting(false);
    setIsListening(false);
  }, []);

  return { isStarting, isListening, start, stop, abort };
}
