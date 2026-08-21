import { validateDeletionTargets } from './deletion.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorMessage(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected operation to throw');
}

Deno.test('validateDeletionTargets accepts an unchanged selection', () => {
  const requested = [{ id: 'one', label: '营地' }, { id: 'two', label: '头灯' }];
  const ids = validateDeletionTargets(requested, [...requested], '项目已变化');
  assert(ids.join(',') === 'one,two', 'expected unchanged target IDs');
});

Deno.test('validateDeletionTargets rejects duplicate IDs', () => {
  const requested = [{ id: 'one', label: '营地' }, { id: 'one', label: '营地' }];
  assert(errorMessage(() => validateDeletionTargets(requested, [requested[0]], '项目已变化')).includes('重复 ID'), 'expected duplicate ID error');
});

Deno.test('validateDeletionTargets rejects stale or out-of-scope items', () => {
  const requested = [{ id: 'one', label: '旧名称' }];
  const found = [{ id: 'one', label: '新名称' }];
  assert(errorMessage(() => validateDeletionTargets(requested, found, '项目已变化')) === '项目已变化', 'expected renamed item rejection');
  assert(errorMessage(() => validateDeletionTargets(requested, [], '项目已变化')) === '项目已变化', 'expected missing item rejection');
});
