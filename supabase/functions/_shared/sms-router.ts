/** Provider-neutral SMS routing for the self-hosted Auth SMS hook.
 *
 * Providers are deliberately HTTP based: vendor credentials stay in the
 * functions container and a provider can be replaced without changing Auth.
 */
export type SmsMessage = {
  requestId: string;
  phone: string;
  code: string;
  template?: string;
};

export type SmsProvider = {
  name: string;
  send(message: SmsMessage): Promise<void>;
};

export type SmsRouteResult = { provider: string };

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function parseProviderNames(value: string | undefined): string[] {
  return (value || '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** Generic adapter used by a small internal gateway or a vendor proxy.
 * The endpoint receives {request_id, phone, code, template} and must return
 * 2xx only after the vendor accepted the SMS request.
 */
export function httpProvider(name: string, endpointEnv: string, secretEnv?: string): SmsProvider {
  return {
    name,
    async send(message) {
      const endpoint = required(endpointEnv);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (secretEnv) headers.authorization = `Bearer ${required(secretEnv)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          request_id: message.requestId,
          phone: message.phone,
          code: message.code,
          template: message.template,
        }),
      });
      if (!response.ok) throw new Error(`${name} rejected SMS (${response.status})`);
    },
  };
}

export function configuredProviders(): SmsProvider[] {
  const providers: Record<string, SmsProvider> = {
    tencent: httpProvider('tencent', 'SMS_TENCENT_ENDPOINT', 'SMS_TENCENT_SECRET'),
    volcano: httpProvider('volcano', 'SMS_VOLCANO_ENDPOINT', 'SMS_VOLCANO_SECRET'),
    aliyun: httpProvider('aliyun', 'SMS_ALIYUN_ENDPOINT', 'SMS_ALIYUN_SECRET'),
    huawei: httpProvider('huawei', 'SMS_HUAWEI_ENDPOINT', 'SMS_HUAWEI_SECRET'),
  };
  const names = parseProviderNames(Deno.env.get('SMS_PROVIDER_ORDER'));
  return names.map((name) => providers[name]).filter((provider): provider is SmsProvider => Boolean(provider));
}

export async function sendWithFailover(message: SmsMessage, providers = configuredProviders()): Promise<SmsRouteResult> {
  if (!providers.length) throw new Error('no SMS providers configured');
  let lastError: unknown;
  for (const provider of providers) {
    try {
      await provider.send(message);
      console.info(JSON.stringify({ event: 'sms_sent', provider: provider.name, request_id: message.requestId, phone: maskPhone(message.phone) }));
      return { provider: provider.name };
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({ event: 'sms_provider_failed', provider: provider.name, request_id: message.requestId, phone: maskPhone(message.phone) }));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('all SMS providers failed');
}
