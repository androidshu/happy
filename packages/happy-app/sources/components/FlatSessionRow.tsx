import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { SessionFlavorBadge } from './SessionFlavorBadge';
import { StatusDot } from './StatusDot';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { SessionShortcutHintBadge } from './ShortcutHints';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { sessionKill } from '@/sync/ops';
import type { FlatSessionRowData } from '@/utils/flatSessionList';
import { formatSessionListTimestamp } from '@/utils/sessionListTimestamp';
import type { Theme } from '@/theme';
import { t } from '@/text';
import { RigGitLineChanges } from './RigGitLineChanges';
import { ShimmerText } from './ShimmerText';
import { resolveFlatSessionRowPresentation } from '@/utils/flatSessionRowPresentation';

const AGENT_LABEL_WIDTH = 50;
const ROW_PADDING_LEFT = 16;
const AGENT_LABEL_GAP = 10;
const TOP_RIGHT_SLOT_WIDTH = 56;
const STATUS_DOT_SIZE = 8;
const UNREAD_DOT_CLEAR_GRACE_MS = 350;

/**
 * The single colour the flat list paints, rows and page alike, so nothing reads
 * as a card sitting on a backdrop: plain white in light, the page's own black in
 * dark. `surface` is deliberately not used — in dark it is a lifted graphite
 * meant to contrast against exactly the backdrop this variant removes.
 */
export function flatListBackgroundColor(theme: Theme): string {
    return theme.dark ? theme.colors.groupped.background : '#FFFFFF';
}

/**
 * One session in the flat home list: agent, directory, generated title,
 * worktree, and status. The row spans the full width on the page background
 * with a hairline under it, so the list reads as one continuous column rather
 * than a stack of project cards.
 */
export const FlatSessionRow = React.memo(({ row, selected, showBorder, archived }: {
    row: FlatSessionRowData;
    selected?: boolean;
    showBorder?: boolean;
    /** Retired work: the same row, faded back and drained of avatar colour. */
    archived?: boolean;
}) => {
    const { session, directoryName, workspaceName } = row;
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigateToSession = useNavigateToSession();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);

    // Greying out is about the machine, not the session's own socket. A session
    // idle since yesterday on a machine that is still up is ordinary work you
    // can pick back up, and drawing it as dead makes a healthy list look like a
    // graveyard. Only retired work, or work whose machine is actually gone,
    // fades.
    const faded = !!archived || session.machineOffline;

    // SessionView clears the real unread state as soon as the destination
    // mounts. Keep only the row's visual badge around long enough for the
    // navigation transition to cover it, instead of briefly exposing the
    // timestamp underneath. Read semantics remain immediate.
    const [showUnreadDot, setShowUnreadDot] = React.useState(session.hasUnread);
    React.useEffect(() => {
        if (session.hasUnread) {
            setShowUnreadDot(true);
            return;
        }
        if (!showUnreadDot) return;

        const timeout = setTimeout(() => setShowUnreadDot(false), UNREAD_DOT_CLEAR_GRACE_MS);
        return () => clearTimeout(timeout);
    }, [session.hasUnread, showUnreadDot]);

    const presentation = resolveFlatSessionRowPresentation({
        state: session.state,
        hasUnread: showUnreadDot,
        faded,
    });
    // The status dot speaks the old project-card language — running breathes
    // blue, blocked breathes orange, a locally-synced unread result settles green and is
    // cancelled by opening the session — shrunk to the metadata line so it
    // never competes with the title.
    const statusDotLabel = presentation.statusDot.type === 'none'
        ? undefined
        : session.state === 'input_required'
            ? t('status.inputRequired')
            : session.state === 'permission_required'
                ? t('status.permissionRequired')
                : session.state === 'thinking'
                    ? t('status.activeNow')
                    : session.state === 'disconnected'
                        ? t('status.disconnected')
                        : t('status.unread');

    const timestamp = React.useMemo(
        () => formatSessionListTimestamp(session.lastActivityAt),
        [session.lastActivityAt],
    );

    const [archiving, performArchive] = useHappyAction(async () => {
        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        performArchive();
    }, [performArchive]);

    const handlePress = React.useCallback(() => {
        navigateToSession(session.id);
    }, [navigateToSession, session.id]);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const showActionAlert = useSessionActionAlert(session.id);
    const menuProps = Platform.OS === 'web' ? {
        onContextMenu: handleContextMenu,
    } as any : {
        onLongPress: showActionAlert,
    };

    const content = (
        <Pressable
            style={[styles.row, selected && styles.rowSelected]}
            onPress={handlePress}
            {...menuProps}
        >
            <View style={[styles.agentLabel, faded && styles.agentLabelFaded]}>
                <SessionFlavorBadge
                    flavor={session.flavor}
                    clientId={session.clientId}
                    style={styles.agentBadge}
                />
            </View>

            <View style={[styles.content, faded && styles.contentFaded]}>
                <View style={styles.titleRow}>
                    <View style={styles.titleContainer}>
                        {presentation.shimmerTitle ? (
                            <ShimmerText
                                text={directoryName}
                                style={styles.title}
                                baseColor={theme.colors.textSecondary}
                                highlightColor={theme.colors.text}
                            />
                        ) : (
                            <Text
                                style={[
                                    styles.title,
                                    faded ? styles.titleDisconnected : styles.titleConnected,
                                ]}
                                numberOfLines={1}
                            >
                                {directoryName}
                            </Text>
                        )}
                    </View>
                    <SessionShortcutHintBadge sessionId={session.id} style={styles.shortcutBadge} />
                    <View style={styles.topRightStatus}>
                        <Text style={styles.timestamp} numberOfLines={1}>
                            {timestamp}
                        </Text>
                    </View>
                </View>

                <Text style={styles.generatedTitle} numberOfLines={1}>
                    {session.name}
                </Text>

                <View style={styles.workspaceRow}>
                    <View style={styles.workspaceLocation}>
                        {workspaceName && (
                            <>
                                <Text style={styles.workspace} numberOfLines={1}>
                                    {workspaceName}
                                </Text>
                                <Ionicons
                                    name="git-branch-outline"
                                    size={13}
                                    color={theme.colors.textSecondary}
                                />
                            </>
                        )}
                    </View>
                    <View style={styles.workspaceMeta}>
                        {presentation.statusDot.type === 'dot' && (
                            <View
                                style={styles.statusDot}
                                accessible
                                accessibilityRole="text"
                                accessibilityLabel={statusDotLabel}
                            >
                                <StatusDot
                                    color={presentation.statusDot.color}
                                    isPulsing={presentation.statusDot.pulsing}
                                    size={STATUS_DOT_SIZE}
                                />
                            </View>
                        )}
                        {session.hasDraft && (
                            <Ionicons
                                name="create-outline"
                                size={13}
                                color={theme.colors.textSecondary}
                            />
                        )}
                        {session.gitChangedFiles !== null && (
                            <RigGitLineChanges
                                changedFiles={session.gitChangedFiles}
                                countsExact={session.gitCountsExact}
                                deletions={session.gitDeletions ?? 0}
                                insertions={session.gitInsertions ?? 0}
                            />
                        )}
                    </View>
                </View>
            </View>

            {showBorder && <View style={styles.divider} />}
        </Pressable>
    );

    if (!swipeEnabled) {
        return (
            <>
                {content}
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    sessionId={session.id}
                    visible={!!actionsAnchor}
                />
            </>
        );
    }

    const renderRightActions = () => (
        <Pressable style={styles.swipeAction} onPress={handleArchive} disabled={archiving}>
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.archiveSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archiving}
        >
            {content}
        </Swipeable>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    row: {
        flexDirection: 'row',
        // Centred, not top-aligned: the agent label sits in the middle of the three
        // text lines the way a chat list draws it, rather than hanging off the
        // title.
        alignItems: 'center',
        paddingLeft: ROW_PADDING_LEFT,
        paddingRight: 16,
        paddingVertical: 10,
        backgroundColor: flatListBackgroundColor(theme),
    },
    rowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    agentLabel: {
        width: AGENT_LABEL_WIDTH,
        marginRight: AGENT_LABEL_GAP,
        alignItems: 'stretch',
        justifyContent: 'center',
    },
    agentBadge: {
        width: AGENT_LABEL_WIDTH,
        paddingHorizontal: 3,
    },
    // Faded rows keep the exact geometry of live ones and differ only by being
    // pulled back, so the list stays one column rather than two designs.
    agentLabelFaded: {
        opacity: 0.5,
    },
    contentFaded: {
        opacity: 0.6,
    },
    content: {
        flex: 1,
        minWidth: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleContainer: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 17,
        lineHeight: 22,
        ...Typography.default('semiBold'),
    },
    titleConnected: {
        color: theme.colors.text,
    },
    titleDisconnected: {
        color: theme.colors.textSecondary,
    },
    shortcutBadge: {
        flexShrink: 0,
        marginLeft: 8,
    },
    // The timestamp keeps a Telegram-like right column to itself, so changing
    // status never makes the title jump horizontally.
    topRightStatus: {
        width: TOP_RIGHT_SLOT_WIDTH,
        height: 22,
        flexShrink: 0,
        marginLeft: 8,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    timestamp: {
        fontSize: 13,
        lineHeight: 22,
        color: theme.colors.textSecondary,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
        ...Typography.default('regular'),
    },
    generatedTitle: {
        fontSize: 15,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    workspaceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 1,
        minHeight: 18,
    },
    workspaceLocation: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    workspace: {
        flexShrink: 1,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    workspaceMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 'auto',
        gap: 6,
    },
    // First thing on the metadata line: under the timestamp, left of the draft
    // icon. Small on purpose — it is a glanceable state, not a banner.
    statusDot: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Sits on the row itself rather than the text column, so centring the
    // agent label cannot drag it up off the row's bottom edge. Starts where the text
    // does and runs to the screen edge, the way a chat list separates rows
    // without cutting under the avatar.
    divider: {
        position: 'absolute',
        left: ROW_PADDING_LEFT + AGENT_LABEL_WIDTH + AGENT_LABEL_GAP,
        right: 0,
        bottom: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));
