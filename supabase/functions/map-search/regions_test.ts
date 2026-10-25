import { assertEquals } from 'jsr:@std/assert';
import { parseRegionTips } from './regions.ts';

// Trimmed from a live inputtips response for 朝阳.
const chaoyang = [
  { name: '朝阳市', district: '辽宁省朝阳市', typecode: '190104' },
  { name: '朝阳区', district: '北京市朝阳区', typecode: '190105' },
  { name: '朝阳县', district: '辽宁省朝阳市朝阳县', typecode: '190105' },
  { name: '朝阳区', district: '吉林省长春市朝阳区', typecode: '190105' },
  { name: '潮阳区', district: '广东省汕头市潮阳区', typecode: '190105' },
  { name: '北票市', district: '辽宁省朝阳市北票市', typecode: '190105' },
  { name: '义县', district: '辽宁省锦州市义县', typecode: '190105' },
];

Deno.test('region tips keep areas matching the query with their parents', () => {
  assertEquals(parseRegionTips(chaoyang, '朝阳'), [
    { name: '朝阳市', parent: '辽宁省', place: '辽宁省朝阳市' },
    { name: '朝阳区', parent: '北京市', place: '北京市朝阳区' },
    { name: '朝阳县', parent: '辽宁省朝阳市', place: '辽宁省朝阳市朝阳县' },
    { name: '朝阳区', parent: '吉林省长春市', place: '吉林省长春市朝阳区' },
    { name: '北票市', parent: '辽宁省朝阳市', place: '辽宁省朝阳市北票市' },
  ]);
});

Deno.test('region tips drop non-area typecodes, duplicates and malformed rows', () => {
  assertEquals(parseRegionTips([
    { name: '成都东站', district: '四川省成都市成华区', typecode: '150200' },
    { name: '成都市', district: '四川省成都市', typecode: '190104' },
    { name: '成都市', district: '四川省成都市', typecode: '190104' },
    { name: '', district: '四川省', typecode: '190102' },
    null,
    { name: 42 },
  ], '成都'), [{ name: '成都市', parent: '四川省', place: '四川省成都市' }]);
  assertEquals(parseRegionTips(undefined, '成都'), []);
});

Deno.test('a municipality has no parent', () => {
  assertEquals(parseRegionTips([{ name: '北京市', district: '北京市', typecode: '190103' }], '北京'),
    [{ name: '北京市', parent: '', place: '北京市' }]);
});
