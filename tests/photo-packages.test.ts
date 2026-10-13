import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPackages, normalizePackages, packageMinutes, packageSummary, validPackages } from '../packages/shared/photo-packages';

test('photo packages accept up to four distinct counts with optional prices', () => {
    assert.ok(validPackages(defaultPackages));
    assert.ok(validPackages([{ count: 4, price: 39 }, { count: 6, price: 49.5 }]));
    assert.ok(validPackages([]));
    assert.equal(validPackages([{ count: 4 }, { count: 4 }]), false);
    assert.equal(validPackages([{ count: 0 }]), false);
    assert.equal(validPackages([{ count: 13 }]), false);
    assert.equal(validPackages([{ count: 4, price: -1 }]), false);
    assert.equal(validPackages([{ count: 4, price: 1.234 }]), false);
    assert.equal(validPackages([{ count: 1 }, { count: 2 }, { count: 3 }, { count: 4 }, { count: 5 }]), false);
    assert.deepEqual(normalizePackages([{ count: 6, price: 49, extra: 1 } as never, { count: 4 }]), [{ count: 4 }, { count: 6, price: 49 }]);
});

test('home summary states counts, rough total time and the lowest price only when prices are set', () => {
    assert.equal(packageMinutes(4), 6);
    assert.equal(packageSummary(defaultPackages), '可选 4–6 张 · 约 6–8 分钟');
    assert.equal(packageSummary([{ count: 4, price: 39 }, { count: 6, price: 49 }]), '可选 4–6 张 · 约 6–8 分钟 · ¥39 起');
    assert.equal(packageSummary([{ count: 5, price: 49 }]), '可选 5 张 · 约 7 分钟 · ¥49');
    assert.equal(packageSummary([]), '');
});
