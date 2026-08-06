'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: admin } = await supabase
        .from('platform_admins')
        .select('id')
        .eq('email', user.email)
        .single();

      if (admin) {
        router.push('/dashboard/overview');
      } else {
        router.push('/school/dashboard');
      }
    }

    redirect();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  );
}
