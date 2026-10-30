// douyin.ts — the network-free half of the 抖音商城 resolver. A Douyin mall
// share link answers with a 302 whose Location query already carries the whole
// product record (`goods_detail`), and the page behind that redirect is an
// empty SPA shell, so parsing is all there is to test.

export const DOUYIN_SHARE_HOSTS = ['douyin.com'];
export const DOUYIN_DETAIL_HOSTS = ['jinritemai.com'];
export const DOUYIN_IMAGE_HOSTS = ['ecombdimg.com'];
export const DOUYIN_DETAIL_BASE = 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html';

function matchesHost(hostname: string, allowed: string) {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export function isDouyinShareHost(hostname: string) {
  return DOUYIN_SHARE_HOSTS.some((host) => matchesHost(hostname, host));
}

export function isDouyinDetailHost(hostname: string) {
  return DOUYIN_DETAIL_HOSTS.some((host) => matchesHost(hostname, host));
}

export type DouyinGoodsDetail = {
  title?: unknown;
  min_price?: unknown;
  max_price?: unknown;
  img?: { url_list?: unknown };
};

export type DouyinTarget = {
  id: string;
  goodsDetail: DouyinGoodsDetail | undefined;
};

export type DouyinProduct = {
  name: string;
  priceCny?: number;
  imageSourceUrl?: string;
  warnings: string[];
};

// Goods ids are 19-digit snowflakes; anything shorter is not one.
const PRODUCT_ID = /^\d{6,}$/;

/** The `goods_detail` record a product-detail URL carries in its query. */
export function douyinGoodsDetail(url: URL): DouyinGoodsDetail | undefined {
  const raw = url.searchParams.get('goods_detail');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as DouyinGoodsDetail : undefined;
  } catch {
    return undefined;
  }
}

/** The product id a Douyin detail URL carries, or '' when there is none. */
export function douyinProductId(url: URL) {
  const id = String(url.searchParams.get('id') ?? '').trim();
  return PRODUCT_ID.test(id) ? id : '';
}

/** Reduces a share link's `Location` header to the product id and record. */
export function parseDouyinTarget(location: string, baseUrl: URL): DouyinTarget | undefined {
  if (!location) return undefined;
  let url: URL;
  try {
    url = new URL(location, baseUrl);
  } catch {
    return undefined;
  }
  if (!isDouyinDetailHost(url.hostname)) return undefined;
  const id = douyinProductId(url);
  if (!id) return undefined;
  return { id, goodsDetail: douyinGoodsDetail(url) };
}

export function douyinSourceUrl(id: string) {
  return `${DOUYIN_DETAIL_BASE}?id=${encodeURIComponent(id)}`;
}

/** Prices in the share payload are 分; 488 means ¥4.88. */
function yuan(fen: unknown) {
  const value = Number(String(fen ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) / 100 : undefined;
}

export function douyinImageSourceUrl(goods: DouyinGoodsDetail | undefined) {
  const list = Array.isArray(goods?.img?.url_list) ? goods?.img?.url_list : [];
  const value = String(list.find((entry) => /^https?:\/\//i.test(String(entry ?? ''))) ?? '').trim();
  return value || undefined;
}

/** The share text's product title: the line after the link, without the shop tag. */
export function douyinSharedTitle(text: string) {
  const after = text.match(/https?:\/\/\S+\s+([^\n]{2,240})/i)?.[1] ?? '';
  const value = after.split('长按复制')[0].replace(/【抖音商城】/g, ' ').replace(/\s+/g, ' ').trim();
  return value.length >= 2 ? value : '';
}

export function douyinProduct(goods: DouyinGoodsDetail): DouyinProduct | undefined {
  const name = String(goods.title ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return undefined;
  const min = yuan(goods.min_price);
  const max = yuan(goods.max_price);
  const warnings: string[] = [];
  if (min != null && max != null && max > min) {
    warnings.push(`抖音该商品不同规格价格不同，最低 ${min.toFixed(2)} 元、最高 ${max.toFixed(2)} 元，已按最低规格填写，请确认实际购买价格`);
  } else {
    warnings.push('价格来自抖音商品页，请按实际购买价格确认');
  }
  warnings.push('抖音未提供可靠的商品净重，请手动确认');
  return { name, priceCny: min, imageSourceUrl: douyinImageSourceUrl(goods), warnings };
}
