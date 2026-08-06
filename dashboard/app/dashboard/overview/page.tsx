'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { superAdminApi, formatCurrency } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  School,
  DollarSign,
  Users,
  MessageSquare,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('Admin');

  useEffect(() => {
    checkAuth();
    loadStats();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    const { data: admin } = await supabase
      .from('platform_admins')
      .select('full_name')
      .eq('email', user.email)
      .single();

    if (admin?.full_name) {
      setAdminName(admin.full_name.split(' ')[0]);
    }
  }

  async function loadStats() {
    try {
      const data = await superAdminApi.getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
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
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const schools = stats?.schools as Record<string, number> | null;
  const users = stats?.users as Record<string, number> | null;
  const revenue = stats?.revenue as Record<string, number> | null;
  const activity = stats?.activity as Record<string, number> | null;
  const recentPayments = stats?.recent_payments as Array<Record<string, unknown>> | null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-blue-600">
            XtopEdu
          </h1>
          <p className="text-xs text-gray-500">
            Super Admin Dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            Hi, {adminName}!
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

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 space-y-6">

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
                    {schools?.total ?? 0}
                  </p>
                  <p className="text-xs text-green-600">
                    {schools?.active ?? 0} active
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
                  <p className="text-xl font-bold">
                    {formatCurrency(revenue?.this_month ?? 0)}
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
                    {(users?.students ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(users?.parents ?? 0).toLocaleString()} parents
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
                    {activity?.active_sessions ?? 0}
                  </p>
                  <p className="text-xs text-gray-400">
                    {activity?.messages_today ?? 0} msgs today
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
              {formatCurrency(revenue?.all_time ?? 0)}
            </p>
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments?.length ? (
              <div className="divide-y">
                {recentPayments.map((p, i) => {
                  const school = p.schools as Record<string, string> | null;
                  return (
                    <div
                      key={i}
                      className="py-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {school?.name ?? 'Unknown'}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-xs mt-1"
                        >
                          {p.payment_type === 'setup_fee'
                            ? '🔧 Setup Fee'
                            : '💸 Commission'}
                        </Badge>
                      </div>
                      <p className="text-sm font-bold text-green-600">
                        {formatCurrency(
                          parseFloat(String(p.amount ?? 0))
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No payments yet
              </p>
            )}
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
