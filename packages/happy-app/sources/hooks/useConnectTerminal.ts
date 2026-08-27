import * as React from 'react';
import { Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { authApprove } from '@/auth/authApprove';
import { useCheckScannerPermissions } from '@/hooks/useCheckCameraPermissions';
import { Modal } from '@/modal';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import { storage } from '@/sync/storage';
import { launchSystemScannerOrFallback } from '@/utils/qrScanner';

interface UseConnectTerminalOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

const SYNC_VALIDATION_ATTEMPTS = 3;
const SYNC_VALIDATION_DELAY_MS = 1200;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useConnectTerminal(options?: UseConnectTerminalOptions) {
    const auth = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(false);
    const checkScannerPermissions = useCheckScannerPermissions();

    const processAuthUrl = React.useCallback(async (url: string) => {
        if (!url.startsWith('happy://terminal?')) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        if (!auth.credentials) {
            Modal.alert(t('common.error'), 'Please sign in to Happy on this device before connecting a terminal.', [{ text: t('common.ok') }]);
            return false;
        }

        setIsLoading(true);
        try {
            const beforeState = storage.getState();
            const beforeSessionCount = Object.keys(beforeState.sessions).length;
            const beforeMachineCount = Object.keys(beforeState.machines).length;

            const tail = url.slice('happy://terminal?'.length);
            const publicKey = decodeBase64(tail, 'base64url');
            const responseV1 = encryptBox(decodeBase64(auth.credentials.secret, 'base64url'), publicKey);
            let responseV2Bundle = new Uint8Array(sync.encryption.contentDataKey.length + 1);
            responseV2Bundle[0] = 0;
            responseV2Bundle.set(sync.encryption.contentDataKey, 1);
            const responseV2 = encryptBox(responseV2Bundle, publicKey);
            const approvalResult = await authApprove(auth.credentials.token, publicKey, responseV1, responseV2);

            if (approvalResult === 'not_found') {
                Modal.alert(t('common.error'), 'This terminal link is no longer valid. Please generate a fresh URL from the computer and try again.', [{ text: t('common.ok') }]);
                return false;
            }

            let afterSessionCount = beforeSessionCount;
            let afterMachineCount = beforeMachineCount;
            for (let attempt = 0; attempt < SYNC_VALIDATION_ATTEMPTS; attempt++) {
                await sync.refreshMachines();
                await sync.refreshSessions();

                const currentState = storage.getState();
                afterSessionCount = Object.keys(currentState.sessions).length;
                afterMachineCount = Object.keys(currentState.machines).length;

                const hasDataNow = afterSessionCount > 0 || afterMachineCount > 0;
                const dataChanged = afterSessionCount !== beforeSessionCount || afterMachineCount !== beforeMachineCount;
                if (hasDataNow && (dataChanged || beforeSessionCount > 0 || beforeMachineCount > 0)) {
                    Modal.alert(t('common.success'), t('modals.terminalConnectedSuccessfully'), [
                        {
                            text: t('common.ok'),
                            onPress: () => options?.onSuccess?.()
                        }
                    ]);
                    return true;
                }

                if (attempt < SYNC_VALIDATION_ATTEMPTS - 1) {
                    await delay(SYNC_VALIDATION_DELAY_MS);
                }
            }

            const needsRestoreHint = afterSessionCount === 0 && afterMachineCount === 0;
            const message = needsRestoreHint
                ? 'The terminal approved the link, but this app still has no synced machines or sessions. Please make sure this phone is signed in to the same Happy account, then try again.'
                : 'The terminal approved the link, but the session list did not refresh correctly. Please reopen the app and try again.';
            Modal.alert(t('common.error'), message, [{ text: t('common.ok') }]);
            return false;
        } catch (e) {
            console.error(e);
            Modal.alert(t('common.error'), t('modals.failedToConnectTerminal'), [{ text: t('common.ok') }]);
            options?.onError?.(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [auth.credentials, options]);

    const connectTerminal = React.useCallback(async () => {
        if (await checkScannerPermissions()) {
            // Use camera scanner, falling back to the in-app scanner screen when
            // the system one cannot start
            await launchSystemScannerOrFallback(router);
        } else {
            Modal.alert(t('common.error'), t('modals.cameraPermissionsRequiredToConnectTerminal'), [{ text: t('common.ok') }]);
        }
    }, [checkScannerPermissions, router]);

    const connectWithUrl = React.useCallback(async (url: string) => {
        return await processAuthUrl(url);
    }, [processAuthUrl]);

    // Set up barcode scanner listener
    const isProcessingRef = React.useRef(false);
    React.useEffect(() => {
        if (CameraView.isModernBarcodeScannerAvailable) {
            const subscription = CameraView.onModernBarcodeScanned(async (event) => {
                if (isProcessingRef.current) return;
                if (event.data.startsWith('happy://terminal?')) {
                    isProcessingRef.current = true;
                    try {
                        if (Platform.OS === 'ios') {
                            try {
                                await CameraView.dismissScanner();
                            } catch (e) {
                                console.warn('Failed to dismiss scanner', e);
                            }
                        }
                        await processAuthUrl(event.data);
                    } finally {
                        isProcessingRef.current = false;
                    }
                }
            });
            return () => {
                subscription.remove();
                isProcessingRef.current = false;
                if (Platform.OS === 'ios') {
                    CameraView.dismissScanner().catch((e: unknown) => {
                        console.warn('Failed to dismiss scanner during cleanup', e);
                    });
                }
            };
        }
    }, [processAuthUrl]);

    return {
        connectTerminal,
        connectWithUrl,
        isLoading,
        processAuthUrl
    };
}
