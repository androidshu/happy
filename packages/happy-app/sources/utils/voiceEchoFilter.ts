//
// Voice-IME echo filter (Android).
//
// Some Android voice IMEs hold a composing session and asynchronously
// re-commit the just-dictated text AFTER the app programmatically clears the
// input on send. The user sees: input clears on send, then ~the same text
// pops back within a second and has to be deleted by hand.
//
// React Native exposes no API to end the IME composing session before
// clearing, so we defend at the text-change layer: within a short window
// after a send, incoming text that is near-identical to what was just sent
// is treated as an IME echo and discarded.
//

export type VoiceEchoFilter = {
    /** Record the text that was just sent (and cleared). Call with '' to disarm. */
    markSent: (sentText: string, now?: number) => void;
    /** True when the incoming text looks like an echo of the just-sent text. */
    shouldDiscardEcho: (incomingText: string, now?: number) => boolean;
};

type Options = {
    windowMs?: number;      // default 3000
    minChars?: number;      // default 10 (normalized)
    threshold?: number;     // default 0.9 (char-multiset Dice)
};

function normalize(text: string): string {
    return text.replace(/\s+/g, '');
}

// Sørensen–Dice over character multisets: 2·|A∩B| / (|A|+|B|).
// Order-insensitive on purpose: echoed dictation occasionally differs by a
// stray character or punctuation mark, not by wholesale rearrangement.
export function charSimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    const counts = new Map<string, number>();
    for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    let common = 0;
    for (const ch of b) {
        const c = counts.get(ch) ?? 0;
        if (c > 0) {
            common++;
            counts.set(ch, c - 1);
        }
    }
    return (2 * common) / (a.length + b.length);
}

export function createVoiceEchoFilter(options: Options = {}): VoiceEchoFilter {
    const windowMs = options.windowMs ?? 3000;
    const minChars = options.minChars ?? 10;
    const threshold = options.threshold ?? 0.9;

    let sentNormalized = '';
    let sentAt = 0;
    let armed = false;

    return {
        markSent(sentText: string, now: number = Date.now()) {
            const normalized = normalize(sentText);
            if (normalized.length < minChars) {
                // Short messages can't be reliably distinguished from real
                // typing; disarm instead of risking false positives.
                armed = false;
                sentNormalized = '';
                return;
            }
            sentNormalized = normalized;
            sentAt = now;
            armed = true;
        },

        shouldDiscardEcho(incomingText: string, now: number = Date.now()) {
            if (!armed) return false;
            if (now - sentAt > windowMs) {
                armed = false;
                sentNormalized = '';
                return false;
            }
            const incoming = normalize(incomingText);
            if (incoming.length < minChars) return false;
            // Do NOT disarm on a hit: IMEs sometimes re-commit the text in
            // several chunks, and the remaining chunks must keep matching
            // against the same sent snapshot until the window expires.
            return charSimilarity(incoming, sentNormalized) >= threshold;
        },
    };
}
