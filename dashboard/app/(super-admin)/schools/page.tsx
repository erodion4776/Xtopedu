// app/(super-admin)/schools/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  Eye,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { superAdminApi, formatCurrency, formatDate } from '@/lib/api';
import toast from 'react-hot-toast';

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

export default function SchoolsPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadSchools();
  }, [search, status, page]);

  async function loadSchools() {
    setLoading(true);
    try {
      const data = await superAdminApi.getSchools({
        page,
        limit: 20,
        search: search || undefined,
        status: status !== 'all' ? status : undefined,
      });
      setSchools(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast.error('Failed to load schools');
    } finally {
      setLoading(false);
    }
  }

  async function toggleSchool(school: School) {
    try {
      await superAdminApi.updateSchool(school.id, {
        is_active: !school.is_active,
      });
      toast.success(
        `${school.name} ${school.is_active ? 'deactivated' : 'activated'}`
      );
      loadSchools();
    } catch {
      toast.error('Failed to update school');
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-gray-500">{total} total schools</p>
        </div>
        <Button onClick={loadSchools} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search schools..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Schools Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3 pt-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : schools.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No schools found
            </div>
          ) : (
            <div className="divide-y">
              {schools.map((school) => (
                <div
                  key={school.id}
                  className="py-4 flex items-center justify-between gap-4"
                >
                  {/* School Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">
                        {school.name}
                      </p>
                      <StatusBadge
                        status={school.onboarding_status}
                        isActive={school.is_active}
                      />
                      {school.setup_fee_paid && (
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-200"
                        >
                          Setup Paid ✅
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>📱 {school.phone ?? 'No phone'}</span>
                      <span>👥 {school.student_count} students</span>
                      <span>
                        💰 {formatCurrency(school.monthly_fee)}/mo
                      </span>
                      <span>📅 {formatDate(school.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 20 + 1} to{' '}
            {Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  isActive,
}: {
  status: string;
  isActive: boolean;
}) {
  if (!isActive) {
    return (
      <Badge variant="destructive" className="text-xs">
        Inactive
      </Badge>
    );
  }

  const statusConfig: Record<string, {
    label: string;
    className: string;
  }> = {
    active: {
      label: 'Active',
      className: 'bg-green-100 text-green-700',
    },
    setup_fee_pending: {
      label: 'Setup Pending',
      className: 'bg-yellow-100 text-yellow-700',
    },
    onboarding: {
      label: 'Onboarding',
      className: 'bg-blue-100 text-blue-700',
    },
    suspended: {
      label: 'Suspended',
      className: 'bg-red-100 text-red-700',
    },
  };

  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <Badge className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}
