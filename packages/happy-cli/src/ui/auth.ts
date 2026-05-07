import { decodeBase64, encodeBase64, encodeBase64Url } from "@/api/encryption";
import { configuration } from "@/configuration";
import { randomBytes } from "node:crypto";
import tweetnacl from 'tweetnacl';
import axios from 'axios';
import { displayQRCode } from "./qrcode";
import { delay } from "@/utils/time";
import { writeCredentialsLegacy, readCredentials, updateSettings, Credentials, writeCredentialsDataKey } from "@/persistence";
import { generateWebAuthUrl } from "@/api/webAuth";
import { openBrowser } from "@/utils/browser";
import { AuthSelector, AuthMethod } from "./ink/AuthSelector";
import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';
import { open, stat, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

const AUTH_LOCKFILE_PATH = `${configuration.privateKeyFile}.auth.lock`;
const AUTH_LOCK_STALE_MS = 5 * 60 * 1000;
const AUTH_WAIT_TIMEOUT_MS = 90 * 1000;
const AUTH_WAIT_POLL_MS = 1000;

export async function doAuth(): Promise<Credentials | null> {
    console.clear();

    // Show authentication method selector
    const authMethod = await selectAuthenticationMethod();
    if (!authMethod) {
        console.log('\nAuthentication cancelled.\n');
        process.exit(0);
    }

    // Generating ephemeral key
    const secret = new Uint8Array(randomBytes(32));
    const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);

    // Create a new authentication request
    try {
        if (process.env.DEBUG) {
            console.log(`[AUTH DEBUG] Sending auth request to: ${configuration.serverUrl}/v1/auth/request`);
            console.log(`[AUTH DEBUG] Public key: ${encodeBase64(keypair.publicKey).substring(0, 20)}...`);
        }
        await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
            publicKey: encodeBase64(keypair.publicKey),
            supportsV2: true
        }, {
            headers: {
                'X-Happy-Client': `cli/${configuration.currentCliVersion}`
            }
        });
        if (process.env.DEBUG) {
            console.log(`[AUTH DEBUG] Auth request sent successfully`);
        }
    } catch (error) {
        if (process.env.DEBUG) {
            console.log(`[AUTH DEBUG] Failed to send auth request:`, error);
        }
        console.log('Failed to create authentication request, please try again later.');
        return null;
    }

    // Handle authentication based on selected method
    if (authMethod === 'mobile') {
        return await doMobileAuth(keypair);
    } else {
        return await doWebAuth(keypair);
    }
}

/**
 * Display authentication method selector and return user choice
 */
function selectAuthenticationMethod(): Promise<AuthMethod | null> {
    return new Promise((resolve) => {
        let hasResolved = false;

        const onSelect = (method: AuthMethod) => {
            if (!hasResolved) {
                hasResolved = true;
                app.unmount();
                resolve(method);
            }
        };

        const onCancel = () => {
            if (!hasResolved) {
                hasResolved = true;
                app.unmount();
                resolve(null);
            }
        };

        const app = render(React.createElement(AuthSelector, { onSelect, onCancel }), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    });
}

/**
 * Handle mobile authentication flow
 */
async function doMobileAuth(keypair: tweetnacl.BoxKeyPair): Promise<Credentials | null> {
    console.clear();
    console.log('\nMobile Authentication\n');
    console.log('Scan this QR code with your Happy mobile app:\n');

    const authUrl = 'happy://terminal?' + encodeBase64Url(keypair.publicKey);
    displayQRCode(authUrl);

    console.log('\nOr manually enter this URL:');
    console.log(authUrl);
    console.log('');

    return await waitForAuthentication(keypair);
}

/**
 * Handle web authentication flow
 */
async function doWebAuth(keypair: tweetnacl.BoxKeyPair): Promise<Credentials | null> {
    console.clear();
    console.log('\nWeb Authentication\n');

    const webUrl = generateWebAuthUrl(keypair.publicKey);
    console.log('Opening your browser...');

    const browserOpened = await openBrowser(webUrl);

    if (browserOpened) {
        console.log('✓ Browser opened\n');
        console.log('Complete authentication in your browser window.');
    } else {
        console.log('Could not open browser automatically.');
    }

    // I changed this to always show the URL because we got a report from
    // someone running happy inside a devcontainer that they saw the
    // "Complete authentication in your browser window." but nothing opened.
    // https://github.com/slopus/happy/issues/19
    console.log('\nIf the browser did not open, please copy and paste this URL:');
    console.log(webUrl);
    console.log('');

    return await waitForAuthentication(keypair);
}

/**
 * Wait for authentication to complete and return credentials
 */
async function waitForAuthentication(keypair: tweetnacl.BoxKeyPair): Promise<Credentials | null> {
    process.stdout.write('Waiting for authentication');
    let dots = 0;
    let cancelled = false;

    // Handle Ctrl-C during waiting
    const handleInterrupt = () => {
        cancelled = true;
        console.log('\n\nAuthentication cancelled.');
        process.exit(0);
    };

    process.on('SIGINT', handleInterrupt);

    try {
        while (!cancelled) {
            try {
                const response = await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
                    publicKey: encodeBase64(keypair.publicKey),
                    supportsV2: true
                }, {
                    headers: {
                        'X-Happy-Client': `cli/${configuration.currentCliVersion}`
                    }
                });
                if (response.data.state === 'authorized') {
                    let token = response.data.token as string;
                    let r = decodeBase64(response.data.response);
                    let decrypted = decryptWithEphemeralKey(r, keypair.secretKey);
                    if (decrypted) {
                        if (decrypted.length === 32) {
                            const credentials = {
                                secret: decrypted,
                                token: token
                            }
                            await writeCredentialsLegacy(credentials);
                            console.log('\n\n✓ Authentication successful\n');
                            return {
                                encryption: {
                                    type: 'legacy',
                                    secret: decrypted
                                },
                                token: token
                            };
                        } else {
                            if (decrypted[0] === 0) {
                                const credentials = {
                                    publicKey: decrypted.slice(1, 33),
                                    machineKey: randomBytes(32),
                                    token: token
                                }
                                await writeCredentialsDataKey(credentials);
                                console.log('\n\n✓ Authentication successful\n');
                                return {
                                    encryption: {
                                        type: 'dataKey',
                                        publicKey: credentials.publicKey,
                                        machineKey: credentials.machineKey
                                    },
                                    token: token
                                };
                            } else {
                                console.log('\n\nFailed to decrypt response. Please try again.');
                                return null;
                            }
                        }
                    } else {
                        console.log('\n\nFailed to decrypt response. Please try again.');
                        return null;
                    }
                }
            } catch (error) {
                console.log('\n\nFailed to check authentication status. Please try again.');
                return null;
            }

            // Animate waiting dots
            process.stdout.write('\rWaiting for authentication' + '.'.repeat((dots % 3) + 1) + '   ');
            dots++;

            await delay(1000);
        }
    } finally {
        process.off('SIGINT', handleInterrupt);
    }

    return null;
}

export function decryptWithEphemeralKey(encryptedBundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null {
    // Extract components from bundle: ephemeral public key (32 bytes) + nonce (24 bytes) + encrypted data
    const ephemeralPublicKey = encryptedBundle.slice(0, 32);
    const nonce = encryptedBundle.slice(32, 32 + tweetnacl.box.nonceLength);
    const encrypted = encryptedBundle.slice(32 + tweetnacl.box.nonceLength);

    const decrypted = tweetnacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
    if (!decrypted) {
        return null;
    }

    return decrypted;
}


/**
 * Ensure authentication and machine setup
 * This replaces the onboarding flow and ensures everything is ready
 */
export async function authAndSetupMachineIfNeeded(): Promise<{
    credentials: Credentials;
    machineId: string;
}> {
    logger.debug('[AUTH] Starting auth and machine setup...');

    // Step 1: Handle authentication
    const { credentials, newAuth } = await resolveCredentialsWithSharedAuth();

    // Make sure we have a machine ID
    // Server machine entity will be created either by the daemon or by the CLI
    const settings = await updateSettings(async s => {
        if (newAuth || !s.machineId) {
            return {
                ...s,
                machineId: randomUUID()
            };
        }
        return s;
    });

    logger.debug(`[AUTH] Machine ID: ${settings.machineId}`);

    return { credentials, machineId: settings.machineId! };
}

async function resolveCredentialsWithSharedAuth(): Promise<{
    credentials: Credentials;
    newAuth: boolean;
}> {
    const existingCredentials = await readCredentials();
    if (existingCredentials) {
        logger.debug('[AUTH] Using existing credentials');
        return { credentials: existingCredentials, newAuth: false };
    }

    const authDeadline = Date.now() + AUTH_WAIT_TIMEOUT_MS;
    while (true) {
        const authLock = await tryAcquireAuthLock();
        if (authLock) {
            try {
                const credentialsAfterLock = await readCredentials();
                if (credentialsAfterLock) {
                    logger.debug('[AUTH] Credentials became available while waiting on auth lock');
                    return { credentials: credentialsAfterLock, newAuth: false };
                }

                logger.debug('[AUTH] No credentials found, starting authentication flow...');
                const authResult = await doAuth();
                if (!authResult) {
                    throw new Error('Authentication failed or was cancelled');
                }
                return { credentials: authResult, newAuth: true };
            } finally {
                await releaseAuthLock(authLock);
            }
        }

        logger.debug('[AUTH] Another Happy process is completing authentication, waiting for shared credentials...');
        const sharedCredentials = await waitForSharedCredentials(authDeadline);
        if (sharedCredentials) {
            logger.debug('[AUTH] Reusing credentials written by another Happy process');
            return { credentials: sharedCredentials, newAuth: false };
        }

        if (Date.now() >= authDeadline) {
            logger.warn('[AUTH] Timed out waiting for another process to finish authentication; retrying locally');
        }
    }
}

async function tryAcquireAuthLock(): Promise<FileHandle | null> {
    try {
        return await open(AUTH_LOCKFILE_PATH, 'wx');
    } catch (error: any) {
        if (error?.code !== 'EEXIST') {
            throw error;
        }

        try {
            const lockStats = await stat(AUTH_LOCKFILE_PATH);
            if ((Date.now() - lockStats.mtimeMs) > AUTH_LOCK_STALE_MS) {
                logger.warn('[AUTH] Found stale authentication lock, cleaning it up');
                await unlink(AUTH_LOCKFILE_PATH).catch(() => { });
                return await open(AUTH_LOCKFILE_PATH, 'wx');
            }
        } catch {
            // If the lock disappears while we inspect it, the caller can simply retry.
        }

        return null;
    }
}

async function releaseAuthLock(lock: FileHandle) {
    await lock.close().catch(() => { });
    await unlink(AUTH_LOCKFILE_PATH).catch(() => { });
}

async function waitForSharedCredentials(deadline: number): Promise<Credentials | null> {
    while (Date.now() < deadline) {
        const sharedCredentials = await readCredentials();
        if (sharedCredentials) {
            return sharedCredentials;
        }

        try {
            await stat(AUTH_LOCKFILE_PATH);
        } catch {
            return await readCredentials();
        }

        await delay(AUTH_WAIT_POLL_MS);
    }

    return await readCredentials();
}
