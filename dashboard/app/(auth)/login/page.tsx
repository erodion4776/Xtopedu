'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Step 1: Sign in with Supabase Auth
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        setError('Invalid email or password');
        return;
      }

      if (!data.user) {
        setError('Login failed. Please try again.');
        return;
      }

      // Step 2: Check if super admin
      const { data: platformAdmin } = await supabase
        .from('platform_admins')
        .select('id, role, full_name, is_active')
        .eq('email', email.trim())
        .eq('is_active', true)
        .single();

      if (platformAdmin) {
        // Super admin - go to super admin dashboard
        router.push('/dashboard');
        return;
      }

      // Step 3: Check if school admin or teacher
      const { data: schoolUser } = await supabase
        .from('school_users')
        .select(`
          id,
          school_id,
          status,
          roles ( name )
        `)
        .eq('user_id', data.user.id)
        .eq('status', 'active')
        .single();

      if (schoolUser) {
        // School staff - go to school dashboard
        router.push('/school/dashboard');
        return;
      }

      // No matching account found
      setError(
        'Your account does not have dashboard access. ' +
        'Contact your administrator.'
      );
      await supabase.auth.signOut();

    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md px-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">X</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            XtopEdu
          </h1>
          <p className="text-gray-500 mt-1">
            School Management Platform
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              Sign In
            </CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">

              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
                  ❌ {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@yourschool.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 text-base"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {/* Help text */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Forgot your password?{' '}
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-blue-600 hover:underline"
                >
                  Reset it here
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2025 XtopEdu. All rights reserved.
        </p>
      </div>
    </div>
  );

  async function handleForgotPassword() {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (error) {
      setError('Could not send reset email. Please try again.');
    } else {
      setError('');
      alert(`Password reset email sent to ${email}`);
    }
  }
}
