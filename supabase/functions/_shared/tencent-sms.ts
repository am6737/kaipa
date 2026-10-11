const encoder = new TextEncoder();

async function hmac(key: Uint8Array | ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function hex(bytes: Uint8Array) { return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function sendTencentSms(input: { phone: string; code: string; requestId: string }) {
  const secretId = Deno.env.get('SMS_TENCENT_SECRET_ID');
  const secretKey = Deno.env.get('SMS_TENCENT_SECRET_KEY');
  const sdkAppId = Deno.env.get('SMS_TENCENT_SDK_APP_ID');
  const signName = Deno.env.get('SMS_TENCENT_SIGN_NAME');
  const templateId = Deno.env.get('SMS_TENCENT_TEMPLATE_ID');
  if (!secretId || !secretKey || !sdkAppId || !signName || !templateId) throw new Error('Tencent SMS is not configured');

  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [input.code],
    PhoneNumberSet: [input.phone],
    SessionContext: input.requestId,
  });
  const contentType = 'application/json; charset=utf-8';
  const signedHeaders = 'content-type;host';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, hex(await sha256(payload)),
  ].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, hex(await sha256(canonicalRequest))].join('\n');
  const secretDate = await hmac(encoder.encode(`TC3${secretKey}`), date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, 'tc3_request');
  const signature = hex(await hmac(secretSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': Deno.env.get('SMS_TENCENT_REGION') || 'ap-guangzhou',
      authorization,
    },
    body: payload,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Tencent SMS HTTP ${response.status}`);
  const parsed = JSON.parse(body) as { Response?: { Error?: { Code?: string; Message?: string }; SendStatusSet?: Array<{ Code?: string }> } };
  if (parsed.Response?.Error) throw new Error(`Tencent SMS ${parsed.Response.Error.Code || 'Error'}: ${parsed.Response.Error.Message || ''}`);
  if (parsed.Response?.SendStatusSet?.some((item) => item.Code && item.Code !== 'Ok')) throw new Error('Tencent SMS was not accepted');
}
