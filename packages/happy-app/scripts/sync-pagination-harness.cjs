// Run the actual pagination methods without booting native storage, purchases,
// push notifications, or the global Sync singleton. Shared by unit/browser tests.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.createSourceFile('sync.ts', fs.readFileSync(
    path.resolve(__dirname, '../sources/sync/sync.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const syncClass = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'Sync');
const names = new Set(['fetchMessages', 'fetchInitialLatestPage', 'fetchForwardSince', 'loadOlderMessages']);
const members = syncClass.members.filter(node => names.has(node.name?.getText(source))
    || node.name?.getText(source) === 'prefetchOlderMessagesInBackground');
for (const name of names) {
    if (!members.some(node => node.name?.getText(source) === name)) throw new Error('Missing Sync method: ' + name);
}
const sentinel = source.statements.find(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(d => d.name.getText(source) === 'SEQ_BACKWARD_INITIAL_SENTINEL'));
const compiled = ts.transpileModule(`${sentinel.getText(source)}\nclass Pagination {
    ${members.map(node => node.getText(source)).join('\n')}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

exports.createPaginationHarness = (onPage = () => {}) => {
    const entry = { hasMoreOlder: false, isLoadingOlder: false, isLoaded: false };
    const requests = [];
    const pages = [];
    let failNext = false;
    const state = {
        sessionMessages: { chat: entry },
        applyMessagesLoaded: () => { entry.isLoaded = true; },
        applyOlderMessagesPagination: (_id, pagination) => { entry.hasMoreOlder = pagination.hasMore; },
        applyOlderMessagesLoading: (_id, loading) => { entry.isLoadingOlder = loading; },
    };
    const apiSocket = { request: async url => {
        requests.push(url);
        if (failNext) { failNext = false; return { ok: false, status: 503 }; }
        const query = new URL(url, 'http://fixture').searchParams;
        const before = Number(query.get('before_seq'));
        const after = Number(query.get('after_seq'));
        const start = query.has('after_seq') ? after + 1 : Math.max(1, Math.min(before, 1001) - 100);
        const count = query.has('after_seq') ? 2 : Math.min(100, before - 1);
        const messages = Array.from({ length: count }, (_, index) => ({ id: 'row-' + (start + index), seq: start + index }));
        return { ok: true, json: async () => ({ messages, hasMore: query.has('before_seq') && start > 1 }) };
    } };
    const Pagination = new Function('storage', 'apiSocket', 'log', compiled + '\nreturn Pagination;')(
        { getState: () => state }, apiSocket, { log: () => {} });
    const sync = new Pagination();
    let queue = Promise.resolve();
    Object.assign(sync, {
        sessionLastSeq: new Map(), sessionOldestSeq: new Map(),
        encryption: { getSessionEncryption: () => ({}) },
        getSessionMessageLock: () => ({ inLock: action => {
            const result = queue.then(action);
            queue = result.catch(() => {});
            return result;
        } }),
        applyFetchedMessages: async (_id, _encryption, messages) => {
            pages.push(messages);
            await onPage(messages);
        },
    });
    return { sync, entry, requests, pages, failNext: () => { failNext = true; } };
};
