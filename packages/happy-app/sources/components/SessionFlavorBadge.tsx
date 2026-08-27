import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

type FlavorKey = 'claude' | 'codex' | 'gemini' | 'openclaw';

const FLAVOR_LABELS: Record<FlavorKey, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
    openclaw: 'OpenClaw',
};

function normalizeFlavor(flavor?: string | null): FlavorKey | string {
    if (!flavor || flavor === 'claude') {
        return 'claude';
    }
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') {
        return 'codex';
    }
    if (flavor === 'gemini') {
        return 'gemini';
    }
    if (flavor === 'openclaw') {
        return 'openclaw';
    }
    return flavor;
}

export function getSessionFlavorLabel(flavor?: string | null): string {
    const normalized = normalizeFlavor(flavor);
    return FLAVOR_LABELS[normalized as FlavorKey] ?? normalized;
}

function getFlavorPalette(flavor: string, dark: boolean) {
    switch (flavor) {
        case 'codex':
            return {
                backgroundColor: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
                borderColor: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)',
                color: dark ? '#FFFFFF' : '#111111',
            };
        case 'gemini':
            return {
                backgroundColor: dark ? 'rgba(94, 151, 246, 0.18)' : 'rgba(26, 115, 232, 0.10)',
                borderColor: dark ? 'rgba(94, 151, 246, 0.36)' : 'rgba(26, 115, 232, 0.24)',
                color: dark ? '#AECBFA' : '#1967D2',
            };
        case 'openclaw':
            return {
                backgroundColor: dark ? 'rgba(52, 199, 89, 0.16)' : 'rgba(52, 199, 89, 0.11)',
                borderColor: dark ? 'rgba(52, 199, 89, 0.34)' : 'rgba(52, 199, 89, 0.25)',
                color: dark ? '#7DFF9B' : '#1D7F36',
            };
        case 'claude':
        default:
            return {
                backgroundColor: dark ? 'rgba(210, 126, 55, 0.18)' : 'rgba(210, 126, 55, 0.12)',
                borderColor: dark ? 'rgba(210, 126, 55, 0.36)' : 'rgba(210, 126, 55, 0.24)',
                color: dark ? '#F0B887' : '#9A4F1E',
            };
    }
}

export const SessionFlavorBadge = React.memo((props: {
    flavor?: string | null;
    compact?: boolean;
    style?: StyleProp<ViewStyle>;
}) => {
    const { theme } = useUnistyles();
    const normalizedFlavor = normalizeFlavor(props.flavor);
    const label = getSessionFlavorLabel(props.flavor);
    const palette = getFlavorPalette(normalizedFlavor, theme.dark);

    return (
        <View
            accessibilityLabel={`Agent ${label}`}
            style={[
                styles.badge,
                props.compact && styles.badgeCompact,
                {
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                },
                props.style,
            ]}
        >
            <Text
                style={[
                    styles.label,
                    props.compact && styles.labelCompact,
                    { color: palette.color },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
});

const styles = StyleSheet.create(() => ({
    badge: {
        minWidth: 0,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    badgeCompact: {
        paddingHorizontal: 5,
        paddingVertical: 1,
    },
    label: {
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '700',
        ...Typography.default('semiBold'),
    },
    labelCompact: {
        fontSize: 9,
        lineHeight: 12,
    },
}));
