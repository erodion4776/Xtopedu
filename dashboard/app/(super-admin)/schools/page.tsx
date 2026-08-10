'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface School {
  id:                string;
  name:              string;
  email:             string | null;
  phone:             string | null;
  student_count:     number;
  subscription_plan: string;
  onboarding_status: string;
  is_active:         boolean;
  setup_fee_paid:    boolean;
  monthly_fee:       number;
  created_at:        string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

const PAGE_SIZE = 10;

export default function SchoolsPage() {
  const router = useRouter();
  const [schools, setSchools]   = useState<School[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [filter, setFilter]     = useState<
    'all' | 'active' | 'inactive'
  >('all');

  const loadSchools = useCallback(async () => {
    setLoading(true);

    try {
      const from = (page - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let query = supabase
        .from('schools')
        .select(
          'id, name, email, phone, student_count, ' +
          'subscription_plan, onboarding_status, ' +
          'is_active, setup_fee_paid, monthly_fee, ' +
          'created_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (search.trim()) {
        query = query.or(
          `name.ilike.%${search.trim()}%,` +
          `email.ilike.%${search.trim()}%`
        );
      }

      if (filter === 'active') {
        query = query.eq('is_active', true);
      } else if (filter === 'inactive') {
        query = query.eq('is_active', false);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // ✅ Fix: cast through unknown to avoid type error
      setSchools((data as unknown as School[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      console.error('Schools error:', err);
      toast.error('Failed to load schools');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  async function toggleSchool(school: School) {
    setToggling(school.id);

    const { error } = await supabase
      .from('schools')
      .update({
        is_active:  !school.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', school.id);

    if (error) {
      toast.error('Failed to update school status');
    } else {
      toast.success(
        school.is_active
          ? `${school.name} deactivated`
          : `${school.name} activated`
      );
      setSchools((prev) =>
        prev.map((s) =>
          s.id === school.id
            ? { ...s, is_active: !s.is_active }
            : s
        )
      );
    }

    setToggling(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-gray-500 text-sm">
            {total} total schools
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSchools}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading ? 'animate-spin' : ''
            }`}
          />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search schools by name or email..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'active', 'inactive'] as const).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          )
        )}
      </div>

      {/* Schools List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : schools.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {search || filter !== 'all'
              ? 'No schools match your search'
              : 'No schools registered yet'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schools.map((school) => (
            <Card
              key={school.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {school.name}
                      </p>
                      <Badge
                        className={`text-xs ${
                          school.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {school.is_active
                          ? 'Active'
                          : 'Inactive'}
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
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
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
                          day:   'numeric',
                          month: 'short',
                          year:  'numeric',
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
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSchool(school)}
                      disabled={toggling === school.id}
                      className={
                        school.is_active
                          ? 'text-red-500 hover:text-red-600'
                          : 'text-green-500 hover:text-green-600'
                      }
                      title={
                        school.is_active
                          ? 'Deactivate'
                          : 'Activate'
                      }
                    >
                      {toggling === school.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : school.is_active ? (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages} ({total} schools)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
