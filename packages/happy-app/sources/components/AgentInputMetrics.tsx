import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Modal } from '@/modal';
import { t } from '@/text';
import { formatContextTokenCount, getContextUsageSummary } from '@/utils/sessionStatusBar';

type Props = {
    items: Array<{ id: string; label: string; percent: number }>;
    details: Array<{ label: string }>;
    showRemaining: boolean;
    showUnavailable: boolean;
    context?: { contextSize: number; contextWindow?: number };
};

// Shared bottom metrics strip. Native text owns its layout: no Android
// Compose menu host or tap-to-reveal token counts. A single line scales to fit.
export const AgentInputMetrics = React.memo(function AgentInputMetrics(props: Props) {
    const { theme } = useUnistyles();
    if (!props.showUnavailable && props.items.length === 0 && !props.context) return null;
    const unavailable = t('agentInput.usagePopup.unknown');
    const title = t(props.showRemaining ? 'agentInput.usagePopup.remaining' : 'agentInput.usagePopup.used');
    const quota = (label: string) => {
        const item = props.items.find(item => item.label === label);
        return item ? `${Math.round(item.percent)}%` : unavailable;
    };
    const usage = getContextUsageSummary(props.context?.contextSize, props.context?.contextWindow);
    const text = t('agentInput.usagePopup.summary', {
        title, fiveHour: quota('5h'), sevenDay: quota('7d'),
        context: `${formatContextTokenCount(props.context?.contextSize) ?? unavailable}/${formatContextTokenCount(props.context?.contextWindow, false) ?? unavailable}`,
        used: usage ? `${Math.round(usage.percent)}%` : unavailable,
    });
    const contextColor = usage?.level === 'critical' ? theme.colors.warningCritical
        : usage?.level === 'warning' ? theme.colors.warning : theme.colors.textSecondary;
    return (
        <View testID="agent-input-metrics" style={{
            width: '100%', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4,
        }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={text}
                disabled={props.details.length === 0}
                onPress={() => Modal.alert(title, props.details.map(item => item.label).join('\n\n'))}
                hitSlop={4}
                style={{ width: '100%' }}
            >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
                    style={{ fontSize: 11, lineHeight: 16, color: contextColor }}>
                    {text}
                </Text>
            </Pressable>
        </View>
    );
});
