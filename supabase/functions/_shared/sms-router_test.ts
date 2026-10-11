import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { sendWithFailover } from './sms-router.ts';

Deno.test('SMS router fails over in configured order', async () => {
  const used: string[] = [];
  const result = await sendWithFailover({ requestId: 'r1', phone: '+8613800000000', code: '123456' }, [
    { name: 'tencent', send: async () => { used.push('tencent'); throw new Error('down'); } },
    { name: 'volcano', send: async () => { used.push('volcano'); } },
  ]);
  assertEquals(used, ['tencent', 'volcano']);
  assertEquals(result, { provider: 'volcano' });
});

Deno.test('SMS router does not silently accept an empty route', async () => {
  await assertRejects(() => sendWithFailover({ requestId: 'r2', phone: '+8613800000000', code: '123456' }, []), Error, 'no SMS providers configured');
});
