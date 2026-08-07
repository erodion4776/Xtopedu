'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw } from 'lucide-react';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);

export default function RevenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    setupFees: 0,
    commissions: 0,
    total: 0,
    thisMonth: 0,
    count: 0,
  });
  const [payments, setPayments] = useState<
    Record<string, unknown>[]
  >([]);

  useEffect(() => {
    loadRevenue();
  }, []);

  async function loadRevenue() {
    setLoading(true);
    setError('');

    try {
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toISOString();

      const [allPayments, monthPayments, recentPayments] =
        await Promise.all([
          supabase
            .from('platform_payments')
            .select('amount, payment_type')
            .eq('status', 'Success'),
          supabase
            .from('platform_payments')
            .select('amount')
            .eq('status', 'Success')
            .gte('created_at', startOfMonth),
          supabase
            .from('platform_payments')
            .select(`
              amount, payment_type, status,
              paid_at, created_at, notes,
              schools ( name )
            `)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

      const all = allPayments.data ?? [];
      const month = monthPayments.data ?? [];

      const setupFees = all
        .filter((p) => p.payment_type === 'setup_fee')
        .reduce(
          (s, p) => s + parseFloat(String(p.amount ?? 0)),
          0
        );

      const commissions = all
        .filter((p) => p.payment_type === 'commission')
        .reduce(
          (s, p) => s + parseFloat(String(p.amount ?? 0)),
          0
        );

      const thisMonth = month.reduce(
        (s, p) => s + parseFloat(String(p.amount ?? 0)),
        0
      );

      setStats({
        setupFees,
        commissions,
        total: setupFees + commissions,
        thisMonth,
        count: all.length,
      });

      setPayments(
        (recentPayments.data ?? []) as Record<string, unknown>[]
      );
    } catch (err) {
      console.error('Revenue error:', err);
      setError('Failed to load revenue data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-3">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-4 space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Revenue</h1>
          <p className="text-xs text-gray-500">
            Your platform earnings
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadRevenue}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Total Revenue */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-sm text-green-600 font-medium">
              Total All Time Revenue
            </p>
            <p className="text-3xl font-bold text-green-700 mt-1">
              {fmt(stats.total)}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {stats.count} total transactions
            </p>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">This Month</p>
              <p className="text-xl font-bold mt-1">
                {fmt(stats.thisMonth)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">Setup Fees</p>
              <p className="text-xl font-bold mt-1">
                {fmt(stats.setupFees)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">Commissions</p>
              <p className="text-xl font-bold mt-1">
                {fmt(stats.commissions)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">Transactions</p>
              <p className="text-xl font-bold mt-1">
                {stats.count}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Payments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Recent Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No payments yet
              </p>
            ) : (
              <div className="divide-y">
                {payments.map((p, i) => {
                  const school = p.schools as
                    | Record<string, string>
                    | null;
                  const amount = parseFloat(
                    String(p.amount ?? 0)
                  );
                  const date = new Date(
                    String(p.paid_at ?? p.created_at)
                  ).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={i}
                      className="py-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {school?.name ?? 'Unknown School'}
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
                            {date}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">
                          {fmt(amount)}
                        </p>
                        <Badge
                          className={`text-xs ${
                            p.status === 'Success'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {String(p.status)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
