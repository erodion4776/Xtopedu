'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';

interface Lead {
  id: string;
  contact_name: string;
  school_name: string;
  school_type: string | null;
  location: string | null;
  student_count: string | null;
  phone: string;
  email: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  demo_done: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    setError('');

    try {
      const { data, error: dbError } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;
      setLeads(data as Lead[] ?? []);
    } catch (err) {
      console.error('Leads error:', err);
      setError('Failed to load leads.');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('leads')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (!error) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, status } : l
        )
      );
    }
  }

  const filtered = leads.filter((l) => {
    const matchSearch =
      !search ||
      l.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      l.school_name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search);

    const matchFilter =
      filter === 'all' || l.status === filter;

    return matchSearch && matchFilter;
  });

  const counts = {
    all: leads.length,
    new: leads.filter((l) => l.status === 'new').length,
    contacted: leads.filter((l) => l.status === 'contacted').length,
    demo_done: leads.filter((l) => l.status === 'demo_done').length,
    converted: leads.filter((l) => l.status === 'converted').length,
    lost: leads.filter((l) => l.status === 'lost').length,
  };

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
          <h1 className="text-lg font-bold">Leads</h1>
          <p className="text-xs text-gray-500">
            {leads.length} total leads
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadLeads}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">

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
              {key === 'all' ? 'All' : key.replace('_', ' ')} ({count})
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
            {error}
            <button onClick={loadLeads} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}

        {/* Leads List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              {search || filter !== 'all'
                ? 'No leads match your filter'
                : 'No leads yet. Share your marketing bot link!'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((lead) => (
              <Card key={lead.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
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
                          <span>👥 {lead.student_count} students</span>
                        )}
                        {lead.school_type && (
                          <span>🏫 {lead.school_type}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(lead.created_at).toLocaleDateString(
                          'en-NG',
                          {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }
                        )}
                      </p>
                    </div>

                    {/* Status changer */}
                    <div className="shrink-0">
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          updateStatus(lead.id, e.target.value)
                        }
                        className="text-xs border rounded px-2 py-1 bg-white"
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="demo_done">Demo Done</option>
                        <option value="converted">Converted</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>
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
      </div>
    </div>
  );
}
