'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TrialCode {
  id:            string;
  code:          string;
  school_name:   string | null;
  notes:         string | null;
  used:          boolean;
  used_at:       string | null;
  used_by_phone: string | null;
  expires_at:    string;
  created_at:    string;
}

export default function TrialCodesPage() {
  const [codes, setCodes]         = useState<TrialCode[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [notes, setNotes]         = useState('');
  const [showForm, setShowForm]   = useState(false);

  useEffect(() => {
    loadCodes();
  }, []);

  async function loadCodes() {
    setLoading(true);
    const { data } = await supabase
      .from('trial_codes')
      .select('*')
      .order('created_at', { ascending: false });

    setCodes((data as TrialCode[]) ?? []);
    setLoading(false);
  }

  // ── Generate random code ──────────────────────────
  function generateRandomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part1 = Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    const part2 = Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `TRIAL-${part1}-${part2}`;
  }

  // ── Create new trial code ─────────────────────────
  async function handleGenerate() {
    setGenerating(true);

    try {
      const code = generateRandomCode();

      // Expires in 24 hours
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from('trial_codes')
        .insert({
          code,
          school_name: schoolName.trim() || null,
          notes:       notes.trim() || null,
          created_by:  'super_admin',
          expires_at:  expiresAt,
          used:        false,
          created_at:  new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`✅ Code generated: ${code}`);
      setCodes((prev) => [
        data as TrialCode, ...prev
      ]);
      setSchoolName('');
      setNotes('');
      setShowForm(false);
    } catch (err) {
      toast.error('Failed to generate code');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  // ── Copy code to clipboard ────────────────────────
  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast.success('Code copied!');
  }

  // ── Copy WhatsApp message ─────────────────────────
  async function copyWaMessage(code: string) {
    const msg =
      `🎉 *Try SchoolBot FREE!*\n\n` +
      `Message us on WhatsApp:\n` +
      `*+2348184774884*\n\n` +
      `Use this FREE trial code:\n` +
      `*${code}*\n\n` +
      `⏰ Valid for *24 hours* only!\n` +
      `One-time use — don't share!\n\n` +
      `_SchoolBot by XtopEdu_`;

    await navigator.clipboard.writeText(msg);
    toast.success('WhatsApp message copied!');
  }

  // ── Get code status ───────────────────────────────
  function getStatus(code: TrialCode): {
    label: string;
    color: string;
    icon:  JSX.Element;
  } {
    if (code.used) {
      return {
        label: 'Used',
        color: 'bg-gray-100 text-gray-600',
        icon:  <XCircle className="h-3 w-3" />,
      };
    }

    if (new Date(code.expires_at) < new Date()) {
      return {
        label: 'Expired',
        color: 'bg-red-100 text-red-600',
        icon:  <XCircle className="h-3 w-3" />,
      };
    }

    // Calculate hours remaining
    const hoursLeft = Math.ceil(
      (new Date(code.expires_at).getTime() -
        Date.now()) / 3600000
    );

    return {
      label: `Active (${hoursLeft}h left)`,
      color: 'bg-green-100 text-green-700',
      icon:  <CheckCircle className="h-3 w-3" />,
    };
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Trial Codes
          </h1>
          <p className="text-gray-500 text-sm">
            Generate free trial codes for schools
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCodes}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${
              loading ? 'animate-spin' : ''
            }`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Generate Code
          </Button>
        </div>
      </div>

      {/* Generate Form */}
      {showForm && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              🎁 Generate Free Trial Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="bg-white rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p>✅ One-time use only</p>
              <p>✅ Expires in 24 hours</p>
              <p>✅ Waives setup fee completely</p>
              <p>✅ School can complete full onboarding FREE</p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="schoolName">
                  School Name (optional)
                </Label>
                <Input
                  id="schoolName"
                  placeholder="e.g. Greenfield Academy"
                  value={schoolName}
                  onChange={(e) =>
                    setSchoolName(e.target.value)
                  }
                />
                <p className="text-xs text-gray-400 mt-1">
                  For your reference only
                </p>
              </div>

              <div>
                <Label htmlFor="notes">
                  Notes (optional)
                </Label>
                <Input
                  id="notes"
                  placeholder="e.g. Referred by John"
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1"
              >
                {generating
                  ? '⏳ Generating...'
                  : '🎁 Generate Free Trial Code'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {codes.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Total Generated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {codes.filter((c) =>
                !c.used &&
                new Date(c.expires_at) > new Date()
              ).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-gray-600">
              {codes.filter((c) => c.used).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Codes List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="h-16 bg-gray-100 animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : codes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No trial codes generated yet.
            <br />
            Click "Generate Code" to create one!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {codes.map((code) => {
            const status = getStatus(code);
            return (
              <Card
                key={code.id}
                className={
                  code.used ||
                  new Date(code.expires_at) < new Date()
                    ? 'opacity-60'
                    : ''
                }
              >
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">

                      {/* Code */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-lg text-blue-600">
                          {code.code}
                        </span>
                        <Badge className={`text-xs flex items-center gap-1 ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>

                      {/* School name */}
                      {code.school_name && (
                        <p className="text-sm text-gray-600 mt-1">
                          🏫 {code.school_name}
                        </p>
                      )}

                      {/* Notes */}
                      {code.notes && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          📝 {code.notes}
                        </p>
                      )}

                      {/* Used by */}
                      {code.used && code.used_by_phone && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          📱 Used by: {code.used_by_phone}
                        </p>
                      )}

                      {/* Times */}
                      <div className="flex gap-3 text-xs text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Created: {new Date(
                            code.created_at
                          ).toLocaleDateString('en-NG', {
                            day:    'numeric',
                            month:  'short',
                            hour:   '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {!code.used && (
                          <span>
                            Expires: {new Date(
                              code.expires_at
                            ).toLocaleDateString('en-NG', {
                              day:    'numeric',
                              month:  'short',
                              hour:   '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                    </div>

                    {/* Actions */}
                    {!code.used &&
                     new Date(code.expires_at) > new Date() && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyCode(code.code)}
                          className="text-xs"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy Code
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyWaMessage(code.code)
                          }
                          className="text-xs text-green-600 border-green-200"
                        >
                          📱 Copy WA Message
                        </Button>
                      </div>
                    )}

                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
