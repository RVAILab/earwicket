import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Diagnostic endpoint to test Sonos webhook signature validation
 * Helps identify credential issues without waiting for real Sonos webhooks
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      seqId,
      namespace,
      type,
      targetType,
      targetValue,
      signature,
    } = body;

    // Get credentials from environment
    const clientId = process.env.SONOS_CLIENT_ID || '';
    const clientSecret = process.env.SONOS_CLIENT_SECRET || '';
    const apiKey = process.env.SONOS_API_KEY || '';

    // Build message for signature
    const message =
      seqId +
      namespace +
      type +
      targetType +
      targetValue +
      clientId +
      clientSecret;

    // Compute hash
    const hash = crypto
      .createHash('sha256')
      .update(message, 'utf8')
      .digest('base64url');

    const isValid = hash === signature;

    // Return detailed diagnostic information
    return NextResponse.json({
      success: true,
      validation: {
        result: isValid,
        message: isValid ? 'Signature is VALID ✅' : 'Signature is INVALID ❌',
      },
      credentials: {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasApiKey: !!apiKey,
        clientIdLength: clientId.length,
        clientSecretLength: clientSecret.length,
        apiKeyLength: apiKey.length,
        // Show first 4 chars to help identify which credential is set
        clientIdPreview: clientId ? clientId.substring(0, 4) + '...' : '(empty)',
        clientSecretPreview: clientSecret ? clientSecret.substring(0, 4) + '...' : '(empty)',
        apiKeyPreview: apiKey ? apiKey.substring(0, 4) + '...' : '(empty)',
      },
      input: {
        seqId,
        namespace,
        type,
        targetType,
        targetValue,
        signatureLength: signature?.length || 0,
      },
      computed: {
        messageLength: message.length,
        hash: hash,
        hashPreview: hash.substring(0, 20) + '...',
      },
      comparison: {
        receivedSignature: signature,
        computedSignature: hash,
        match: hash === signature,
        lengthMatch: (signature?.length || 0) === hash.length,
      },
      debug: {
        messageComponents: {
          seqId: seqId?.length || 0,
          namespace: namespace?.length || 0,
          type: type?.length || 0,
          targetType: targetType?.length || 0,
          targetValue: targetValue?.length || 0,
          clientId: clientId.length,
          clientSecret: clientSecret.length,
          total: message.length,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to show instructions
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Sonos Webhook Signature Testing Endpoint',
    usage: {
      method: 'POST',
      body: {
        seqId: 'string - Event sequence ID from x-sonos-event-seq-id header',
        namespace: 'string - Namespace from x-sonos-namespace header',
        type: 'string - Type from x-sonos-type header',
        targetType: 'string - Target type from x-sonos-target-type header',
        targetValue: 'string - Target value from x-sonos-target-value header',
        signature: 'string - Signature from x-sonos-event-signature header',
      },
      example: {
        seqId: '123',
        namespace: 'playbackStatus',
        type: 'CHANGE',
        targetType: 'group',
        targetValue: 'RINCON_XXX:123456',
        signature: 'AbCdEf1234567890...',
      },
    },
    credentials: {
      hasClientId: !!process.env.SONOS_CLIENT_ID,
      hasClientSecret: !!process.env.SONOS_CLIENT_SECRET,
      hasApiKey: !!process.env.SONOS_API_KEY,
    },
  });
}
