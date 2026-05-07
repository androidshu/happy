
import axios from 'axios';
import { encodeBase64 } from "../encryption/base64";
import { getServerUrl } from "@/sync/serverConfig";
import { getHappyClientId } from "@/sync/apiSocket";

interface AuthRequestStatus {
    status: 'not_found' | 'pending' | 'authorized';
    supportsV2: boolean;
}

export type AuthApproveResult = 'approved' | 'already_authorized' | 'not_found';

export async function authApprove(token: string, publicKey: Uint8Array, answerV1: Uint8Array, answerV2: Uint8Array): Promise<AuthApproveResult> {
    const API_ENDPOINT = getServerUrl();
    const publicKeyBase64 = encodeBase64(publicKey);

    // First, check the auth request status
    const statusResponse = await axios.get<AuthRequestStatus>(
        `${API_ENDPOINT}/v1/auth/request/status`,
        {
            params: {
                publicKey: publicKeyBase64
            },
            headers: {
                'X-Happy-Client': getHappyClientId(),
            }
        }
    );

    const { status, supportsV2 } = statusResponse.data;

    if (status === 'not_found') {
        console.log('Auth request not found');
        return 'not_found';
    }

    if (status === 'authorized') {
        console.log('Auth request already authorized');
        return 'already_authorized';
    }

    await axios.post(
        `${API_ENDPOINT}/v1/auth/response`,
        {
            publicKey: publicKeyBase64,
            response: supportsV2 ? encodeBase64(answerV2) : encodeBase64(answerV1)
        },
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Happy-Client': getHappyClientId(),
            }
        }
    );

    return 'approved';
}
