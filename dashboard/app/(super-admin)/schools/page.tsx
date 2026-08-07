'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  RefreshCw,
  Eye,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
} from 'lucide-react';

interface School {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  student_count: number;
  subscription_plan: string;
  onboarding_status: string;
  is_active: boolean;
  setup_fee_paid: boolean;
  monthly_fee: number;
  created_at: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);

export default function SchoolsPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadSchools();
  }, []);

  async function loadSchools() {
    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('schools')
        .select(`
          id, name, email, phone,
          student_count, subscription_plan,
          onboarding_status, is_active,
          setup_fee_paid, monthly_fee,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(
          `name.ilike.%${search}%,email.ilike.%${search}%`
        );
      }

      const { data, error: dbError } = await query;

      if (dbError) throw dbError;

      setSchools(data as School[] ?? []);
    } catch (err) {
      console.error('Schools load error:', err);
      setError('Failed to load schools.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleSchool(school: School) {
    const { error } = await supabase
      .from('schools')
      .update({
        is_active: !school.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', school.id);

    if (!error) {
      setSchools((prev) =>
        prev.map((s) =>
          s.id === school.id
            ? { ...s, is_active: !s.is_active }
            : s
        )
      );
    }
  }

  // Filter locally when searching
  const filtered = search
    ? schools.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.email?.toLowerCase().includes(search.toLowerCase())
      )
    : schools;

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
          <h1 className="text-lg font-bold">Schools</h1>
          <p className="text-xs text-gray-500">
            {schools.length} total
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSchools}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search schools..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
            <button
              onClick={loadSchools}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Schools List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              {search
                ? `No schools found for "${search}"`
                : 'No schools registered yet'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((school) => (
              <Card key={school.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
                          {school.name}
                        </p>
                        <Badge
                          className={`text-xs ${
                            school.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {school.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {school.setup_fee_paid && (
                          <Badge
                            variant="outline"
                            className="text-xs text-blue-600 border-blue-200"
                          >
                            ✅ Setup Paid
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>
                          📱 {school.phone ?? 'No phone'}
                        </span>
                        <span>
                          👥 {school.student_count ?? 0} students
                        </span>
                        <span>
                          💰 {fmt(school.monthly_fee ?? 0)}/mo
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {school.onboarding_status} •{' '}
                        {new Date(school.created_at)
                          .toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(`/schools/${school.id}`)
                        }
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSchool(school)}
                        className={
                          school.is_active
                            ? 'text-red-500'
                            : 'text-green-500'
                        }
                      >
                        {school.is_active ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
