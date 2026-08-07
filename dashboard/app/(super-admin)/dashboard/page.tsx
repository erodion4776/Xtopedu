'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  School,
  DollarSign,
  Users,
  MessageSquare,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Stats {
  totalSchools: number;
  activeSchools: number;
  totalStudents: number;
  totalParents: number;
  activeSessions: number;
  monthRevenue: number;
  allTimeRevenue: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('Admin');
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
    loadStats();
  }, []);

  async function checkAuth() {
    const { data: { session } } =
      await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    const { data: admin } = await supabase
      .from('platform_admins')
      .select('full_name')
      .eq('email', session.user.email ?? '')
      .single();

    if (admin?.full_name) {
      setAdminName(admin.full_name.split(' ')[0]);
    }
  }

  async function loadStats() {
    setLoading(true);
    setError('');

    try {
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toISOString();

      // Run all queries in parallel
      const [
        schoolsRes,
        studentsRes,
        parentsRes,
        sessionsRes,
        monthRevenueRes,
        allRevenueRes,
      ] = await Promise.all([
        supabase
          .from('schools')
          .select('id, is_active'),
        supabase
          .from('students')
          .select('id', { count: 'exact' })
          .eq('status', 'active'),
        supabase
          .from('parents')
          .select('id', { count: 'exact' }),
        supabase
          .from('bot_sessions')
          .select('id', { count: 'exact' })
          .gte(
            'last_activity',
            new Date(Date.now() - 3600000).toISOString()
          ),
        supabase
          .from('platform_payments')
          .select('amount')
          .eq('status', 'Success')
          .gte('created_at', startOfMonth),
        supabase
          .from('platform_payments')
          .select('amount')
          .eq('status', 'Success'),
      ]);

      const schools = schoolsRes.data ?? [];
      const monthRev = (monthRevenueRes.data ?? []).reduce(
        (s, r) => s + parseFloat(String(r.amount ?? 0)),
        0
      );
      const allRev = (allRevenueRes.data ?? []).reduce(
        (s, r) => s + parseFloat(String(r.amount ?? 0)),
        0
      );

      setStats({
        totalSchools: schools.length,
        activeSchools: schools.filter((s) => s.is_active).length,
        totalStudents: studentsRes.count ?? 0,
        totalParents: parentsRes.count ?? 0,
        activeSessions: sessionsRes.count ?? 0,
        monthRevenue: monthRev,
        allTimeRevenue: allRev,
      });
    } catch (err) {
      console.error('Stats load error:', err);
      setError('Failed to load stats. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-blue-600">
            XtopEdu
          </h1>
          <p className="text-xs text-gray-500">Super Admin</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStats}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            {adminName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-red-500"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-4xl mx-auto">

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
            <button
              onClick={loadStats}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Page Title */}
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-gray-500 text-sm">
            Platform overview
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    Total Schools
                  </p>
                  <p className="text-2xl font-bold">
                    {stats?.totalSchools ?? 0}
                  </p>
                  <p className="text-xs text-green-600">
                    {stats?.activeSchools ?? 0} active
                  </p>
                </div>
                <School className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    This Month
                  </p>
                  <p className="text-lg font-bold">
                    {fmt(stats?.monthRevenue ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400">
                    Revenue
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    Students
                  </p>
                  <p className="text-2xl font-bold">
                    {(stats?.totalStudents ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(stats?.totalParents ?? 0).toLocaleString()} parents
                  </p>
                </div>
                <Users className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    Active Now
                  </p>
                  <p className="text-2xl font-bold">
                    {stats?.activeSessions ?? 0}
                  </p>
                  <p className="text-xs text-gray-400">
                    bot sessions
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* All Time Revenue */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-sm text-green-600 font-medium">
              Total All Time Revenue
            </p>
            <p className="text-3xl font-bold text-green-700 mt-1">
              {fmt(stats?.allTimeRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12"
            onClick={() => router.push('/schools')}
          >
            🏫 View Schools
          </Button>
          <Button
            variant="outline"
            className="h-12"
            onClick={() => router.push('/revenue')}
          >
            💰 View Revenue
          </Button>
        </div>
      </div>
    </div>
  );
}
