declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// Supabase Edge Functions resolve npm: imports at deploy time. The app's root
// TypeScript compiler does not understand that scheme, so keep this isolated.
// @ts-ignore Deno npm specifier
import md5 from 'npm:js-md5@0.8.3';
// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

type Provider = 'taobao' | 'tmall' | 'jd' | 'dewu' | 'generic';

type Preview = {
  provider: Provider;
  sourceUrl: string;
  externalId?: string;
  name: string;
  priceCny?: number;
  weightKg?: number;
  imageUrl?: string;
  brand?: string;
  category?: string;
  attrs: [string, string][];
  warnings: string[];
};

class PreviewError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const env = (name: string) => Deno.env.get(name)?.trim() || '';
const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const finite = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const PLATFORM_HOSTS = [
  'taobao.com', 'tmall.com', 'tb.cn',
  'jd.com', '3.cn', 'jd.hk',
  'dw4.co', 'dewu.com',
];

const DEWU_IMAGE_HOSTS = ['cdn.poizon.com', 'webimg.dewucdn.com'];

function hostMatches(hostname: string, allowed: string) {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function validateUrl(raw: string) {
  if (!raw || raw.length > 4096) throw new PreviewError('invalid_url', '商品链接无效', 400);
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new PreviewError('invalid_url', '商品链接无效', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new PreviewError('invalid_url', '仅支持公开的 HTTP/HTTPS 商品链接', 400);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || isPrivateIpv4(hostname)) throw new PreviewError('blocked_url', '不允许访问本地或私有网络地址', 400);
  if (url.port && !['80', '443'].includes(url.port)) throw new PreviewError('blocked_url', '商品链接使用了不受支持的端口', 400);
  url.hash = '';
  return url;
}

function allowedFetchHost(hostname: string) {
  const configured = env('GEAR_LINK_ALLOWED_HOSTS').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  return [...PLATFORM_HOSTS, ...configured].some((host) => hostMatches(hostname, host));
}

function providerFor(url: URL): Provider {
  if (hostMatches(url.hostname, 'tmall.com')) return 'tmall';
  if (hostMatches(url.hostname, 'taobao.com') || hostMatches(url.hostname, 'tb.cn')) return 'taobao';
  if (hostMatches(url.hostname, 'jd.com') || hostMatches(url.hostname, '3.cn') || hostMatches(url.hostname, 'jd.hk')) return 'jd';
  if (hostMatches(url.hostname, 'dw4.co') || hostMatches(url.hostname, 'dewu.com')) return 'dewu';
  return 'generic';
}

function sharedTitle(text: string) {
  const patterns = [
    /「([^」]{2,240})」/,
    /“([^”]{2,240})”/,
    /"([^"\n]{2,240})"/,
    /https?:\/\/\S+\s+(.{2,240}?)(?:[，,]\s*点击链接|$)/,
  ];
  for (const pattern of patterns) {
    const value = compact(text.match(pattern)?.[1]);
    if (value) return value;
  }
  return '';
}

function externalId(provider: Provider, url: URL) {
  if (provider === 'taobao' || provider === 'tmall') {
    return url.searchParams.get('id') || url.pathname.match(/(?:i|item\/)(\d{6,})/i)?.[1];
  }
  if (provider === 'jd') {
    return url.searchParams.get('sku') || url.searchParams.get('skuId') || url.pathname.match(/\/(\d{5,})(?:\.html)?/i)?.[1];
  }
  if (provider === 'dewu') return url.searchParams.get('spuId') || undefined;
  return undefined;
}

async function fetchFollowingSafeRedirects(initial: URL, init: RequestInit = {}, maxRedirects = 4) {
  let url = initial;
  for (let index = 0; index <= maxRedirects; index += 1) {
    if (!allowedFetchHost(url.hostname)) throw new PreviewError('host_not_allowed', '该网站尚未加入可解析域名列表');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url };
    const location = response.headers.get('location');
    if (!location) return { response, url };
    url = validateUrl(new URL(location, url).toString());
  }
  throw new PreviewError('too_many_redirects', '商品链接重定向次数过多');
}

function timestamp() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

function signMd5(secret: string, params: Record<string, string>) {
  const body = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join('');
  return (md5 as (value: string) => string)(`${secret}${body}${secret}`).toUpperCase();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readTextLimited(response: Response, maxBytes: number) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new PreviewError('page_too_large', '商品页面体积过大');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

async function readBytesLimited(response: Response, maxBytes: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new PreviewError('image_too_large', '商品图片体积过大');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function embeddedProductUrl(html: string, baseUrl: URL) {
  const decoded = decodeEntities(html).replace(/\\\//g, '/');
  const patterns = [
    /https?:\/\/item\.taobao\.com\/item\.htm\?[^'"<>\s]+/i,
    /https?:\/\/detail\.tmall\.com\/item\.htm\?[^'"<>\s]+/i,
    /https?:\/\/item\.jd\.com\/\d+\.html[^'"<>\s]*/i,
  ];
  for (const pattern of patterns) {
    const value = decoded.match(pattern)?.[0];
    if (!value) continue;
    try {
      const candidate = validateUrl(new URL(value, baseUrl).toString());
      if (allowedFetchHost(candidate.hostname)) return candidate;
    } catch {}
  }
  return undefined;
}

function allObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
    try { return allObjects(JSON.parse(value), depth + 1); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap((entry) => allObjects(entry, depth + 1));
  if (typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [object, ...Object.values(object).flatMap((entry) => allObjects(entry, depth + 1))];
}

function pickObject(value: unknown, titleKeys: string[]) {
  return allObjects(value).map((object) => ({
    object,
    score: titleKeys.reduce((score, key) => score + (compact(object[key]) ? 5 : 0), 0)
      + ['price', 'zk_final_price', 'priceInfo', 'image', 'pict_url', 'imageInfo'].reduce((score, key) => score + (object[key] != null ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score)[0]?.object;
}

function firstText(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = compact(object[key]);
    if (value && value !== '[object Object]') return value;
  }
  return '';
}

function firstNumber(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = finite(object[key]);
    if (value != null) return value;
  }
  return undefined;
}

function firstImage(object: Record<string, unknown>) {
  const direct = firstText(object, ['pict_url', 'picUrl', 'imageUrl', 'image', 'mainImage']);
  if (/^\/\//.test(direct)) return `https:${direct}`;
  if (/^https?:\/\//i.test(direct)) return direct;
  const imageInfo = object.imageInfo as Record<string, unknown> | undefined;
  const imageList = imageInfo?.imageList;
  if (Array.isArray(imageList)) {
    const candidate = imageList.map((entry) => compact((entry as Record<string, unknown>)?.url)).find((url) => /^https?:\/\//i.test(url));
    if (candidate) return candidate;
  }
  return undefined;
}

function titleScore(expected: string, candidate: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const left = normalize(expected);
  const right = normalize(candidate);
  if (!left || !right) return 0;
  if (left === right) return 10_000;
  if (left.includes(right) || right.includes(left)) return 5000 + Math.min(left.length, right.length);
  const grams = new Set(Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)));
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) if (grams.has(right.slice(index, index + 2))) overlap += 1;
  return overlap / Math.max(1, Math.max(left.length, right.length));
}

function weightKg(value: unknown, unitHint = '') {
  const number = finite(value);
  if (number == null) return undefined;
  const hint = `${value ?? ''} ${unitHint}`.toLowerCase();
  if (/\bmg\b|毫克/.test(hint)) return number / 1_000_000;
  if (/\bg\b|克/.test(hint) && !/kg|千克|公斤/.test(hint)) return number / 1000;
  if (/\blb\b|磅/.test(hint)) return number * 0.45359237;
  return number;
}

async function taobaoPreview(url: URL, provider: 'taobao' | 'tmall', id: string): Promise<Preview> {
  const appKey = env('TAOBAO_APP_KEY');
  const appSecret = env('TAOBAO_APP_SECRET');
  if (!appKey || !appSecret) throw new PreviewError('provider_not_configured', '淘宝开放平台尚未配置');
  const method = env('TAOBAO_API_METHOD') || 'taobao.tbk.item.info.get';
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    timestamp: timestamp(),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
  };
  const session = env('TAOBAO_SESSION');
  if (session) params.session = session;
  if (method === 'taobao.item.get') {
    params.num_iid = id;
    params.fields = env('TAOBAO_ITEM_FIELDS') || 'num_iid,title,pic_url,price,weight,brand,props_name,item_url';
  } else {
    params.num_iids = id;
    params.platform = '2';
  }
  params.sign = signMd5(appSecret, params);
  const response = await fetchWithTimeout(env('TAOBAO_API_URL') || 'https://eco.taobao.com/router/rest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  if (!response.ok || (data as Record<string, unknown>)?.error_response) {
    const apiError = (data as Record<string, unknown>)?.error_response as Record<string, unknown> | undefined;
    console.error('[gear-link-preview] taobao api error', compact(apiError?.code), compact(apiError?.sub_code), compact(apiError?.msg), compact(apiError?.sub_msg));
    throw new PreviewError('provider_error', '淘宝开放平台没有返回可用的商品信息');
  }
  const object = pickObject(data, ['title', 'name', 'item_title']);
  const name = object ? firstText(object, ['title', 'name', 'item_title']) : '';
  if (!object || !name) throw new PreviewError('product_not_found', '淘宝开放平台未找到该商品');
  const price = firstNumber(object, ['zk_final_price', 'price', 'reserve_price', 'coupon_price']);
  const brand = firstText(object, ['brand', 'brand_name']);
  const category = firstText(object, ['cat_name', 'category_name']);
  const weight = weightKg(object.weight, compact(object.weight_unit));
  return {
    provider,
    sourceUrl: url.toString(),
    externalId: id,
    name,
    priceCny: price,
    weightKg: weight,
    imageUrl: firstImage(object),
    brand: brand || undefined,
    category: category || undefined,
    attrs: [[brand ? '品牌' : '', brand], [category ? '平台分类' : '', category]].filter(([key, value]) => key && value) as [string, string][],
    warnings: weight == null ? ['平台未提供可靠的商品净重，请手动确认'] : [],
  };
}

async function taobaoMaterialSearch(url: URL, provider: 'taobao' | 'tmall', query: string, fallbackId?: string): Promise<Preview> {
  const appKey = env('TAOBAO_APP_KEY');
  const appSecret = env('TAOBAO_APP_SECRET');
  const adzoneId = env('TAOBAO_ADZONE_ID');
  if (!appKey || !appSecret) throw new PreviewError('provider_not_configured', '淘宝开放平台尚未配置');
  if (!adzoneId) throw new PreviewError('adzone_not_configured', '淘宝推广位尚未配置');
  const method = env('TAOBAO_MATERIAL_SEARCH_METHOD') || 'taobao.tbk.dg.material.optional.upgrade';
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    timestamp: timestamp(),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    q: query.slice(0, 200),
    adzone_id: adzoneId,
    page_no: '1',
    page_size: '20',
    material_id: env('TAOBAO_MATERIAL_ID') || '80309',
    biz_scene_id: env('TAOBAO_BIZ_SCENE_ID') || '1',
  };
  params.sign = signMd5(appSecret, params);
  const response = await fetchWithTimeout(env('TAOBAO_API_URL') || 'https://eco.taobao.com/router/rest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  const apiError = (data as Record<string, unknown>)?.error_response as Record<string, unknown> | undefined;
  if (!response.ok || apiError) {
    console.error('[gear-link-preview] taobao material search error', compact(apiError?.code), compact(apiError?.sub_code), compact(apiError?.msg), compact(apiError?.sub_msg));
    throw new PreviewError('material_search_failed', '淘宝物料搜索没有返回可用的商品信息');
  }
  const candidates = allObjects(data).filter((object) => object.item_basic_info && typeof object.item_basic_info === 'object');
  const selected = candidates.map((object) => {
    const basic = object.item_basic_info as Record<string, unknown>;
    return { object, score: titleScore(query, compact(basic.title)) };
  }).sort((left, right) => right.score - left.score)[0]?.object;
  if (!selected) throw new PreviewError('product_not_found', '淘宝物料搜索未找到该商品');
  const basic = selected.item_basic_info as Record<string, unknown>;
  const priceInfo = selected.price_promotion_info as Record<string, unknown> | undefined;
  const name = firstText(basic, ['title', 'short_title']);
  if (!name) throw new PreviewError('product_not_found', '淘宝物料搜索未找到商品标题');
  const brand = firstText(basic, ['brand_name', 'brand']);
  const category = firstText(basic, ['category_name', 'level_one_category_name']);
  const shop = firstText(basic, ['shop_title']);
  const image = firstImage(basic) || firstText(basic, ['white_image']);
  const itemId = firstText(selected, ['item_id']) || fallbackId;
  return {
    provider,
    sourceUrl: url.toString(),
    externalId: itemId,
    name,
    priceCny: firstNumber(priceInfo || {}, ['final_promotion_price', 'zk_final_price', 'reserve_price']),
    imageUrl: /^\/\//.test(image) ? `https:${image}` : (/^https?:\/\//i.test(image) ? image : undefined),
    brand: brand || undefined,
    category: category || undefined,
    attrs: [
      [brand ? '品牌' : '', brand],
      [category ? '平台分类' : '', category],
      [shop ? '店铺' : '', shop],
    ].filter(([key, value]) => key && value) as [string, string][],
    warnings: ['淘宝联盟未提供可靠的商品净重，请手动确认'],
  };
}

async function jdPreview(url: URL, id: string): Promise<Preview> {
  const appKey = env('JD_APP_KEY');
  const appSecret = env('JD_APP_SECRET');
  if (!appKey || !appSecret) throw new PreviewError('provider_not_configured', '京东开放平台尚未配置');
  const method = env('JD_API_METHOD') || 'jd.union.open.goods.promotiongoodsinfo.query';
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    timestamp: timestamp(),
    format: 'json',
    v: '1.0',
    sign_method: 'md5',
    '360buy_param_json': JSON.stringify({ skuIds: id }),
  };
  const token = env('JD_ACCESS_TOKEN');
  if (token) params.access_token = token;
  params.sign = signMd5(appSecret, params);
  const response = await fetchWithTimeout(env('JD_API_URL') || 'https://api.jd.com/routerjson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(params),
  });
  const data = await response.json();
  if (!response.ok) throw new PreviewError('provider_error', '京东开放平台没有返回可用的商品信息');
  const object = pickObject(data, ['skuName', 'goodsName', 'wareName', 'name']);
  const name = object ? firstText(object, ['skuName', 'goodsName', 'wareName', 'name']) : '';
  if (!object || !name) throw new PreviewError('product_not_found', '京东开放平台未找到该商品');
  const priceInfo = object.priceInfo as Record<string, unknown> | undefined;
  const price = firstNumber(priceInfo || object, ['price', 'lowestPrice', 'wlPrice', 'unitPrice']);
  const brand = firstText(object, ['brandName', 'brand']);
  const category = firstText(object, ['categoryName', 'cidName', 'category']);
  const rawWeight = object.weight ?? object.productWeight ?? object.netWeight;
  const weight = weightKg(rawWeight, compact(object.weightUnit));
  return {
    provider: 'jd',
    sourceUrl: url.toString(),
    externalId: id,
    name,
    priceCny: price,
    weightKg: weight,
    imageUrl: firstImage(object),
    brand: brand || undefined,
    category: category || undefined,
    attrs: [[brand ? '品牌' : '', brand], [category ? '平台分类' : '', category]].filter(([key, value]) => key && value) as [string, string][],
    warnings: weight == null ? ['平台未提供可靠的商品净重，请手动确认'] : [],
  };
}

function decodeEntities(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  return decodeEntities(compact(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean)));
}

function jsonLdProducts(html: string) {
  const results: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      results.push(...allObjects(parsed).filter((object) => compact(object['@type']).toLowerCase() === 'product'));
    } catch {}
  }
  return results;
}

function embeddedJsonValue(html: string, key: string) {
  const marker = `"${key}":`;
  let offset = 0;
  while (offset < html.length) {
    const markerIndex = html.indexOf(marker, offset);
    if (markerIndex < 0) return undefined;
    let start = markerIndex + marker.length;
    while (/\s/.test(html[start] || '')) start += 1;
    const opener = html[start];
    const closer = opener === '{' ? '}' : opener === '[' ? ']' : '';
    if (!closer) {
      offset = start + 1;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < html.length; index += 1) {
      const char = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === opener) depth += 1;
      else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(html.slice(start, index + 1)); } catch { break; }
        }
      }
    }
    offset = start + 1;
  }
  return undefined;
}

function dewuBrand(rawTitle: string) {
  const prefix = rawTitle.match(/^(.{2,40}?)\s{2,}/)?.[1]?.trim();
  return prefix && !/[，。！？]/.test(prefix) ? prefix : '';
}

function imageExtension(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpg';
}

async function persistDewuImage(sourceUrl: string, spuId: string, propertyValueId?: string) {
  const source = validateUrl(sourceUrl);
  if (!DEWU_IMAGE_HOSTS.some((host) => hostMatches(source.hostname, host))) {
    throw new PreviewError('image_host_not_allowed', '得物商品图片域名不受支持');
  }
  const response = await fetchWithTimeout(source.toString(), {
    headers: {
      'User-Agent': env('GEAR_LINK_USER_AGENT') || 'KaipaGearPreview/1.0 (+https://kaipa.app)',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
    },
  }, 10_000);
  if (!response.ok) throw new PreviewError('image_fetch_failed', `得物商品图片下载失败（${response.status}）`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(contentType)) throw new PreviewError('unsupported_image', '得物商品图片格式不受支持');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 8_000_000) throw new PreviewError('image_too_large', '得物商品图片体积过大');
  const bytes = await readBytesLimited(response, 8_000_000);
  if (!bytes.byteLength) throw new PreviewError('empty_image', '得物商品图片内容为空');

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new PreviewError('storage_not_configured', '商品图片存储尚未配置');
  const bucket = env('GEAR_LINK_IMAGE_BUCKET') || 'gear-products';
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucketResult = await client.storage.getBucket(bucket);
  if (bucketResult.error) {
    const created = await client.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 8_000_000,
      allowedMimeTypes: allowedTypes,
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;
  }
  const suffix = propertyValueId?.replace(/[^0-9]/g, '') || 'cover';
  const storagePath = `dewu/${spuId.replace(/[^0-9]/g, '')}/${suffix}.${imageExtension(contentType)}`;
  const uploaded = await client.storage.from(bucket).upload(storagePath, bytes, {
    contentType,
    cacheControl: '2592000',
    upsert: true,
  });
  if (uploaded.error) throw uploaded.error;
  const publicBase = (env('SUPABASE_PUBLIC_URL') || supabaseUrl).replace(/\/$/, '');
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${publicBase}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function dewuPreview(url: URL, id: string): Promise<Preview> {
  const { response, url: resolved } = await fetchFollowingSafeRedirects(url, {
    headers: {
      'User-Agent': env('GEAR_LINK_USER_AGENT') || 'Mozilla/5.0 KaipaGearPreview/1.0',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
  });
  if (!response.ok) throw new PreviewError('page_fetch_failed', `得物商品页面访问失败（${response.status}）`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new PreviewError('unsupported_content', '链接不是可识别的得物商品页面');
  const html = await readTextLimited(response, 1_500_000);
  const detail = embeddedJsonValue(html, 'detail') as Record<string, unknown> | undefined;
  const basicParam = embeddedJsonValue(html, 'basicParam') as Record<string, unknown> | undefined;
  const spuImage = embeddedJsonValue(html, 'spuImage') as Record<string, unknown> | undefined;
  const rawTitle = typeof detail?.title === 'string' ? detail.title : '';
  const name = compact(rawTitle);
  if (!detail || !name) throw new PreviewError('product_not_found', '得物页面中没有找到商品信息');

  const resolvedId = compact(detail.spuId) || id;
  const propertyValueId = resolved.searchParams.get('propertyValueId') || undefined;
  const images = Array.isArray(spuImage?.images) ? spuImage.images as Record<string, unknown>[] : [];
  const selectedImages = propertyValueId
    ? images.filter((image) => compact(image.propertyValueId) === propertyValueId)
    : images;
  const image = [...selectedImages, ...images].find((candidate) => /^https?:\/\//i.test(compact(candidate.url)));
  const sourceImageUrl = compact(image?.url) || compact(detail.logoUrl);

  const rawAttrs = Array.isArray(basicParam?.basicList) ? basicParam.basicList as Record<string, unknown>[] : [];
  const attrs = rawAttrs.map((entry) => [compact(entry.key), compact(entry.value)] as [string, string])
    .filter(([key, value]) => key && value)
    .slice(0, 16);
  const category = compact(detail.categoryName);
  const brand = dewuBrand(rawTitle);
  if (brand && !attrs.some(([key]) => key === '品牌')) attrs.unshift(['品牌', brand]);
  if (category && !attrs.some(([key]) => key === '平台分类')) attrs.unshift(['平台分类', category]);
  const releasePrice = attrs.find(([key]) => key === '发售价格')?.[1];
  const price = finite(releasePrice) ?? finite(detail.authPrice);
  const weightEntry = attrs.find(([key]) => /净重|重量/.test(key));
  const weight = weightEntry ? weightKg(weightEntry[1]) : undefined;
  const warnings = ['价格来自得物发售价格，请按实际购买价格确认'];
  if (weight == null) warnings.push('得物未提供可靠的商品净重，请手动确认');

  let imageUrl: string | undefined;
  if (sourceImageUrl) {
    try {
      imageUrl = await persistDewuImage(sourceImageUrl, resolvedId, propertyValueId);
    } catch (error) {
      console.error('[gear-link-preview] dewu image persistence failed', error instanceof Error ? error.message : error);
      warnings.push('商品图片暂未保存到 Kaipa 存储，请稍后重试');
    }
  }
  return {
    provider: 'dewu',
    sourceUrl: resolved.toString(),
    externalId: resolvedId,
    name,
    priceCny: price,
    weightKg: weight,
    imageUrl,
    brand: brand || undefined,
    category: category || undefined,
    attrs,
    warnings,
  };
}

async function genericPreview(url: URL, provider: Provider): Promise<Preview> {
  const { response, url: resolved } = await fetchFollowingSafeRedirects(url, {
    headers: {
      'User-Agent': env('GEAR_LINK_USER_AGENT') || 'KaipaGearPreview/1.0 (+https://kaipa.app)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
  });
  if (!response.ok) throw new PreviewError('page_fetch_failed', `商品页面访问失败（${response.status}）`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new PreviewError('unsupported_content', '链接不是可识别的商品页面');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 1_500_000) throw new PreviewError('page_too_large', '商品页面体积过大');
  const html = await readTextLimited(response, 1_500_000);
  const product = jsonLdProducts(html)[0];
  const offers = product?.offers as Record<string, unknown> | undefined;
  const brandValue = product?.brand;
  const brand = compact(typeof brandValue === 'object' ? (brandValue as Record<string, unknown>)?.name : brandValue) || meta(html, 'product:brand');
  const name = compact(product?.name) || meta(html, 'og:title') || decodeEntities(compact(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]));
  if (!name) throw new PreviewError('product_not_found', '页面中没有找到商品信息');
  const imageValue = product?.image;
  const imageUrl = compact(Array.isArray(imageValue) ? imageValue[0] : typeof imageValue === 'object' ? (imageValue as Record<string, unknown>)?.url : imageValue) || meta(html, 'og:image');
  const price = finite(offers?.price) ?? finite(meta(html, 'product:price:amount'));
  const category = compact(product?.category);
  const weightValue = product?.weight;
  const weightObject = typeof weightValue === 'object' ? weightValue as Record<string, unknown> : undefined;
  const weight = weightKg(weightObject?.value ?? weightValue, compact(weightObject?.unitText ?? weightObject?.unitCode));
  return {
    provider,
    sourceUrl: resolved.toString(),
    externalId: externalId(provider, resolved),
    name,
    priceCny: price,
    weightKg: weight,
    imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,
    brand: brand || undefined,
    category: category || undefined,
    attrs: [[brand ? '品牌' : '', brand], [category ? '平台分类' : '', category]].filter(([key, value]) => key && value) as [string, string][],
    warnings: ['信息来自页面公开元数据，请在保存前确认'],
  };
}

async function resolvePreview(rawUrl: string, shareText = ''): Promise<Preview> {
  let url = validateUrl(rawUrl);
  let provider = providerFor(url);
  let id = externalId(provider, url);

  // Resolve short share links before selecting an official provider adapter.
  if (!id && allowedFetchHost(url.hostname)) {
    try {
      const resolved = await fetchFollowingSafeRedirects(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 KaipaGearPreview/1.0' } });
      url = resolved.url;
      provider = providerFor(url);
      id = externalId(provider, url);
      if (!id && (provider === 'taobao' || provider === 'tmall' || provider === 'jd')) {
        const contentType = resolved.response.headers.get('content-type') || '';
        if (resolved.response.ok && contentType.includes('text/html')) {
          const html = await readTextLimited(resolved.response, 300_000);
          const embedded = embeddedProductUrl(html, url);
          if (embedded) {
            url = embedded;
            provider = providerFor(url);
            id = externalId(provider, url);
          }
        }
      } else {
        try { await resolved.response.body?.cancel(); } catch {}
      }
    } catch {}
  }

  let officialError: PreviewError | undefined;
  const pastedTitle = sharedTitle(shareText);
  try {
    if ((provider === 'taobao' || provider === 'tmall') && id) return await taobaoPreview(url, provider, id);
    if (provider === 'jd' && id) return await jdPreview(url, id);
    if (provider === 'dewu' && id) return await dewuPreview(url, id);
  } catch (error) {
    officialError = error instanceof PreviewError ? error : new PreviewError('provider_error', '开放平台调用失败');
  }

  if ((provider === 'taobao' || provider === 'tmall') && pastedTitle) {
    try {
      return await taobaoMaterialSearch(url, provider, pastedTitle, id);
    } catch (error) {
      const materialError = error instanceof PreviewError ? error : new PreviewError('material_search_failed', '淘宝物料搜索调用失败');
      console.error('[gear-link-preview] material search fallback', materialError.code, materialError.message);
      if (!officialError || officialError.code === 'provider_not_configured') officialError = materialError;
    }
  }

  if (provider === 'dewu' && officialError) {
    if (pastedTitle) {
      return {
        provider,
        sourceUrl: url.toString(),
        externalId: id,
        name: pastedTitle,
        attrs: [],
        warnings: ['得物商品页暂未返回完整数据，已使用分享文案预填，请手动确认图片、重量和价格'],
      };
    }
    throw officialError;
  }

  try {
    return await genericPreview(url, provider);
  } catch (error) {
    if (pastedTitle) {
      return {
        provider,
        sourceUrl: url.toString(),
        externalId: id,
        name: pastedTitle,
        priceCny: finite(url.searchParams.get('price')),
        attrs: [],
        warnings: [
          officialError
            ? '淘宝开放平台暂未返回该商品，已使用分享文案预填，请手动确认图片、重量和价格'
            : '已使用分享文案预填，请手动确认图片、重量和价格',
        ],
      };
    }
    if (officialError?.code === 'provider_not_configured') throw officialError;
    if (officialError) throw officialError;
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);
  try {
    const body = await req.json() as { url?: unknown; text?: unknown };
    const preview = await resolvePreview(typeof body.url === 'string' ? body.url : '', typeof body.text === 'string' ? body.text.slice(0, 5000) : '');
    return json({ item: preview });
  } catch (error) {
    const known = error instanceof PreviewError ? error : new PreviewError('internal_error', '商品识别暂时不可用', 500);
    console.error('[gear-link-preview]', known.code, known.message);
    return json({ error: { code: known.code, message: known.message } }, known.status);
  }
});
