// app/(super-admin)/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import {
  School,
  DollarSign,
  Users,
  MessageSquare,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { superAdminApi, formatCurrency, formatDate } from '@/lib/api';

interface DashboardStats {
  schools: {
    total: number;
    active: number;
    inactive: number;
    onboarding: number;
  };
  users: {
    students: number;
    parents: number;
    staff: number;
  };
  revenue: {
    this_month: number;
    all_time: number;
  };
  activity: {
    active_sessions: number;
    messages_today: number;
    open_tickets: number;
  };
  recent_payments: Array<{
    amount: number;
    payment_type: string;
    paid_at: string;
    schools: { name: string };
  }>;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsData, chartData] = await Promise.all([
        superAdminApi.getStats(),
        superAdminApi.getRevenueChart(6),
      ]);
      setStats(statsData);
      setRevenueChart(chartData);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard
        </h1>
        <p className="text-gray-500">
          Welcome back! Here's your platform overview.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Schools"
          value={stats?.schools.total ?? 0}
          sub={`${stats?.schools.active ?? 0} active`}
          icon={School}
          color="blue"
        />
        <StatsCard
          title="This Month"
          value={formatCurrency(stats?.revenue.this_month ?? 0)}
          sub="Revenue"
          icon={DollarSign}
          color="green"
        />
        <StatsCard
          title="Total Students"
          value={(stats?.users.students ?? 0).toLocaleString()}
          sub={`${(stats?.users.parents ?? 0).toLocaleString()} parents`}
          icon={Users}
          color="purple"
        />
        <StatsCard
          title="Active Now"
          value={stats?.activity.active_sessions ?? 0}
          sub={`${stats?.activity.messages_today ?? 0} msgs today`}
          icon={MessageSquare}
          color="orange"
        />
      </div>

      {/* Revenue Chart + Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Revenue (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(v) =>
                    `₦${(v / 1000).toFixed(0)}k`
                  }
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v: number) => [
                    formatCurrency(v), 'Revenue'
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest platform income</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.recent_payments?.length ? (
                stats.recent_payments.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium truncate max-w-[120px]">
                        {p.schools?.name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {p.payment_type === 'setup_fee'
                          ? '🔧 Setup'
                          : '💸 Commission'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-600">
                        {formatCurrency(p.amount)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(p.paid_at)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No payments yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* School Status */}
        <Card>
          <CardHeader>
            <CardTitle>School Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              label="Active Schools"
              value={stats?.schools.active ?? 0}
              color="green"
            />
            <StatusRow
              label="In Onboarding"
              value={stats?.schools.onboarding ?? 0}
              color="yellow"
            />
            <StatusRow
              label="Inactive"
              value={stats?.schools.inactive ?? 0}
              color="red"
            />
            <div className="pt-2 border-t">
              <StatusRow
                label="Total"
                value={stats?.schools.total ?? 0}
                color="blue"
              />
            </div>
          </CardContent>
        </Card>

        {/* All Time Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>All Time Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(stats?.revenue.all_time ?? 0)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Total platform earnings
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">This Month</span>
                <span className="font-medium">
                  {formatCurrency(stats?.revenue.this_month ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats?.activity.open_tickets ? (
              <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <span className="text-sm text-orange-700">
                  Open Support Tickets
                </span>
                <Badge variant="destructive">
                  {stats.activity.open_tickets}
                </Badge>
              </div>
            ) : null}

            <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
              <span className="text-sm text-blue-700">
                Active Bot Sessions
              </span>
              <Badge className="bg-blue-100 text-blue-700">
                {stats?.activity.active_sessions ?? 0}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-2 bg-green-50 rounded">
              <span className="text-sm text-green-700">
                Messages Today
              </span>
              <Badge className="bg-green-100 text-green-700">
                {stats?.activity.messages_today ?? 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub Components ────────────────────────────────────────────

function StatsCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">
              {title}
            </p>
            <p className="text-xl font-bold mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className={`p-2 rounded-lg ${colors[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colors = {
    green:  'bg-green-500',
    yellow: 'bg-yellow-500',
    red:    'bg-red-500',
    blue:   'bg-blue-500',
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${colors[color]}`}
        />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
