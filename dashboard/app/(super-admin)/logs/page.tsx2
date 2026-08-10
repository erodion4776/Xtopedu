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

interface Log {
  id:         string;
  school_id:  string | null;
  level:      string;
  category:   string | null;
  message:    string;
  details:    Record<string, unknown> | null;
  created_at: string;
  schools?:   { name: string }[] | null;
}

const levelColors: Record<string, string> = {
  info:    'bg-blue-100 text-blue-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error:   'bg-red-100 text-red-700',
  debug:   'bg-gray-100 text-gray-700',
};

const levelIcons: Record<string, string> = {
  info:    '🔵',
  warning: '🟡',
  error:   '🔴',
  debug:   '⚪',
};

const PAGE_SIZE = 20;

export default function LogsPage() {
  const router = useRouter();
  const [logs, setLogs]         = useState<Log[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);

    try {
      const from = (page - 1) * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let query = supabase
        .from('platform_logs')
        .select(
          `id, school_id, level, category,
           message, details, created_at,
           schools ( name )`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter !== 'all') {
        query = query.eq('level', filter);
      }

      if (search.trim()) {
        query = query.ilike(
          'message',
          `%${search.trim()}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setLogs((data as unknown as Log[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      console.error('Logs error:', err);
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  function getSchoolName(log: Log): string | null {
    if (!log.schools) return null;
    if (Array.isArray(log.schools)) {
      return log.schools[0]?.name ?? null;
    }
    return (log.schools as { name: string }).name ?? null;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const levels = ['all', 'error', 'warning', 'info', 'debug'];

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
          <h1 className="text-2xl font-bold">
            System Logs
          </h1>
          <p className="text-gray-500 text-sm">
            {total} total entries
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
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
          placeholder="Search log messages..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {levels.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {key === 'all' ? 'All' : key}
          </button>
        ))}
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {search || filter !== 'all'
              ? 'No logs match your filter'
              : '✅ No logs found. System is clean!'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const schoolName = getSchoolName(log);
            return (
              <Card
                key={log.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  log.level === 'error'
                    ? 'border-red-200'
                    : log.level === 'warning'
                    ? 'border-yellow-200'
                    : ''
                }`}
                onClick={() =>
                  setExpanded(
                    expanded === log.id ? null : log.id
                  )
                }
              >
                <CardContent className="py-2 px-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">
                      {levelIcons[log.level] ?? '•'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={`text-xs ${
                            levelColors[log.level] ??
                            'bg-gray-100'
                          }`}
                        >
                          {log.level}
                        </Badge>
                        {log.category && (
                          <span className="text-xs text-gray-500">
                            {log.category}
                          </span>
                        )}
                        {schoolName && (
                          <span className="text-xs text-blue-600">
                            🏫 {schoolName}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 mt-0.5 break-words">
                        {log.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(log.created_at)
                          .toLocaleString('en-NG', {
                            day:    'numeric',
                            month:  'short',
                            hour:   '2-digit',
                            minute: '2-digit',
                          })}
                      </p>

                      {/* Expanded details */}
                      {expanded === log.id &&
                        log.details && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 overflow-x-auto">
                            <pre>
                              {JSON.stringify(
                                log.details,
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages} ({total} entries)
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
