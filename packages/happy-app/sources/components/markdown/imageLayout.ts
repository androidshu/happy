const DEFAULT_HORIZONTAL_PADDING = 32;
const DEFAULT_MAX_IMAGE_WIDTH = 520;
const DEFAULT_FALLBACK_WIDTH = 320;

export function resolveMarkdownImageWidth(
    viewportWidth: number,
    horizontalPadding: number = DEFAULT_HORIZONTAL_PADDING,
    maxImageWidth: number = DEFAULT_MAX_IMAGE_WIDTH,
    fallbackWidth: number = DEFAULT_FALLBACK_WIDTH,
): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
        return fallbackWidth;
    }

    const availableWidth = viewportWidth - horizontalPadding;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
        return fallbackWidth;
    }

    return Math.min(maxImageWidth, availableWidth);
}
