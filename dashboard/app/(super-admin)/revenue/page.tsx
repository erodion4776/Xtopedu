// app/(super-admin)/revenue/page.tsx

'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Wrench,
  Percent,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { superAdminApi, formatCurrency, formatDate } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function RevenuePage() {
  const [revenue, setRevenue] = useState<{
    setup_fees: {
      all_time: number;
      this_month: number;
      this_year: number;
      count: number;
    };
    commissions: {
      all_time: number;
      this_month: number;
      this_year: number;
      count: number;
    };
    total: {
      all_time: number;
      this_month: number;
      this_year: number;
    };
  } | null>(null);

  const [chart, setChart] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [rev, chartData, paymentsData] = await Promise.all([
        superAdminApi.getRevenue(),
        superAdminApi.getRevenueChart(12),
        superAdminApi.getPayments(),
      ]);
      setRevenue(rev);
      setChart(chartData);
      setPayments(paymentsData.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-gray-500">
          Your platform earnings overview
        </p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-medium">
                  Total All Time
                </p>
                <p className="text-2xl font-bold text-green-700 mt-1">
                  {formatCurrency(revenue?.total.all_time ?? 0)}
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
                <p className="text-xs text-gray-500 font-medium">
                  This Month
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(revenue?.total.this_month ?? 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Setup Fees (All Time)
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(revenue?.setup_fees.all_time ?? 0)}
                </p>
                <p className="text-xs text-gray-400">
                  {revenue?.setup_fees.count} schools
                </p>
              </div>
              <Wrench className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Commissions (All Time)
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(
                    revenue?.commissions.all_time ?? 0
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  {revenue?.commissions.count} transactions
                </p>
              </div>
              <Percent className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue Breakdown</CardTitle>
          <CardDescription>
            Setup fees vs commissions over 12 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) =>
                  `₦${(v / 1000).toFixed(0)}k`
                }
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: number) => [
                  formatCurrency(v), ''
                ]}
              />
              <Legend />
              <Bar
                dataKey="setup_fees"
                name="Setup Fees"
                fill="#7c3aed"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="commissions"
                name="Commissions"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {(payments as Record<string, unknown>[]).map(
              (p, i) => {
                const school = p.schools as Record<
                  string, string
                > | null;
                return (
                  <div
                    key={i}
                    className="py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {school?.name ?? 'Unknown'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {p.payment_type === 'setup_fee'
                            ? '🔧 Setup Fee'
                            : '💸 Commission'}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {formatDate(p.paid_at as string ??
                            p.created_at as string)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">
                        {formatCurrency(
                          parseFloat(String(p.amount ?? 0))
                        )}
                      </p>
                      <Badge
                        className={`text-xs ${
                          p.status === 'Success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {p.status as string}
                      </Badge>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
