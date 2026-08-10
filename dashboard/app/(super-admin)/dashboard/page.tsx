'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  School,
  DollarSign,
  Users,
  Activity,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';

interface Stats {
  totalSchools:   number;
  activeSchools:  number;
  totalStudents:  number;
  totalParents:   number;
  activeSessions: number;
  monthRevenue:   number;
  allTimeRevenue: number;
}

interface RevenuePoint {
  month:        string;
  revenue:      number;
  setupFees:    number;
  commissions:  number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats]           = useState<Stats | null>(null);
  const [chart, setChart]           = useState<RevenuePoint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminName, setAdminName]   = useState('Admin');

  const loadAll = useCallback(async (
    showRefresh = false
  ) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Auth check
      const { data: { session } } =
        await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      // Get admin name
      const { data: admin } = await supabase
        .from('platform_admins')
        .select('full_name')
        .eq('email', session.user.email ?? '')
        .single();

      if (admin?.full_name) {
        setAdminName(admin.full_name.split(' ')[0]);
      }

      const now          = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toISOString();

      // Load all stats in parallel
      const [
        schoolsRes,
        studentsRes,
        parentsRes,
        sessionsRes,
        monthRevRes,
        allRevRes,
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
            new Date(
              Date.now() - 3600000
            ).toISOString()
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

      const schools  = schoolsRes.data ?? [];
      const monthRev = (monthRevRes.data ?? []).reduce(
        (s, r) => s + parseFloat(String(r.amount ?? 0)),
        0
      );
      const allRev = (allRevRes.data ?? []).reduce(
        (s, r) => s + parseFloat(String(r.amount ?? 0)),
        0
      );

      setStats({
        totalSchools:   schools.length,
        activeSchools:  schools.filter(
          (s) => s.is_active
        ).length,
        totalStudents:  studentsRes.count  ?? 0,
        totalParents:   parentsRes.count   ?? 0,
        activeSessions: sessionsRes.count  ?? 0,
        monthRevenue:   monthRev,
        allTimeRevenue: allRev,
      });

      // Load revenue chart
      await loadRevenueChart();

      if (showRefresh) {
        toast.success('Dashboard refreshed!');
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  async function loadRevenueChart() {
    const points: RevenuePoint[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d     = new Date(
        now.getFullYear(),
        now.getMonth() - i,
        1
      );
      const start = d.toISOString();
      const end   = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        1
      ).toISOString();

      const month = d.toLocaleDateString('en-NG', {
        month: 'short',
        year:  '2-digit',
      });

      const { data } = await supabase
        .from('platform_payments')
        .select('amount, payment_type')
        .eq('status', 'Success')
        .gte('created_at', start)
        .lt('created_at', end);

      const rows        = data ?? [];
      const setupFees   = rows
        .filter((r) => r.payment_type === 'setup_fee')
        .reduce(
          (s, r) =>
            s + parseFloat(String(r.amount ?? 0)),
          0
        );
      const commissions = rows
        .filter((r) => r.payment_type === 'commission')
        .reduce(
          (s, r) =>
            s + parseFloat(String(r.amount ?? 0)),
          0
        );

      points.push({
        month,
        revenue:     setupFees + commissions,
        setupFees,
        commissions,
      });
    }

    setChart(points);
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            Dashboard
          </h2>
          <p className="text-gray-500 text-sm">
            Welcome back, {adminName}! 👋
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAll(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${
              refreshing ? 'animate-spin' : ''
            }`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  Total Schools
                </p>
                <p className="text-2xl font-bold mt-1">
                  {stats?.totalSchools ?? 0}
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  {stats?.activeSchools ?? 0} active
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                <School className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  This Month
                </p>
                <p className="text-lg font-bold mt-1">
                  {fmt(stats?.monthRevenue ?? 0)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Revenue
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  Students
                </p>
                <p className="text-2xl font-bold mt-1">
                  {(
                    stats?.totalStudents ?? 0
                  ).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(
                    stats?.totalParents ?? 0
                  ).toLocaleString()} parents
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  Active Now
                </p>
                <p className="text-2xl font-bold mt-1">
                  {stats?.activeSessions ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  bot sessions
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center">
                <Activity className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* All Time Revenue */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">
                Total All Time Revenue
              </p>
              <p className="text-3xl font-bold text-green-700 mt-1">
                {fmt(stats?.allTimeRevenue ?? 0)}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-400" />
          </div>
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      {chart.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Revenue — Last 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient
                    id="colorRevenue"
                    x1="0" y1="0"
                    x2="0" y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#3b82f6"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f0f0f0"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1000
                      ? `₦${(v / 1000).toFixed(0)}k`
                      : `₦${v}`
                  }
                />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{
                    fontSize:     12,
                    borderRadius: 8,
                    border:       '1px solid #e5e7eb',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  name="Revenue"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-12 font-medium"
          onClick={() => router.push('/schools')}
        >
          🏫 View Schools
        </Button>
        <Button
          variant="outline"
          className="h-12 font-medium"
          onClick={() => router.push('/revenue')}
        >
          💰 View Revenue
        </Button>
        <Button
          variant="outline"
          className="h-12 font-medium"
          onClick={() => router.push('/leads')}
        >
          🧲 View Leads
        </Button>
        <Button
          variant="outline"
          className="h-12 font-medium"
          onClick={() => router.push('/logs')}
        >
          📋 System Logs
        </Button>
      </div>

    </div>
  );
}
