import { useHeaderHeight } from '@/utils/responsive';
import * as React from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';

interface AgentContentViewProps {
    input?: React.ReactNode | null;
    content?: React.ReactNode | null;
    placeholder?: React.ReactNode | null;
    /** Keep the composer as an overlay while the chat scrolls beneath it. */
    floatingDock?: boolean;
    opaqueDockOffset?: number;
    /** Measured visual inset that the inverted chat list reserves at its bottom. */
    onDockInsetChange?: (inset: number) => void;
}

export const AgentContentView: React.FC<AgentContentViewProps> = React.memo(({
    input,
    content,
    placeholder,
    floatingDock = false,
    opaqueDockOffset = 0,
    onDockInsetChange,
}) => {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const state = useKeyboardState();
    const keyboardInset = state.isVisible ? Math.max(0, state.height - safeArea.bottom) : 0;
    const [dockHeight, setDockHeight] = React.useState(0);

    const handleDockLayout = React.useCallback((event: LayoutChangeEvent) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setDockHeight((currentHeight) => (
            Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
        ));
    }, []);

    React.useEffect(() => {
        onDockInsetChange?.(floatingDock ? dockHeight + keyboardInset : 0);
    }, [dockHeight, floatingDock, keyboardInset, onDockInsetChange]);

    if (floatingDock) {
        return (
            <View style={{ flexBasis: 0, flexGrow: 1 }}>
                {content && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                        {content}
                    </View>
                )}
                {placeholder && (
                    <ScrollView
                        style={{
                            position: 'absolute',
                            top: safeArea.top + headerHeight,
                            left: 0,
                            right: 0,
                            bottom: dockHeight + keyboardInset,
                        }}
                        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
                        keyboardShouldPersistTaps="handled"
                        alwaysBounceVertical={false}
                    >
                        {placeholder}
                    </ScrollView>
                )}
                <View
                    testID="chat-bottom-dock"
                    onLayout={handleDockLayout}
                    pointerEvents="box-none"
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: keyboardInset,
                        paddingBottom: safeArea.bottom,
                        zIndex: 2,
                    }}
                >
                    <View
                        testID="chat-bottom-background"
                        pointerEvents="none"
                        style={{ position: 'absolute', top: opaqueDockOffset, bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface }}
                    />
                    {input}
                </View>
            </View>
        );
    }

    return (
        <View style={{ flexBasis:0, flexGrow:1, paddingBottom: keyboardInset }}>
            <View style={{ flexBasis:0, flexGrow:1 }}>
                {content && (
                    <View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}>
                        {content}
                    </View>
                )}
                {placeholder && (
                    <ScrollView
                        style={[{ position: 'absolute', top: safeArea.top + headerHeight, left: 0, right: 0, bottom: 0 }]}
                        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
                        keyboardShouldPersistTaps="handled"
                        alwaysBounceVertical={false}
                    >
                        {placeholder}
                    </ScrollView>
                )}
            </View>
            <View>
                {input}
            </View>
        </View>
    );
});

// const FallbackKeyboardAvoidingView: React.FC<AgentContentViewProps> = React.memo(({
//     children,
// }) => {
    
// });
