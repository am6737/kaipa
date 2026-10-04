import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Checks for an EAS Update after the first render. The check is deliberately
 * best-effort: an unavailable update service must never block app startup.
 */
export function UpdateManager() {
  useEffect(() => {
    if (Platform.OS === 'web' || !Updates.isEnabled) return;

    let active = true;
    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!active || !result.isAvailable) return;

        const fetched = await Updates.fetchUpdateAsync();
        if (!active || !fetched.isNew) return;

        Alert.alert(
          '发现新版本',
          '更新已经准备好了，重启应用即可使用最新功能。',
          [
            { text: '稍后', style: 'cancel' },
            {
              text: '立即更新',
              onPress: () => {
                void Updates.reloadAsync().catch((error) => {
                  console.warn('[Updates] reload failed:', error);
                });
              },
            },
          ],
        );
      } catch (error) {
        // Network failures and an unavailable update service are expected.
        // The embedded bundle remains fully usable in either case.
        console.warn('[Updates] check failed:', error);
      }
    };

    void check();
    return () => {
      active = false;
    };
  }, []);

  return null;
}
