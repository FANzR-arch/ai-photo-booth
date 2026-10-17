import test from 'node:test';
import assert from 'node:assert/strict';
import { packageMinutes, packageSummary, validPrice, visitPackage } from '../packages/shared/photo-packages';

test('a visit is one photo with an optional price of at most two decimals', () => {
    assert.deepEqual(visitPackage(), { count: 1 });
    assert.deepEqual(visitPackage(29.9), { count: 1, price: 29.9 });
    assert.ok(validPrice(undefined));
    assert.ok(validPrice(0));
    assert.ok(validPrice(49.5));
    assert.equal(validPrice(-1), false);
    assert.equal(validPrice(1.234), false);
    assert.equal(validPrice(10000), false);
    assert.equal(validPrice('29'), false);
});

test('home note shows the price only once staff set it', () => {
    assert.equal(packageMinutes(1), 2);
    assert.equal(packageSummary(visitPackage()), '');
    assert.equal(packageSummary(visitPackage(29)), '¥29 / 次');
    assert.equal(packageSummary(visitPackage(29.9)), '¥29.90 / 次');
    assert.equal(packageSummary(undefined), '');
});
