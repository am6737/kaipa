import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent } from 'expo-speech-recognition';

type SpeechRecognitionModule = typeof import('expo-speech-recognition')['ExpoSpeechRecognitionModule'];

export type SpeechRecognitionProvider = 'system' | 'cloud';
export type SpeechRecognitionInputError = 'permission-denied' | 'unavailable' | 'no-speech' | 'failed';

const systemSpeechRecognition = requireOptionalNativeModule<SpeechRecognitionModule>('ExpoSpeechRecognition');

// Errors a recognition service raises when it refuses to bind at all, e.g. a third-party app that registered
// itself as the default Android RecognitionService but only serves its own UI (code 5, then code 9).
const SERVICE_BIND_ERRORS = new Set(['client', 'service-not-allowed', 'unknown']);
const RETRY_DELAY_MS = 300;
// Once the default service has refused us, go straight to the on-device recognizer for the rest of the run.
let preferOnDevice = false;

// Remembers which default service refused us, so a later change of default service re-enables voice input.
const UNSUPPORTED_SERVICE_KEY = 'kaipa.speech.unsupportedService.v1';
let unsupportedService: string | undefined;
let unsupportedServiceLoaded = false;

function defaultServicePackage() {
  if (Platform.OS !== 'android' || !systemSpeechRecognition) return '';
  try {
    return systemSpeechRecognition.getDefaultRecognitionService().packageName;
  } catch {
    return '';
  }
}

function recognitionAvailable() {
  if (!systemSpeechRecognition) return false;
  try {
    return systemSpeechRecognition.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function isKnownUnsupported() {
  return unsupportedService !== undefined && unsupportedService === defaultServicePackage();
}

function canUseOnDevice() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33 || !systemSpeechRecognition) return false;
  try {
    return systemSpeechRecognition.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

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
  const [supported, setSupported] = useState(() => recognitionAvailable() && !isKnownUnsupported());
  const initialValueRef = useRef('');
  const startRequestRef = useRef(0);
  const acceptResultsRef = useRef(false);
  const hasResultRef = useRef(false);
  const suppressErrorsRef = useRef(false);
  const startedRef = useRef(false);
  const abortedRef = useRef(false);
  const errorReportedRef = useRef(false);
  const onDeviceRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startRecognizerRef = useRef<(onDevice: boolean) => void>(() => {});
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);

  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    if (unsupportedServiceLoaded || Platform.OS !== 'android') return;
    let cancelled = false;
    void AsyncStorage.getItem(UNSUPPORTED_SERVICE_KEY).then((stored) => {
      unsupportedServiceLoaded = true;
      if (stored !== null && unsupportedService === undefined) unsupportedService = stored;
      if (!cancelled && isKnownUnsupported()) setSupported(false);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const clearRetry = useCallback(() => {
    if (!retryTimerRef.current) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = undefined;
  }, []);

  startRecognizerRef.current = (onDevice: boolean) => {
    if (!systemSpeechRecognition) return;
    onDeviceRef.current = onDevice;
    startedRef.current = false;
    try {
      systemSpeechRecognition.start({
        lang: locale === 'zh' ? 'zh-CN' : 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice || undefined,
      });
    } catch {
      acceptResultsRef.current = false;
      setIsStarting(false);
      setIsListening(false);
      errorReportedRef.current = true;
      onErrorRef.current('failed');
    }
  };

  useEffect(() => {
    if (!systemSpeechRecognition) return;

    const startSubscription = systemSpeechRecognition.addListener('start', () => {
      startedRef.current = true;
      setIsStarting(false);
      setIsListening(true);
    });
    const endSubscription = systemSpeechRecognition.addListener('end', () => {
      if (retryTimerRef.current) return;
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
      // A refusing service reports several errors in a row; ignore the rest while the retry is queued.
      if (retryTimerRef.current) return;
      const bindFailed = !startedRef.current && SERVICE_BIND_ERRORS.has(event.error);
      const onDeviceFallback = bindFailed && !onDeviceRef.current && canUseOnDevice();
      if (onDeviceFallback) preferOnDevice = true;
      if (onDeviceFallback && acceptResultsRef.current && !suppressErrorsRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = undefined;
          startRecognizerRef.current(true);
        }, RETRY_DELAY_MS);
        return;
      }
      // Errors before the recognizer ever started are reported even if the user already let go,
      // otherwise a broken service just looks like "spoke and nothing appeared".
      const suppress = errorReportedRef.current
        || abortedRef.current
        || hasResultRef.current
        || (startedRef.current && (suppressErrorsRef.current || !acceptResultsRef.current));
      acceptResultsRef.current = false;
      setIsStarting(false);
      setIsListening(false);
      if (suppress || event.error === 'aborted') return;
      errorReportedRef.current = true;
      if (bindFailed) {
        // Neither the default service nor an on-device recognizer will take the request on this device.
        preferOnDevice = false;
        unsupportedService = defaultServicePackage();
        void AsyncStorage.setItem(UNSUPPORTED_SERVICE_KEY, unsupportedService).catch(() => {});
        setSupported(false);
      }
      if (event.error === 'not-allowed') onErrorRef.current('permission-denied');
      else if (event.error === 'no-speech' || event.error === 'speech-timeout') onErrorRef.current('no-speech');
      else if (bindFailed || event.error === 'service-not-allowed' || event.error === 'language-not-supported') onErrorRef.current('unavailable');
      else onErrorRef.current('failed');
    });

    return () => {
      startSubscription.remove();
      endSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();
      acceptResultsRef.current = false;
      clearRetry();
      systemSpeechRecognition.abort();
    };
  }, [clearRetry]);

  const start = useCallback(async () => {
    const requestId = ++startRequestRef.current;
    setIsStarting(true);
    clearRetry();
    hasResultRef.current = false;
    suppressErrorsRef.current = false;
    abortedRef.current = false;
    errorReportedRef.current = false;
    startedRef.current = false;
    // Cloud recognition intentionally remains an unsupported provider until a backend is configured.
    if (provider !== 'system' || !systemSpeechRecognition || !recognitionAvailable()) {
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
      startRecognizerRef.current(preferOnDevice && canUseOnDevice());
    } catch {
      setIsStarting(false);
      setIsListening(false);
      onErrorRef.current('failed');
    }
  }, [clearRetry, provider, value]);

  const stop = useCallback(() => {
    startRequestRef.current += 1;
    suppressErrorsRef.current = true;
    if (retryTimerRef.current) {
      // Released while switching to the on-device recognizer: nothing was heard, so just reset.
      clearRetry();
      acceptResultsRef.current = false;
      setIsListening(false);
    }
    systemSpeechRecognition?.stop();
    setIsStarting(false);
  }, [clearRetry]);

  const abort = useCallback(() => {
    startRequestRef.current += 1;
    acceptResultsRef.current = false;
    suppressErrorsRef.current = true;
    abortedRef.current = true;
    clearRetry();
    systemSpeechRecognition?.abort();
    setIsStarting(false);
    setIsListening(false);
  }, [clearRetry]);

  return { supported, isStarting, isListening, start, stop, abort };
}
