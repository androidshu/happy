import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { Modal } from '@/modal';
import { storage } from '@/sync/storage';
import { sessionRename } from '@/sync/ops';
import { t } from '@/text';

export function SessionRenameButton({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const [saving, setSaving] = React.useState(false);
    const rename = async () => {
        const session = storage.getState().sessions[sessionId];
        const title = await Modal.prompt(t('common.rename'), '', {
            defaultValue: session?.metadata?.summary?.text ?? '',
            placeholder: t('machine.untitledSession'),
            cancelText: t('common.cancel'),
            confirmText: t('common.rename'),
        });
        if (title === null) return;
        setSaving(true);
        try {
            await sessionRename(sessionId, title);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.rename')}
            disabled={saving}
            onPress={(event) => { event.stopPropagation(); void rename(); }}
            style={{ padding: 10, opacity: saving ? 0.5 : 1 }}
        >
            <Ionicons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
        </Pressable>
    );
}
