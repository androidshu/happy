import { describe, expect, it } from 'vitest';
import { charSimilarity, createVoiceEchoFilter } from './voiceEchoFilter';

const SENT = '帮我把这个页面的样式调整一下，按钮改成圆角的';

describe('charSimilarity', () => {
    it('returns 1 for identical strings', () => {
        expect(charSimilarity('abcdef', 'abcdef')).toBe(1);
    });

    it('returns 0 for disjoint strings', () => {
        expect(charSimilarity('aaa', 'bbb')).toBe(0);
    });

    it('is high for near-duplicates', () => {
        const a = SENT;
        const b = '帮我把这个页面的样式调整一下按钮改成圆角的。';
        expect(charSimilarity(a, b)).toBeGreaterThan(0.9);
    });
});

describe('createVoiceEchoFilter', () => {
    it('discards an identical re-commit inside the window', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho(SENT, 1500)).toBe(true);
    });

    it('discards a near-duplicate (whitespace/punctuation drift)', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho('帮我把这个页面的样式调整一下，按钮改成圆角的。', 1500)).toBe(true);
    });

    it('keeps the filter armed after a hit (chunked re-commit)', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho(SENT, 1200)).toBe(true);
        expect(f.shouldDiscardEcho(SENT, 1800)).toBe(true);
    });

    it('ignores text after the window expires', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho(SENT, 4001)).toBe(false);
        // disarmed afterwards
        expect(f.shouldDiscardEcho(SENT, 4200)).toBe(false);
    });

    it('ignores short incoming text', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho('帮我', 1200)).toBe(false);
    });

    it('does not arm for short sent text', () => {
        const f = createVoiceEchoFilter();
        f.markSent('好的', 1000);
        expect(f.shouldDiscardEcho('好的', 1200)).toBe(false);
    });

    it('ignores unrelated typing inside the window', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho('接下来我们讨论一下别的事情吧，比如明天的安排', 1200)).toBe(false);
    });

    it('normalizes whitespace on both sides', () => {
        const f = createVoiceEchoFilter();
        f.markSent('帮我 把这个 页面的 样式 调整 一下 按钮 改成 圆角', 1000);
        expect(f.shouldDiscardEcho(SENT, 1200)).toBe(true);
    });

    it('respects custom window and threshold', () => {
        const f = createVoiceEchoFilter({ windowMs: 1000, threshold: 0.99 });
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho(SENT, 1500)).toBe(true);          // identical, within 1s
        expect(f.shouldDiscardEcho(SENT + '。', 1500)).toBe(false);   // below 0.99
        expect(f.shouldDiscardEcho(SENT, 2001)).toBe(false);          // outside 1s window
    });

    it('does not false-positive on a short chunk that later grows', () => {
        const f = createVoiceEchoFilter();
        f.markSent(SENT, 1000);
        expect(f.shouldDiscardEcho('帮我把这个页', 1100)).toBe(false); // < minChars
        expect(f.shouldDiscardEcho(SENT, 1300)).toBe(true);           // full echo arrives
    });
});
