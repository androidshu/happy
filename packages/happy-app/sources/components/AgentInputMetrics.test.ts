import * as React from 'react';
// @ts-expect-error react-test-renderer has no declarations in this workspace.
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
    const R = await import('react');
    const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
    return { Pressable: host('Pressable'), Text: host('Text'), View: host('View') };
});
vi.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: { textSecondary: '#666', warning: '#f90', warningCritical: '#f00' } } }) }));
vi.mock('@/text', async () => {
    const { zhHans } = await import('@/text/translations/zh-Hans');
    return { t: (key: string, args: any) => {
        const value = key.split('.').reduce((object: any, part) => object[part], zhHans);
        return typeof value === 'function' ? value(args) : value;
    } };
});
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn() } }));
import { Modal } from '@/modal';
import { AgentInputMetrics } from './AgentInputMetrics';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
describe('bottom composer metrics', () => {
    const base = { items: [{ id: 'five_hour', label: '5h', percent: 80 }, { id: 'seven_day', label: '7d', percent: 15 }],
        details: [{ label: '5h 剩余 80%\n重置于 18:00' }], showRemaining: true, showUnavailable: true };
    function render(extra: Partial<React.ComponentProps<typeof AgentInputMetrics>> = {}) {
        let renderer: ReturnType<typeof create>;
        act(() => { renderer = create(React.createElement(AgentInputMetrics, { ...base, ...extra })); });
        return renderer!;
    }
    it('matches the requested single-line format with K units and unknown values', () => {
        const r = render({ items: [{ id: 'seven_day', label: '7d', percent: 87 }], showRemaining: false,
            context: { contextSize: 310000, contextWindow: 475000 } });
        const texts = r.root.findAllByType('Text');
        expect(texts.map((node: any) => node.props.children)).toEqual([
            '套餐已用，5小时：未知，7天：87%，context:310K/475K, used:65%',
        ]);
        expect(texts[0].props.numberOfLines).toBe(1);
        expect(texts[0].props.adjustsFontSizeToFit).toBe(true);
        expect(r.root.findByType('View').props.style.height).toBeUndefined();
    });
    it('keeps missing windows visible as unavailable instead of inventing quota', () => {
        const r = render({ items: [base.items[1]], showRemaining: false });
        expect(r.root.findAllByType('Text').map((node: any) => node.props.children)).toEqual([
            '套餐已用，5小时：未知，7天：15%，context:未知/未知, used:未知',
        ]);
    });
    it('opens reset details using the standard modal', () => {
        const r = render();
        act(() => r.root.findByType('Pressable').props.onPress());
        expect(Modal.alert).toHaveBeenCalledWith('套餐剩余', base.details[0].label);
    });
    it('shows known context usage without fabricating a denominator', () => {
        const r = render({ context: { contextSize: 1234 } });
        expect(r.root.findByType('Text').props.children).toBe('套餐剩余，5小时：80%，7天：15%，context:1K/未知, used:未知');
    });
    it('uses M for large windows and still shows normal usage', () => {
        const r = render({ context: { contextSize: 1250000, contextWindow: 2000000 } });
        expect(r.root.findByType('Text').props.children).toContain('context:1.25M/2M, used:63%');
    });
    it('leaves a new composer without session metrics empty', () => {
        expect(render({ items: [], context: undefined, showUnavailable: false }).toJSON()).toBeNull();
    });
});
