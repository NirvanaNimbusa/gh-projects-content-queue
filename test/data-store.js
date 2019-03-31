import test from 'ava';
import DataStore from '../lib/data-store';
import sinon from 'sinon';

test.before((t) => {
    t.context.clock = sinon.useFakeTimers();
    t.context.clock.tick(10000);
});
test.after((t) => {
    t.context.clock.restore();
});

test('constructor', (t) => {
    const CACHE_TIME = 3000;
    const fetcher = sinon.spy();
    const ds = new DataStore(fetcher, CACHE_TIME);

    t.is(ds.cacheTime, CACHE_TIME);
    t.false(fetcher.called);
    t.true(ds.lastUpdate < Date.now() - CACHE_TIME);
    t.is(ds.fetch, fetcher);
});

test('cache expired without any fetched data', (t) => {
    const fetcher = sinon.spy();
    const ds = new DataStore(fetcher);

    t.true(ds.cacheExpired);
});

test('get data without cache', async (t) => {
    const DATA = 'lorem ipsum';
    const fetcher = sinon.spy(() => Promise.resolve(DATA));

    const ds = new DataStore(fetcher);

    const p = await ds.getData();
    t.true(fetcher.calledOnce);
    t.is(fetcher.lastCall.args[0], undefined);
    t.is(p, DATA);
});

// These tests are serial since they rely on clock behaviour for cache invalidation.
test.serial('get data from cache', async (t) => {
    const DATA = 'lorem ipsum';
    const fetcher = sinon.spy(() => Promise.resolve(DATA));

    const ds = new DataStore(fetcher);

    const p = await ds.getData();
    t.true(fetcher.calledOnce);
    t.is(p, DATA);

    const q = await ds.getData();
    t.true(fetcher.calledOnce);
    t.is(q, DATA);
});

test.serial('get data from expired cache', async (t) => {
    const DATA = 'lorem ipsum';
    const CACHE_TIME = 3000;
    const fetcher = sinon.spy(() => Promise.resolve(DATA));

    const ds = new DataStore(fetcher, CACHE_TIME);

    const p = await ds.getData();
    t.true(fetcher.calledOnce);
    t.is(p, DATA);

    t.context.clock.tick(CACHE_TIME + 1);

    const q = await ds.getData();
    t.true(fetcher.calledTwice);
    t.is(fetcher.lastCall.args[0], DATA);
    t.is(q, DATA);
});

test.serial('cache expired due to time', async (t) => {
    const CACHE_TIME = 3000;
    const fetcher = sinon.spy(() => Promise.resolve());
    const ds = new DataStore(fetcher, CACHE_TIME);

    await ds.getData();

    t.context.clock.tick(CACHE_TIME + 1);

    t.true(ds.cacheExpired);
});

test.serial('cache expired false', async (t) => {
    const fetcher = sinon.spy(() => Promise.resolve());
    const ds = new DataStore(fetcher);

    await ds.getData();

    t.false(ds.cacheExpired);
});

test('fetch callback only gets called once while loading data', async (t) => {
    let res;
    const fetcher = sinon.spy(() => {
        return new Promise((resolve) => {
            res = resolve;
        });
    });

    const ds = new DataStore(fetcher);

    const p = ds.getData();
    t.true(fetcher.calledOnce);
    t.is(typeof p.then, 'function');

    const q = ds.getData();
    t.true(fetcher.calledOnce);
    t.is(typeof q.then, 'function');

    res();
    await Promise.all([ p, q ]);

    t.true(fetcher.calledOnce);
});

test('Throwing fetcher aborts current loading', async (t) => {
    const fetcher = sinon.stub();
    fetcher.rejects();

    const ds = new DataStore(fetcher);

    await t.throwsAsync(ds.getData());
    t.true(fetcher.calledOnce);

    fetcher.resolves();

    await t.notThrowsAsync(ds.getData());
    t.true(fetcher.calledTwice);
});
