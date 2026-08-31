import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { getSessionAgentLabel, resolveSessionAgentKey } from '@/utils/sessionAgentIdentity';

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
        case 'qoder':
            return {
                backgroundColor: dark ? 'rgba(255, 202, 46, 0.18)' : 'rgba(255, 194, 0, 0.12)',
                borderColor: dark ? 'rgba(255, 202, 46, 0.38)' : 'rgba(180, 128, 0, 0.28)',
                color: dark ? '#FFD866' : '#775500',
            };
        case 'agy':
            return {
                backgroundColor: dark ? 'rgba(168, 111, 255, 0.18)' : 'rgba(113, 62, 196, 0.10)',
                borderColor: dark ? 'rgba(184, 137, 255, 0.36)' : 'rgba(113, 62, 196, 0.24)',
                color: dark ? '#D3B5FF' : '#6532A8',
            };
        case 'rig':
            return {
                backgroundColor: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
                borderColor: dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)',
                color: dark ? '#FFFFFF' : '#111111',
            };
        case 'openclaw':
            return {
                backgroundColor: dark ? 'rgba(52, 199, 89, 0.16)' : 'rgba(52, 199, 89, 0.11)',
                borderColor: dark ? 'rgba(52, 199, 89, 0.34)' : 'rgba(52, 199, 89, 0.25)',
                color: dark ? '#7DFF9B' : '#1D7F36',
            };
        case 'claude':
            return {
                backgroundColor: dark ? 'rgba(210, 126, 55, 0.18)' : 'rgba(210, 126, 55, 0.12)',
                borderColor: dark ? 'rgba(210, 126, 55, 0.36)' : 'rgba(210, 126, 55, 0.24)',
                color: dark ? '#F0B887' : '#9A4F1E',
            };
        default:
            return {
                backgroundColor: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                borderColor: dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.14)',
                color: dark ? '#D0D0D0' : '#555555',
            };
    }
}

export const SessionFlavorBadge = React.memo((props: {
    flavor?: string | null;
    clientId?: string | null;
    compact?: boolean;
    style?: StyleProp<ViewStyle>;
}) => {
    const { theme } = useUnistyles();
    const normalizedFlavor = resolveSessionAgentKey(props.flavor, props.clientId);
    const label = getSessionAgentLabel(props.flavor, props.clientId);
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
