import * as React from 'react';

type Props = {
    items: readonly { id: string }[];
    renderItem: (index: number) => React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    hasMore: boolean;
    loading: boolean;
    loadOlder: () => Promise<void>;
    loadLabel: string;
    loadingLabel: string;
    errorLabel: string;
    bottomLabel: string;
    color: string;
    backgroundColor: string;
    topInset?: number;
    bottomInset?: number;
};

// Normal document flow: no recycled cells, estimated heights, or streaming
// scroll effects. Only opening the transcript and explicit button clicks move it.
export const ManualTranscript = React.memo((props: Props) => {
    const nodeRef = React.useRef<HTMLDivElement>(null);
    const opened = React.useRef(false);
    const loadingRef = React.useRef(false);
    const anchor = React.useRef<{ node: HTMLElement; top: number; firstId: string } | null>(null);
    const [error, setError] = React.useState(false);

    const cancelAnchor = () => { anchor.current = null; };
    const scrollToEnd = () => {
        cancelAnchor();
        const node = nodeRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    };

    React.useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!node || props.items.length === 0) return;
        if (!opened.current) {
            opened.current = true;
            node.scrollTop = node.scrollHeight;
        } else if (anchor.current && props.items[0].id !== anchor.current.firstId) {
            const saved = anchor.current;
            anchor.current = null;
            if (saved.node.isConnected) {
                node.scrollTop += saved.node.getBoundingClientRect().top - saved.top;
            }
        }
        if (!props.loading && !loadingRef.current) anchor.current = null;
    }, [props.items, props.loading]);

    const loadOlder = async () => {
        if (loadingRef.current || props.loading || !props.hasMore) return;
        const node = nodeRef.current;
        const top = node?.getBoundingClientRect().top ?? 0;
        const row = node && Array.from(node.querySelectorAll<HTMLElement>('[data-transcript-row]'))
            .find((child) => child.getBoundingClientRect().bottom > top);
        anchor.current = row && props.items.length > 0
            ? { node: row, top: row.getBoundingClientRect().top, firstId: props.items[0].id }
            : null;
        loadingRef.current = true;
        setError(false);
        try {
            await props.loadOlder();
        } catch {
            anchor.current = null;
            setError(true);
        } finally {
            loadingRef.current = false;
        }
    };

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
            <div
                ref={nodeRef}
                data-testid="manual-transcript"
                tabIndex={0}
                onWheel={cancelAnchor}
                onTouchStart={cancelAnchor}
                onPointerDown={cancelAnchor}
                onKeyDown={cancelAnchor}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                    overflowAnchor: 'none', color: props.color, paddingTop: props.topInset ?? 0,
                    paddingBottom: 8 + (props.bottomInset ?? 0) }}
            >
                {props.header}
                <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {props.hasMore && <button type="button" disabled={props.loading}
                        onClick={() => { void loadOlder(); }}
                        style={{ color: 'inherit', background: 'transparent', border: 0, cursor: 'pointer', padding: 8 }}>
                        {props.loading ? props.loadingLabel : error ? props.errorLabel : props.loadLabel}
                    </button>}
                </div>
                {props.items.map((item, index) => (
                    <div key={item.id} data-transcript-row={item.id}>{props.renderItem(index)}</div>
                ))}
                {props.footer}
            </div>
            <button type="button" aria-label={props.bottomLabel} title={props.bottomLabel}
                onClick={scrollToEnd}
                style={{ position: 'absolute', right: 16, bottom: 8, borderRadius: 18,
                    width: 32, height: 32, border: '1px solid currentColor', color: props.color,
                    background: props.backgroundColor, cursor: 'pointer' }}>↓</button>
        </div>
    );
});
