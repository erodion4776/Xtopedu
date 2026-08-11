'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface SchoolInfo {
  id:    string;
  name:  string;
  phone: string | null;
}

// ✅ Your exact Meta credentials
const META_APP_ID    = '2411474669340870';
const META_CONFIG_ID = '1397969345545432';

// ✅ Meta-hosted URL as fallback
const META_SIGNUP_URL =
  'https://business.facebook.com/messaging/whatsapp/onboard/' +
  '?app_id=2411474669340870' +
  '&config_id=1397969345545432' +
  '&extras=%7B%22sessionInfoVersion%22%3A%223%22%2C%22version%22%3A%22v4%22%7D';

// Extend window type for FB SDK
declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: { status: string }) => void,
        opts: Record<string, unknown>
      ) => void;
      getLoginStatus: (
        cb: (response: { status: string }) => void
      ) => void;
    };
  }
}

export default function ActivatePage() {
  const params = useParams();
  const token  = params.token as string;

  const [school, setSchool]         =
    useState<SchoolInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected]   = useState(false);
  const [fbReady, setFbReady]       = useState(false);
  const [statusMsg, setStatusMsg]   = useState('');

  const sdkLoaded = useRef(false);

  useEffect(() => {
    loadSchool();
  }, [token]);

  // ── Load school from token ────────────────────────
  async function loadSchool() {
    setLoading(true);
    setError('');

    // Test mode for Meta reviewers
    if (token === 'test') {
      setSchool({
        id:    'test-school-id',
        name:  'Test School (Demo)',
        phone: null,
      });
      setLoading(false);
      initFbSdk();
      return;
    }

    try {
      const { data, error: dbError } = await supabase
        .from('school_activation_tokens')
        .select(`
          id,
          school_id,
          expires_at,
          used,
          schools (
            id,
            name,
            phone,
            setup_fee_paid,
            is_active
          )
        `)
        .eq('token', token)
        .maybeSingle();

      if (dbError || !data) {
        setError(
          'Invalid or expired activation link.\n\n' +
          'Please contact support for a new link.'
        );
        setLoading(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError(
          'This activation link has expired.\n\n' +
          'Please contact support for a new link.'
        );
        setLoading(false);
        return;
      }

      if (data.used) {
        setConnected(true);
        setLoading(false);
        return;
      }

      const s = data.schools as unknown as SchoolInfo;
      setSchool({ id: s.id, name: s.name, phone: s.phone });
      setLoading(false);

      // Load SDK after school is confirmed
      initFbSdk();

    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // ── Initialize Facebook SDK ───────────────────────
  // Using EXACTLY the code Meta gave you
  function initFbSdk() {
    if (sdkLoaded.current) return;
    sdkLoaded.current = true;

    // ✅ EXACT CODE FROM META
    window.fbAsyncInit = function () {
      window.FB.init({
        appId:            META_APP_ID,
        autoLogAppEvents: true,
        xfbml:            true,
        version:          'v26.0',  // ← Meta's latest version
      });

      // SDK is ready!
      setFbReady(true);
      setStatusMsg('✅ Ready to connect');
      console.log('[Activate] FB SDK ready ✅');

      // Listen for Embedded Signup messages
      window.addEventListener('message', handleFbMessage);
    };

    // ✅ EXACT SCRIPT FROM META
    const script       = document.createElement('script');
    script.src         =
      'https://connect.facebook.net/en_US/sdk.js';
    script.async       = true;
    script.defer       = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      console.log('[Activate] FB script loaded');
    };

    script.onerror = () => {
      console.error('[Activate] FB script failed');
      setStatusMsg('❌ Facebook failed to load');
    };

    document.body.appendChild(script);
  }

  // ── Handle Facebook postMessage ───────────────────
  function handleFbMessage(event: MessageEvent) {
    if (
      event.origin !== 'https://www.facebook.com' &&
      event.origin !== 'https://web.facebook.com'
    ) return;

    try {
      const data =
        typeof event.data === 'string'
          ? JSON.parse(event.data)
          : event.data;

      console.log('[Activate] FB message:', data);

      if (data.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH') {
          const {
            phone_number_id,
            waba_id,
          } = data.data;

          console.log('[Activate] ✅ FINISH:', {
            phone_number_id,
            waba_id,
          });

          handleSignupComplete(phone_number_id, waba_id);

        } else if (data.event === 'CANCEL') {
          setConnecting(false);
          setStatusMsg('Cancelled — try again');

        } else if (data.event === 'ERROR') {
          setConnecting(false);
          setError(
            `Setup error: ${
              data.data?.error_message ??
              'Unknown error'
            }`
          );
        }
      }
    } catch {
      // Not a relevant message
    }
  }

  // ── Handle signup completion ──────────────────────
  async function handleSignupComplete(
    phoneNumberId: string,
    wabaId:        string
  ) {
    setStatusMsg(`Got Phone Number ID: ${phoneNumberId}`);

    // Test mode — just show success
    if (token === 'test') {
      setConnected(true);
      setConnecting(false);
      return;
    }

    try {
      const res = await fetch(
        '/api/activate-school',
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            schoolId:      school?.id,
            phoneNumberId,
            wabaId,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }

      setConnected(true);
      setConnecting(false);
    } catch (err) {
      setError(`Activation failed: ${String(err)}`);
      setConnecting(false);
    }
  }

  // ── Launch Embedded Signup ────────────────────────
  function launchEmbeddedSignup() {
    if (!window.FB) {
      setStatusMsg('❌ Facebook not loaded yet');
      return;
    }

    setConnecting(true);
    setStatusMsg('Opening Facebook...');

    window.FB.login(
      (response) => {
        console.log('[Activate] Login:', response);
        setStatusMsg(`Status: ${response.status}`);

        if (response.status === 'connected') {
          setStatusMsg('Connected! Completing setup...');
          // FINISH message comes via postMessage
        } else if (response.status === 'not_authorized') {
          setConnecting(false);
          setStatusMsg('Please authorize the app');
        } else {
          // unknown — not logged into Facebook
          setConnecting(false);
          setStatusMsg(
            'Please log into Facebook first'
          );
        }
      },
      {
        config_id:    META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup:              {},
          featureType:        '',
          sessionInfoVersion: '3',
        },
      }
    );
  }

  // ── Loading ───────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 space-y-4">
          <Skeleton className="h-16 w-16 rounded-2xl mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">
              Activation Error
            </h2>
            <p className="text-gray-600 whitespace-pre-line mb-6">
              {error}
            </p>
            <a
              href="https://wa.me/2348184774884"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-green-600 text-white rounded-xl font-medium"
            >
              💬 Contact Support on WhatsApp
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Already Connected ─────────────────────────────
  if (connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">
              You&apos;re LIVE!
            </h2>
            <p className="text-gray-600 mb-6">
              <strong>{school?.name}</strong> is
              now connected to SchoolBot!
            </p>
            <div className="bg-green-50 rounded-xl p-4 text-left text-sm space-y-2 mb-4">
              <p className="font-semibold text-green-800">
                Next steps:
              </p>
              <p className="text-green-700">
                1️⃣ Open WhatsApp on your phone
              </p>
              <p className="text-green-700">
                2️⃣ Message your school&apos;s number
              </p>
              <p className="text-green-700">
                3️⃣ Type <strong>menu</strong>
              </p>
              <p className="text-green-700">
                4️⃣ Start managing your school! 🚀
              </p>
            </div>
            <p className="text-xs text-gray-400">
              Powered by SchoolBot · XtopEdu
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Page ─────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full px-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">
              X
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            XtopEdu
          </h1>
          <p className="text-gray-500 text-sm">
            SchoolBot Activation
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">

          {/* School */}
          <div className="text-center">
            <div className="text-4xl mb-3">🏫</div>
            <h2 className="text-xl font-bold">
              {school?.name}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Connect your WhatsApp number to go live
            </p>
          </div>

          {/* Steps */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-sm text-blue-800">
              What happens next:
            </p>
            <p className="text-sm text-blue-700">
              1️⃣ Facebook popup opens
            </p>
            <p className="text-sm text-blue-700">
              2️⃣ Login with your Facebook account
            </p>
            <p className="text-sm text-blue-700">
              3️⃣ Select your WhatsApp Business number
            </p>
            <p className="text-sm text-blue-700">
              4️⃣ Grant permission to SchoolBot
            </p>
            <p className="text-sm font-medium text-green-700">
              ✅ Your school goes LIVE instantly!
            </p>
          </div>

          {/* Status message */}
          {statusMsg && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 font-mono text-center">
              {statusMsg}
            </div>
          )}

          {/* ✅ SDK Button */}
          <Button
            onClick={launchEmbeddedSignup}
            disabled={connecting || !fbReady}
            className="w-full h-14 text-base bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl disabled:opacity-60"
          >
            {connecting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Connecting...
              </span>
            ) : !fbReady ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Loading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg
                  className="h-6 w-6"
                  fill="white"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                Connect WhatsApp via Facebook
              </span>
            )}
          </Button>

          {/* Fallback direct link */}
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-2">
              Button not working?
            </p>
            <a
              href={META_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline"
            >
              Click here to connect directly →
            </a>
          </div>

          <p className="text-center text-xs text-gray-400">
            🔒 Secure • Powered by Meta WhatsApp API
          </p>

        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} XtopEdu.
          All rights reserved.
        </p>

      </div>
    </div>
  );
}
