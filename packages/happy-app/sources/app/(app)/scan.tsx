import * as React from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { RoundButton } from '@/components/RoundButton';
import { useConnectAccount } from '@/hooks/useConnectAccount';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { t } from '@/text';

const HINT_DURATION_MS = 2000;
const SCAN_WINDOW_SIZE = 264;

// Fallback in-app QR scanner. The system code scanner (`CameraView.launchScanner`)
// needs no camera permission on Android (Google code scanner) but fails at runtime
// on devices whose Google Play services lack the ML Kit code-scanner module —
// common on Chinese ROMs. This screen runs the camera preview ourselves, so it
// requests the camera permission on entry.
const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 24,
    },
    permissionText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        color: theme.colors.text,
        ...Typography.default(),
    },
    permissionButton: {
        minWidth: 220,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    closeButton: {
        padding: 14,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 17,
        ...Typography.default('semiBold'),
    },
    camera: {
        flex: 1,
    },
    scanWindow: {
        width: SCAN_WINDOW_SIZE,
        height: SCAN_WINDOW_SIZE,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.9)',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    instructions: {
        position: 'absolute',
        left: 32,
        right: 32,
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        ...Typography.default(),
    },
    hint: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        color: '#FFFFFF',
        fontSize: 14,
        overflow: 'hidden',
        ...Typography.default(),
    },
}));

export default function Scan() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();
    const accountConnect = useConnectAccount();
    const terminalConnect = useConnectTerminal();

    // Pause barcode detection while a scanned URL is being processed by removing
    // the onBarcodeScanned callback (expo-camera derives barcodeScannerEnabled
    // from its presence) — otherwise it fires again for every frame the code
    // stays in view.
    const [scannerEnabled, setScannerEnabled] = React.useState(true);
    const isProcessingRef = React.useRef(false);
    // After a failed processing, ignore the same QR until a different one is
    // scanned — otherwise it re-triggers an error modal every 500ms.
    const lastFailedDataRef = React.useRef<string | null>(null);
    const [hint, setHint] = React.useState<string | null>(null);
    const hintTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        return () => {
            if (hintTimeoutRef.current) {
                clearTimeout(hintTimeoutRef.current);
            }
        };
    }, []);

    const showHint = React.useCallback((text: string) => {
        if (hintTimeoutRef.current) {
            return; // a hint is already on screen
        }
        setHint(text);
        hintTimeoutRef.current = setTimeout(() => {
            hintTimeoutRef.current = null;
            setHint(null);
        }, HINT_DURATION_MS);
    }, []);

    const handleBarcode = React.useCallback(async (data: string) => {
        if (isProcessingRef.current || data === lastFailedDataRef.current) {
            return;
        }

        const process = data.startsWith('happy:///account?')
            ? accountConnect.processAuthUrl
            : data.startsWith('happy://terminal?')
                ? terminalConnect.processAuthUrl
                : null;

        if (!process) {
            showHint(t('scanner.notHappyQr'));
            return;
        }

        isProcessingRef.current = true;
        setScannerEnabled(false);
        try {
            const ok = await process(data);
            if (ok) {
                lastFailedDataRef.current = null;
                router.back();
            } else {
                lastFailedDataRef.current = data;
            }
        } finally {
            isProcessingRef.current = false;
            setScannerEnabled(true);
        }
    }, [accountConnect, terminalConnect, router, showHint]);

    const handleBarcodeScanned = React.useCallback(({ data }: { data: string }) => {
        void handleBarcode(data);
    }, [handleBarcode]);

    // Permission is still being resolved
    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator
                    style={{ marginTop: insets.top + 32 }}
                    size="small"
                    color={theme.colors.text}
                />
            </View>
        );
    }

    if (!permission.granted) {
        const canAskAgain = permission.canAskAgain;
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.groupped.background }]}>
                <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
                    <Pressable
                        style={styles.closeButton}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.back')}
                        hitSlop={8}
                    >
                        <Ionicons name="close" size={26} color={theme.colors.text} />
                    </Pressable>
                    <Text style={[styles.title, { color: theme.colors.text }]}>
                        {t('scanner.title')}
                    </Text>
                </View>
                <View style={styles.permissionContainer}>
                    <Text style={styles.permissionText}>{t('scanner.cameraAccessDenied')}</Text>
                    <RoundButton
                        style={styles.permissionButton}
                        title={canAskAgain ? t('scanner.grantCameraAccess') : t('scanner.openSettings')}
                        display="inverted"
                        onPress={() => {
                            if (canAskAgain) {
                                void requestPermission();
                            } else {
                                void Linking.openSettings();
                            }
                        }}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scannerEnabled ? handleBarcodeScanned : undefined}
            />
            <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
                <Pressable
                    style={styles.closeButton}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={26} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.title}>{t('scanner.title')}</Text>
            </View>
            <View pointerEvents="none" style={styles.overlay}>
                <View style={styles.scanWindow} />
            </View>
            <Text
                style={[styles.instructions, { bottom: insets.bottom + 96 }]}
            >
                {t('scanner.instructions')}
            </Text>
            {hint && (
                <Text style={[styles.hint, { bottom: insets.bottom + 148 }]}>
                    {hint}
                </Text>
            )}
        </View>
    );
}
