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
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPwd, setShowPwd]   = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email:    email.trim(),
          password,
        });

      if (authError || !data.user) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Check platform admin
      const { data: platformAdmin } = await supabase
        .from('platform_admins')
        .select('id, role, is_active')
        .eq('email', data.user.email ?? '')
        .eq('is_active', true)
        .maybeSingle();

      if (platformAdmin) {
        toast.success('Welcome back!');
        window.location.href = '/dashboard';
        return;
      }

      // Check school staff
      const { data: schoolUser } = await supabase
        .from('school_users')
        .select('id, school_id')
        .eq('user_id', data.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (schoolUser) {
        toast.success('Welcome back!');
        window.location.href = '/school/dashboard';
        return;
      }

      // No access
      setError(
        'Your account does not have dashboard access.'
      );
      await supabase.auth.signOut();
      setLoading(false);

    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md px-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">
              X
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            XtopEdu
          </h1>
          <p className="text-gray-500 mt-1">
            School Management Platform
          </p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              Sign In
            </CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleLogin}
              className="space-y-4"
            >
              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                  <span>❌</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPwd
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={async () => {
                    if (!email.trim()) {
                      toast.error(
                        'Enter your email first'
                      );
                      return;
                    }
                    const { error } =
                      await supabase.auth
                        .resetPasswordForEmail(
                          email.trim(),
                          {
                            redirectTo:
                              `${window.location.origin}/reset-password`,
                          }
                        );
                    if (error) {
                      toast.error(error.message);
                    } else {
                      toast.success(
                        'Password reset email sent!'
                      );
                    }
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11"
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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} XtopEdu.
          All rights reserved.
        </p>
      </div>
    </div>
  );
}
