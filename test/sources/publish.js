import test from 'ava';
import PublishSource from '../../lib/sources/publish';
import { getBoard, getAccountManager, getColumn } from '../_stubs';
import sinon from 'sinon';

// Ensure update manager never calls update during tests unless we explicitly want it to.
test.before((t) => {
    t.context.clock = sinon.useFakeTimers();
});

test.after((t) => {
    t.context.clock.restore();
});

const getArgs = () => {
    const board = getBoard({
        'Foo': 1,
        'Bar': 2
    });
    return [
        board.repo,
        getAccountManager(),
        board,
        {
            columns: {
                target: 'Foo',
                source: 'Bar'
            },
            schedule: [],
            accountType: 'twitter',
            accountName: 'lorem'
        },
        () => Promise.resolve([ getColumn(1, 'Foo') ])
    ];
};

test('columns', (t) => {
    t.is(PublishSource.requiredColumns.length, 2);
    t.true(PublishSource.requiredColumns.includes('target'));
    t.true(PublishSource.requiredColumns.includes('source'));
});

test('managed columns', (t) => {
    t.is(PublishSource.managedColumns.length, 1);
    t.true(PublishSource.managedColumns.includes('target'));
});

test('constructor', (t) => {
    const source = new PublishSource(...getArgs());

    t.true("lastUpdate" in source);
    t.is(source.lastUpdate, Date.now());
});

test.todo('events');
test.todo('init');
test.todo('tweet');
test.todo('getUTCHourMinuteDate with fictures');

test.serial('getUTCHourMinuteDate', (t) => {
    const now = new Date();

    t.is(PublishSource.getUTCHourMinuteDate(now.getUTCHours(), now.getUTCMinutes()), now.getTime());
});

test('get current quota is infinite without schedule', (t) => {
    const source = new PublishSource(...getArgs());

    source._config.schedule.length = 0;

    const quota = source.getCurrentQuota();

    t.is(quota, Infinity);
});

test.serial('get current quota', (t) => {
    const source = new PublishSource(...getArgs());

    source._config.schedule.length = 0;
    const now = new Date();
    source._config.schedule.push(`${now.getUTCHours()}:${now.getUTCMinutes() + 1}`);
    source._config.schedule.push(`${now.getUTCHours() + 1}:${now.getUTCMinutes()}`);
    source._config.schedule.push(`${now.getUTCHours() - 1}:${now.getUTCMinutes()}`);
    source._config.schedule.push(`${now.getUTCHours() - 1}:00}`);

    t.context.clock.tick(3700001);

    const quota = source.getCurrentQuota();

    t.is(quota, 2);
});

test.failing('card published', async (t) => { //TODO method moved
    const args = getArgs();
    const source = new PublishSource(...args);
    args[0].board.moveCardToColumn.resolves();
    const column = getColumn("1", 'test');
    const url = 'https://example.com';
    const card = {
        id: "2",
        comment: sinon.stub(),
        issue: {
            close: sinon.stub()
        },
        content: {}
    };
    card.comment.resolves();
    card.issue.close.resolves();
    column.addCard.resolves();

    await source.cardPublished(card, url, column);

    t.true(args[0].board.moveCardToColumn.called);
    t.true(card.comment.calledOnce);
    t.true(card.comment.lastCall.args[0].includes(url));
    t.true(card.issue.close.called);
});
