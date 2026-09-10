import * as React from 'react';
// @ts-expect-error react-test-renderer has no declarations in this workspace.
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ keyboard: { isVisible: false, height: 0 }, surface: '#ffffff' }));
vi.mock('react-native', async () => {
    const R = await import('react');
    return { View: (props: any) => R.createElement('View', props, props.children) };
});
vi.mock('react-native-gesture-handler', async () => {
    const R = await import('react');
    return { ScrollView: (props: any) => R.createElement('ScrollView', props, props.children) };
});
vi.mock('react-native-keyboard-controller', () => ({ useKeyboardState: () => state.keyboard }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24 }) }));
vi.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: { surface: state.surface } } }) }));
vi.mock('@/utils/responsive', () => ({ useHeaderHeight: () => 50 }));
import { AgentContentView } from './AgentContentView';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { state.keyboard = { isVisible: false, height: 0 }; state.surface = '#ffffff'; });
describe('opaque mobile bottom dock', () => {
    function render(floatingDock = true) {
        const onDockInsetChange = vi.fn();
        let renderer: ReturnType<typeof create>;
        act(() => { renderer = create(React.createElement(AgentContentView, {
            floatingDock, opaqueDockOffset: 80, input: React.createElement('Input'), content: React.createElement('History'),
            placeholder: React.createElement('Placeholder'), onDockInsetChange,
        })); });
        return { renderer: renderer!, onDockInsetChange };
    }
    it.each(['#ffffff', '#181818'])('covers the input, metrics, and safe area with %s', surface => {
        state.surface = surface;
        const { renderer } = render();
        const dock = renderer.root.findAllByType('View').find((node: any) => node.props.testID === 'chat-bottom-dock');
        expect(dock.props.style).toMatchObject({ bottom: 0, paddingBottom: 24, zIndex: 2 });
        expect(dock.props.style.backgroundColor).toBeUndefined();
        const background = dock.findAllByType('View').find((node: any) => node.props.testID === 'chat-bottom-background');
        expect(background.props.style).toMatchObject({ top: 80, bottom: 0, backgroundColor: surface });
        expect(dock.findByType('Input')).toBeTruthy();
    });
    it('counts the measured safe area once when reserving history space', () => {
        const { renderer, onDockInsetChange } = render();
        const dock = renderer.root.findAllByType('View').find((node: any) => node.props.testID === 'chat-bottom-dock');
        act(() => dock.props.onLayout({ nativeEvent: { layout: { height: 150 } } }));
        expect(onDockInsetChange).toHaveBeenLastCalledWith(150);
        expect(renderer.root.findByType('ScrollView').props.style.bottom).toBe(150);
    });
    it('keeps the opaque dock above the keyboard without doubling its bottom inset', () => {
        state.keyboard = { isVisible: true, height: 324 };
        const { renderer, onDockInsetChange } = render();
        const dock = renderer.root.findAllByType('View').find((node: any) => node.props.testID === 'chat-bottom-dock');
        expect(dock.props.style.bottom).toBe(300);
        act(() => dock.props.onLayout({ nativeEvent: { layout: { height: 150 } } }));
        expect(onDockInsetChange).toHaveBeenLastCalledWith(450);
    });
    it('leaves the non-floating desktop layout unchanged', () => {
        const { renderer, onDockInsetChange } = render(false);
        expect(renderer.root.findAllByType('View').some((node: any) => node.props.testID === 'chat-bottom-dock')).toBe(false);
        expect(onDockInsetChange).toHaveBeenLastCalledWith(0);
    });
});
