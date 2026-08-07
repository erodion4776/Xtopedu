'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface Log {
  id: string;
  school_id: string | null;
  level: string;
  category: string | null;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  schools?: { name: string }[] | null;
}

const levelColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  debug: 'bg-gray-100 text-gray-700',
};

const levelIcons: Record<string, string> = {
  info: '🔵',
  warning: '🟡',
  error: '🔴',
  debug: '⚪',
};

export default function LogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  async function loadLogs() {
    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('platform_logs')
        .select(`
          id, school_id, level, category,
          message, details, created_at,
          schools ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('level', filter);
      }

      const { data, error: dbError } = await query;

      if (dbError) throw dbError;

      // Cast as unknown first to avoid TypeScript conflict
      setLogs((data as unknown as Log[]) ?? []);
    } catch (err) {
      console.error('Logs error:', err);
      setError('Failed to load logs.');
    } finally {
      setLoading(false);
    }
  }

  const counts = {
    all: logs.length,
    error: logs.filter((l) => l.level === 'error').length,
    warning: logs.filter((l) => l.level === 'warning').length,
    info: logs.filter((l) => l.level === 'info').length,
    debug: logs.filter((l) => l.level === 'debug').length,
  };

  // Get school name from array safely
  function getSchoolName(log: Log): string | null {
    if (!log.schools) return null;
    if (Array.isArray(log.schools)) {
      return log.schools[0]?.name ?? null;
    }
    return (log.schools as { name: string }).name ?? null;
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
          <h1 className="text-lg font-bold">System Logs</h1>
          <p className="text-xs text-gray-500">
            Last 100 entries
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadLogs}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.entries(counts).map(([key, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                filter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {key === 'all' ? 'All' : key} ({count})
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
            <button
              onClick={loadLogs}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Logs */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No logs found. System is clean! ✅
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const schoolName = getSchoolName(log);
              return (
                <Card
                  key={log.id}
                  className={`cursor-pointer ${
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
                          {new Date(log.created_at).toLocaleString(
                            'en-NG',
                            {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
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

        {logs.length >= 100 && (
          <p className="text-center text-xs text-gray-400">
            Showing latest 100 logs
          </p>
        )}
      </div>
    </div>
  );
}
