import { assertEquals } from 'jsr:@std/assert';
import { douyinProduct, douyinSharedTitle, parseDouyinTarget } from './douyin.ts';

const SHARE_URL = new URL('https://v.douyin.com/uu0xsmmtBrA/');

function locationWith(params: Record<string, string>) {
  const url = new URL('https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

const GOODS_DETAIL = {
  title: '箴宝原装双Type-c头PD数据线传输公对公适用华为荣耀OPPO手机快充',
  sales: 40514,
  img: {
    uri: 'ecom-shop-material/png_m_03d862b68ac60e14a73d7c6a3045219c_sx_190574_www800-800',
    url_list: [
      'https://p3-item.ecombdimg.com/img/ecom-shop-material/x~tplv-5mmsx3fupr-image.jpeg',
      'https://p26-item.ecombdimg.com/img/ecom-shop-material/x~tplv-5mmsx3fupr-image.jpeg',
    ],
    width: 0,
    height: 0,
  },
  min_price: 488,
  max_price: 488,
};

Deno.test('share Location yields id, name, price and image', () => {
  const location = locationWith({ id: '3724427023129641398', goods_detail: JSON.stringify(GOODS_DETAIL) });
  const target = parseDouyinTarget(location, SHARE_URL);
  assertEquals(target?.id, '3724427023129641398');
  const product = douyinProduct(target?.goodsDetail ?? {});
  assertEquals(product?.name, GOODS_DETAIL.title);
  assertEquals(product?.priceCny, 4.88);
  assertEquals(product?.imageSourceUrl, 'https://p3-item.ecombdimg.com/img/ecom-shop-material/x~tplv-5mmsx3fupr-image.jpeg');
  assertEquals(product?.warnings, ['价格来自抖音商品页，请按实际购买价格确认', '抖音未提供可靠的商品净重，请手动确认']);
});

Deno.test('multi-SKU range keeps the minimum and warns about the span', () => {
  const goods = { ...GOODS_DETAIL, min_price: 1380, max_price: 1580 };
  const target = parseDouyinTarget(locationWith({ id: '3570506094583405543', goods_detail: JSON.stringify(goods) }), SHARE_URL);
  const product = douyinProduct(target?.goodsDetail ?? {});
  assertEquals(product?.priceCny, 13.8);
  assertEquals(product?.warnings[0], '抖音该商品不同规格价格不同，最低 13.80 元、最高 15.80 元，已按最低规格填写，请确认实际购买价格');
});

Deno.test('a Location without goods_detail still names the product id', () => {
  const target = parseDouyinTarget(locationWith({ id: '3699651046809927943' }), SHARE_URL);
  assertEquals(target?.id, '3699651046809927943');
  assertEquals(target?.goodsDetail, undefined);
});

Deno.test('foreign hosts, missing ids and broken payloads are ignored', () => {
  const encoded = encodeURIComponent(JSON.stringify(GOODS_DETAIL));
  assertEquals(parseDouyinTarget(`https://evil.example.com/detail?id=3724427023129641398&goods_detail=${encoded}`, SHARE_URL), undefined);
  assertEquals(parseDouyinTarget(locationWith({ goods_detail: JSON.stringify(GOODS_DETAIL) }), SHARE_URL), undefined);
  assertEquals(parseDouyinTarget(locationWith({ id: '3724427023129641398', goods_detail: '{not json' }), SHARE_URL)?.goodsDetail, undefined);
  assertEquals(parseDouyinTarget('', SHARE_URL), undefined);
});

Deno.test('share text title keeps the product line and drops the shop tag', () => {
  assertEquals(
    douyinSharedTitle('7.69 wfB:/ d@N.wF 02/20 【抖音商城】https://v.douyin.com/uu0xsmmtBrA/ 箴宝原装双Type-c头PD数据线传输公对公适用华为荣耀OPPO手机快充\n长按复制此条消息，打开抖音搜索，查看商品详情！:6pm'),
    '箴宝原装双Type-c头PD数据线传输公对公适用华为荣耀OPPO手机快充',
  );
  assertEquals(
    douyinSharedTitle('9.76 qRK:/ y@T.YM 03/29 【抖音商城】https://v.douyin.com/ehGISOv_rfg/ 【坏果包赔】河南原产地纯沙地红薯新鲜好吃的红蜜薯产地直销\n长按复制此条消息，打开抖音搜索，查看商品详情！:2pm'),
    '【坏果包赔】河南原产地纯沙地红薯新鲜好吃的红蜜薯产地直销',
  );
  assertEquals(douyinSharedTitle('https://v.douyin.com/uu0xsmmtBrA/'), '');
});
