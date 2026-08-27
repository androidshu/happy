import { Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// Launch the system-provided barcode scanner (Google code scanner on Android,
// DataScannerViewController on iOS). Falls back to the in-app /scan screen when
// the system scanner is unavailable or fails to start — the common case being
// Chinese Android ROMs whose Google Play services ship without the ML Kit
// code-scanner Chimera module, so the scanner activity closes instantly.
export async function launchSystemScannerOrFallback(router: Router): Promise<void> {
    if (Platform.OS === 'web') {
        // Desktop/web is the QR-displaying side of the pairing flow; there is
        // no system scanner to launch and nothing to scan.
        return;
    }

    if (!CameraView.isModernBarcodeScannerAvailable) {
        // No system scanner at all (e.g. iOS < 16, or no Google Play services).
        router.push('/scan');
        return;
    }

    try {
        await CameraView.launchScanner({ barcodeTypes: ['qr'] });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message?.toLowerCase().includes('cancel')) {
            // The user closed the system scanner themselves — stay put.
            return;
        }
        console.warn('Failed to launch system barcode scanner, falling back to in-app scanner', e);
        router.push('/scan');
    }
}
