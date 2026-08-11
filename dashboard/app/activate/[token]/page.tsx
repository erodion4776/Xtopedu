'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface SchoolInfo {
  id:   string;
  name: string;
  phone: string | null;
}

const META_APP_ID    =
  process.env.NEXT_PUBLIC_META_APP_ID    ?? '';
const META_CONFIG_ID =
  process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';

export default function ActivatePage() {
  const params     = useParams();
  const router     = useRouter();
  const token      = params.token as string;

  const [school, setSchool]     = useState<SchoolInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected]   = useState(false);
  const fbSdkLoaded = useRef(false);

  // ── Load school from activation token ──────────────────
  useEffect(() => {
    loadSchool();
  }, [token]);

  async function loadSchool() {
    try {
      // Find school by activation token
      const { data, error: dbError } = await supabase
        .from('school_activation_tokens')
        .select(`
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
        .single();

      if (dbError || !data) {
        setError('Invalid or expired activation link.');
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setError(
          'This activation link has expired.\n\n' +
          'Please contact XtopEdu support for a new link.'
        );
        setLoading(false);
        return;
      }

      // Check if already used
      if (data.used) {
        setConnected(true);
        setLoading(false);
        return;
      }

      const schoolData =
        data.schools as unknown as SchoolInfo;

      // Check if setup fee paid
      const s = data.schools as unknown as {
        setup_fee_paid: boolean;
        is_active: boolean;
      };

      if (!s.setup_fee_paid) {
        setError(
          'Setup fee not paid yet.\n\n' +
          'Please complete payment first.'
        );
        setLoading(false);
        return;
      }

      setSchool(schoolData);
      setLoading(false);

      // Load Facebook SDK
      loadFbSdk();
    } catch (err) {
      console.error('Load school error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // ── Load Facebook SDK ───────────────────────────────────
  function loadFbSdk() {
    if (fbSdkLoaded.current || !META_APP_ID) return;
    fbSdkLoaded.current = true;

    const script       = document.createElement('script');
    script.src         = 'https://connect.facebook.net/en_US/sdk.js';
    script.async       = true;
    script.defer       = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);

    script.onload = () => {
      (window as unknown as Record<string, unknown>)
        .fbAsyncInit = () => {
        (window as unknown as {
          FB: { init: (o: Record<string, unknown>) => void };
        }).FB.init({
          appId:   META_APP_ID,
          version: 'v18.0',
        });
      };
    };

    // Listen for embedded signup messages
    window.addEventListener('message', handleMessage);
  }

  // ── Handle Facebook message ─────────────────────────────
  function handleMessage(event: MessageEvent) {
    if (
      event.origin !== 'https://www.facebook.com' &&
      event.origin !== 'https://web.facebook.com'
    ) return;

    try {
      const data =
        typeof event.data === 'string'
          ? JSON.parse(event.data)
          : event.data;

      if (data.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH') {
          const { phone_number_id, waba_id } = data.data;
          handleSignupComplete(phone_number_id, waba_id);
        } else if (data.event === 'CANCEL') {
          setConnecting(false);
        } else if (data.event === 'ERROR') {
          setConnecting(false);
          setError(
            `Error: ${data.data?.error_message ?? 'Unknown error'}`
          );
        }
      }
    } catch {
      // Not a JSON message
    }
  }

  // ── Handle signup completion ────────────────────────────
  async function handleSignupComplete(
    phoneNumberId: string,
    wabaId:        string
  ) {
    if (!school) return;

    try {
      // Call your API to activate the school
      const res = await fetch('/api/activate-school', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          schoolId:      school.id,
          phoneNumberId,
          wabaId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Activation failed');
      }

      setConnected(true);
      setConnecting(false);
    } catch (err) {
      console.error('Activation error:', err);
      setError(`Activation failed: ${String(err)}`);
      setConnecting(false);
    }
  }

  // ── Launch embedded signup ──────────────────────────────
  function launchEmbeddedSignup() {
    const fb = (window as unknown as {
      FB?: {
        login: (
          cb: (r: Record<string, unknown>) => void,
          opts: Record<string, unknown>
        ) => void;
      };
    }).FB;

    if (!fb) {
      setError(
        'Facebook SDK not loaded.\n' +
        'Please refresh the page and try again.'
      );
      return;
    }

    setConnecting(true);

    fb.login(
      (response: Record<string, unknown>) => {
        if (response.status !== 'connected') {
          setConnecting(false);
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

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 space-y-4">
          <Skeleton className="h-12 w-48 mx-auto" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-xl font-bold mb-2">
              Activation Error
            </h2>
            <p className="text-gray-600 whitespace-pre-line">
              {error}
            </p>
            <p className="text-sm text-gray-400 mt-4">
              Contact support: {' '}
              <a
                href={`https://wa.me/${
                  process.env
                    .NEXT_PUBLIC_SUPPORT_WHATSAPP ??
                  ''
                }`}
                className="text-blue-600 underline"
              >
                WhatsApp Us
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Already Connected ───────────────────────────────────
  if (connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-4 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">
              You're LIVE!
            </h2>
            <p className="text-gray-600 mb-6">
              <strong>{school?.name}</strong> WhatsApp
              bot is now active!
            </p>
            <div className="bg-blue-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6">
              <p className="font-semibold text-blue-800">
                What to do next:
              </p>
              <p>1️⃣ Open WhatsApp on your phone</p>
              <p>
                2️⃣ Message your school's WhatsApp number
              </p>
              <p>3️⃣ Type <strong>menu</strong></p>
              <p>4️⃣ Start using SchoolBot! 🚀</p>
            </div>
            <p className="text-xs text-gray-400">
              Powered by SchoolBot · XtopEdu
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Page ───────────────────────────────────────────
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
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">

          {/* School Name */}
          <div className="text-center">
            <div className="text-3xl mb-2">🏫</div>
            <h2 className="text-xl font-bold">
              {school?.name}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Connect your WhatsApp number to go live
            </p>
          </div>

          {/* Steps */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="font-semibold text-sm text-gray-700">
              What happens when you click connect:
            </p>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <span>1️⃣</span>
                <span>
                  Facebook popup opens on your screen
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span>2️⃣</span>
                <span>
                  Log in with your Facebook account
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span>3️⃣</span>
                <span>
                  Select or verify your WhatsApp
                  Business number
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span>4️⃣</span>
                <span>
                  Grant permission to SchoolBot
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span>✅</span>
                <span className="font-medium text-green-700">
                  Your school bot goes LIVE instantly!
                </span>
              </div>
            </div>
          </div>

          {/* Connect Button */}
          <Button
            onClick={launchEmbeddedSignup}
            disabled={connecting}
            className="w-full h-14 text-base bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl"
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

          <p className="text-center text-xs text-gray-400">
            🔒 Secure • Takes less than 2 minutes
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
