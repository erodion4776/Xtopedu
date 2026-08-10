'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Lead {
  id:            string;
  contact_name:  string;
  school_name:   string;
  school_type:   string | null;
  location:      string | null;
  student_count: string | null;
  phone:         string;
  email:         string | null;
  status:        string;
  notes:         string | null;
  created_at:    string;
}

const statusColors: Record<string, string> = {
  new:       'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  demo_done: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-700',
};

const PAGE_SIZE = 15;

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [counts, setCounts]   = useState<
    Record<string, number>
  >({});

  const loadLeads = useCallback(async () => {
    setLoading(true);

    try {
      const from = (page - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      if (search.trim()) {
        query = query.or(
          `contact_name.ilike.%${search.trim()}%,` +
          `school_name.ilike.%${search.trim()}%,` +
          `phone.ilike.%${search.trim()}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setLeads((data as Lead[]) ?? []);
      setTotal(count ?? 0);

      // Get counts per status
      const { data: allLeads } = await supabase
        .from('leads')
        .select('status');

      const c: Record<string, number> = { all: 0 };
      for (const l of allLeads ?? []) {
        c.all = (c.all ?? 0) + 1;
        c[l.status] = (c[l.status] ?? 0) + 1;
      }
      setCounts(c);

    } catch (err) {
      console.error('Leads error:', err);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('leads')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success('Status updated');
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, status } : l
        )
      );
    }
  }

  const statuses = [
    'all', 'new', 'contacted',
    'demo_done', 'converted', 'lost',
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-gray-500 text-sm">
            {total} total leads
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLeads}
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
          placeholder="Search by name, school or phone..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {key === 'all'
              ? 'All'
              : key.replace('_', ' ')}{' '}
            ({counts[key] ?? 0})
          </button>
        ))}
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {search || filter !== 'all'
              ? 'No leads match your filter'
              : 'No leads yet. Share your marketing bot link!'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <Card
              key={lead.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {lead.contact_name}
                      </p>
                      <Badge
                        className={`text-xs ${
                          statusColors[lead.status] ??
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {lead.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      🏫 {lead.school_name}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                      <span>📱 {lead.phone}</span>
                      {lead.location && (
                        <span>📍 {lead.location}</span>
                      )}
                      {lead.student_count && (
                        <span>
                          👥 {lead.student_count} students
                        </span>
                      )}
                      {lead.school_type && (
                        <span>🏫 {lead.school_type}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(lead.created_at)
                        .toLocaleDateString('en-NG', {
                          day:   'numeric',
                          month: 'short',
                          year:  'numeric',
                        })}
                    </p>
                  </div>

                  {/* Status changer */}
                  <select
                    value={lead.status}
                    onChange={(e) =>
                      updateStatus(lead.id, e.target.value)
                    }
                    className="text-xs border rounded px-2 py-1 bg-white shrink-0"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="demo_done">Demo Done</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                {/* Notes */}
                {lead.notes && (
                  <p className="text-xs text-gray-500 mt-2 border-t pt-2">
                    📝 {lead.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages}
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
