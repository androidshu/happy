import * as React from 'react';
import { Session } from '@/sync/storageTypes';

interface SessionActionsNativeMenuProps {
    children: React.ReactNode;
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    session: Session;
}

export function SessionActionsNativeMenu({ children }: SessionActionsNativeMenuProps) {
    // Temporary Android fallback:
    // @expo/ui menu triggers currently cause blank session rows and intercept navigation.
    // Keep rows directly interactive until native menu integration is stabilized.
    return <>{children}</>;
}
