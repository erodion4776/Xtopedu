'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  ToggleLeft,
  ToggleRight,
  Eye,
  Download,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────

interface FormField {
  id?:         string;
  field_key:   string;
  field_label: string;
  field_type:  string;
  required:    boolean;
  order_index: number;
}

interface PaymentForm {
  id:                 string;
  command:            string;
  title:              string;
  description:        string | null;
  amount:             number;
  is_active:          boolean;
  bank_name:          string | null;
  bank_code:          string | null;
  account_number:     string | null;
  account_name:       string | null;
  completion_message: string | null;
  receipt_title:      string | null;
  created_at:         string;
  payment_form_fields: FormField[];
}

interface Payment {
  id:            string;
  serial_number: number;
  phone:         string;
  data:          Record<string, string>;
  amount:        number;
  status:        string;
  gateway_ref:   string;
  paid_at:       string | null;
  created_at:    string;
}

// ── Nigerian banks list — fallback while the real list loads ──
const FALLBACK_BANKS = [
  { name: 'Access Bank',            code: '044' },
  { name: 'Citibank Nigeria',       code: '023' },
  { name: 'Ecobank Nigeria',        code: '050' },
  { name: 'Fidelity Bank',          code: '070' },
  { name: 'First Bank of Nigeria',  code: '011' },
  { name: 'First City Monument Bank (FCMB)', code: '214' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
  { name: 'Heritage Bank',          code: '030' },
  { name: 'Keystone Bank',          code: '082' },
  { name: 'Kuda Bank',              code: '090267' },
  { name: 'Opay',                   code: '100004' },
  { name: 'Palmpay',                code: '100033' },
  { name: 'Polaris Bank',           code: '076' },
  { name: 'Providus Bank',          code: '101' },
  { name: 'Stanbic IBTC Bank',      code: '221' },
  { name: 'Standard Chartered',     code: '068' },
  { name: 'Sterling Bank',          code: '232' },
  { name: 'Union Bank',             code: '032' },
  { name: 'United Bank for Africa (UBA)', code: '033' },
  { name: 'Unity Bank',             code: '215' },
  { name: 'Wema Bank',              code: '035' },
  { name: 'Zenith Bank',            code: '057' },
  { name: 'Moniepoint MFB',         code: '50515' },
  { name: 'VFD Microfinance Bank',  code: '566' },
];

// ── Helpers ────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

const DEFAULT_FIELDS: FormField[] = [
  {
    field_key:   'full_name',
    field_label: 'Full Name',
    field_type:  'text',
    required:    true,
    order_index: 0,
  },
  {
    field_key:   'phone',
    field_label: 'Phone Number',
    field_type:  'phone',
    required:    true,
    order_index: 1,
  },
];

// ── Component ──────────────────────────────────────────────

export default function PaymentFormsPage() {
  const [forms, setForms]       = useState<PaymentForm[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [viewingPayments, setViewingPayments] =
    useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] =
    useState(false);

  const [banks, setBanks] = useState(FALLBACK_BANKS);

  useEffect(() => {
    fetch('/api/admin/banks')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setBanks(data);
        }
      })
      .catch(() => {
        // Keep the fallback list if this fails — better than an empty dropdown
      });
  }, []);

  // ── Form state ───────────────────────────────────────────
  const [command,           setCommand]           = useState('');
  const [title,             setTitle]             = useState('');
  const [description,       setDescription]       = useState('');
  const [amount,            setAmount]            = useState('');
  const [selectedBank,      setSelectedBank]      = useState('');
  const [accountNumber,     setAccountNumber]     = useState('');
  const [accountName,       setAccountName]       = useState('');
  const [verifying,         setVerifying]         = useState(false);
  const [completionMessage, setCompletionMessage] = useState('');
  const [receiptTitle,      setReceiptTitle]      = useState('');
  const [fields,            setFields]            =
    useState<FormField[]>(DEFAULT_FIELDS);

  useEffect(() => { loadForms(); }, []);

  // ── Data loading ─────────────────────────────────────────

  async function loadForms() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_forms')
        .select('*, payment_form_fields(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForms((data as PaymentForm[]) ?? []);
    } catch (err) {
      toast.error('Failed to load forms');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPayments(formId: string) {
    setLoadingPayments(true);
    setViewingPayments(formId);
    try {
      const { data, error } = await supabase
        .from('payment_form_payments')
        .select('*')
        .eq('form_id', formId)
        .order('serial_number', { ascending: true });

      if (error) throw error;
      setPayments((data as Payment[]) ?? []);
    } catch (err) {
      toast.error('Failed to load payments');
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  }

  // ── Account verification ─────────────────────────────────
  // ✅ Uses bank dropdown — no manual code entry

  async function verifyAccount() {
    if (!accountNumber || accountNumber.length < 10) {
      toast.error('Enter a valid 10-digit account number');
      return;
    }
    if (!selectedBank) {
      toast.error('Please select your bank first');
      return;
    }

    const bank = banks.find(
      (b) => b.name === selectedBank
    );
    if (!bank) {
      toast.error('Bank not found');
      return;
    }

    setVerifying(true);
    setAccountName('');

    try {
      const res = await fetch(
        `/api/admin/verify-account?` +
        `account=${accountNumber}&bank=${bank.code}`
      );
      const data = await res.json();

      if (data.account_name) {
        setAccountName(data.account_name);
        toast.success(`✅ ${data.account_name}`);
      } else {
        toast.error(
          data.message ?? 'Could not verify account'
        );
      }
    } catch {
      toast.error('Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  // ── Field management ─────────────────────────────────────

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        field_key:   `field_${prev.length}`,
        field_label: '',
        field_type:  'text',
        required:    true,
        order_index: prev.length,
      },
    ]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(
    index: number,
    key:   keyof FormField,
    value: string | boolean | number
  ) {
    setFields((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  }

  // ── Save form ────────────────────────────────────────────

  async function handleSave() {
    if (!command.trim()) {
      toast.error('Bot command is required');
      return;
    }
    if (!title.trim()) {
      toast.error('Form title is required');
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Valid amount is required');
      return;
    }
    if (fields.some((f) => !f.field_label.trim())) {
      toast.error('All field labels are required');
      return;
    }

    const bank = banks.find(
      (b) => b.name === selectedBank
    );

    setSaving(true);
    try {
      const { data: form, error: formError } =
        await supabase
          .from('payment_forms')
          .insert({
            command:            command.trim().toLowerCase(),
            title:              title.trim(),
            description:        description.trim() || null,
            amount:             Number(amount),
            bank_name:          bank?.name         || null,
            bank_code:          bank?.code         || null, // ✅ set from dropdown
            account_number:     accountNumber.trim() || null,
            account_name:       accountName.trim() || null,
            completion_message: completionMessage.trim() || null,
            receipt_title:      receiptTitle.trim() || null,
            is_active:          true,
            created_at:         new Date().toISOString(),
            updated_at:         new Date().toISOString(),
          })
          .select()
          .single();

      if (formError) throw formError;

      if (fields.length > 0) {
        const { error: fieldsError } = await supabase
          .from('payment_form_fields')
          .insert(
            fields.map((f, i) => ({
              form_id:     form.id,
              field_key:   f.field_key ||
                           f.field_label
                             .toLowerCase()
                             .replace(/\s+/g, '_'),
              field_label: f.field_label,
              field_type:  f.field_type,
              required:    f.required,
              order_index: i,
              created_at:  new Date().toISOString(),
            }))
          );

        if (fieldsError) throw fieldsError;
      }

      toast.success(`✅ Form "${command}" created!`);
      setShowCreate(false);
      resetForm();
      await loadForms();
    } catch (err: unknown) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to create form'
      );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCommand('');
    setTitle('');
    setDescription('');
    setAmount('');
    setSelectedBank('');
    setAccountNumber('');
    setAccountName('');
    setCompletionMessage('');
    setReceiptTitle('');
    setFields(DEFAULT_FIELDS);
  }

  // ── Toggle / Delete ──────────────────────────────────────

  async function toggleForm(formId: string, isActive: boolean) {
    const { error } = await supabase
      .from('payment_forms')
      .update({
        is_active:  !isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to update form');
    } else {
      toast.success(
        isActive ? 'Form deactivated' : 'Form activated'
      );
      setForms((prev) =>
        prev.map((f) =>
          f.id === formId
            ? { ...f, is_active: !isActive }
            : f
        )
      );
    }
  }

  async function deleteForm(formId: string) {
    if (!confirm('Delete this form and all its payments?')) return;

    const { error } = await supabase
      .from('payment_forms')
      .delete()
      .eq('id', formId);

    if (error) {
      toast.error('Failed to delete form');
    } else {
      toast.success('Form deleted');
      setForms((prev) => prev.filter((f) => f.id !== formId));
      if (viewingPayments === formId) {
        setViewingPayments(null);
        setPayments([]);
      }
    }
  }

  async function copyCommand(cmd: string) {
    await navigator.clipboard.writeText(cmd);
    toast.success(`Copied: "${cmd}"`);
  }

  // ── CSV export ───────────────────────────────────────────

  function exportCSV(form: PaymentForm, pmts: Payment[]) {
    if (!pmts.length) {
      toast.error('No payments to export');
      return;
    }

    const sortedFields = [...form.payment_form_fields].sort(
      (a, b) => a.order_index - b.order_index
    );

    const headers = [
      'Serial No',
      'Phone',
      ...sortedFields.map((f) => f.field_label),
      'Amount',
      'Status',
      'Paid At',
      'Reference',
    ];

    const rows = pmts.map((p) => [
      p.serial_number ?? '',
      p.phone,
      ...sortedFields.map(
        (f) => (p.data as Record<string, string>)[f.field_key] ?? ''
      ),
      fmt(p.amount),
      p.status,
      p.paid_at
        ? new Date(p.paid_at).toLocaleDateString('en-NG')
        : 'Not paid',
      p.gateway_ref,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        r
          .map((v) =>
            `"${String(v).replace(/"/g, '""')}"`
          )
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download =
      `${form.command}-payments-` +
      `${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('✅ CSV downloaded!');
  }

  // ── Derived ──────────────────────────────────────────────

  const viewingForm = forms.find(
    (f) => f.id === viewingPayments
  );

  const totalCollected = payments
    .filter((p) => p.status === 'Success')
    .reduce((s, p) => s + p.amount, 0);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Payment Forms
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Create custom payment commands for your bot
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadForms}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? 'animate-spin' : ''
              }`}
            />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(!showCreate);
              setViewingPayments(null);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Form
          </Button>
        </div>
      </div>

      {/* How it works */}
      {!showCreate && !viewingPayments && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <p className="font-semibold text-blue-800 mb-2">
              💡 How it works:
            </p>
            <div className="text-sm text-blue-700 space-y-1">
              <p>1. Create a form with a bot command</p>
              <p>2. Someone types the command on WhatsApp</p>
              <p>3. Bot collects their details step-by-step</p>
              <p>4. They pay securely via Paystack</p>
              <p>5. They receive your custom receipt message</p>
              <p>6. View & export all payments here</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Create Form ─────────────────────────────────── */}
      {showCreate && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-base">
              ➕ Create New Payment Form
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">

            {/* Basic Info */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-gray-700 border-b pb-1">
                Basic Information
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="command">
                    Bot Command *
                  </Label>
                  <Input
                    id="command"
                    placeholder="e.g. engr reg"
                    value={command}
                    onChange={(e) =>
                      setCommand(
                        e.target.value.toLowerCase()
                      )
                    }
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    User types this to start the form
                  </p>
                </div>

                <div>
                  <Label htmlFor="amount">
                    Amount (₦) *
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="e.g. 5000"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value)
                    }
                  />
                  {amount && !isNaN(Number(amount)) && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      {fmt(Number(amount))}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="title">
                  Form Title *
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Engineering Registration Fee"
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="description">
                  Description
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    (shown at start of form)
                  </span>
                </Label>
                <Input
                  id="description"
                  placeholder="e.g. Registration for 2024/2025 academic year"
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                />
              </div>
            </section>

            {/* Bank Account — Dropdown, no manual code */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-gray-700 border-b pb-1">
                🏦 Payment Account
                <span className="text-gray-400 font-normal ml-1 text-xs">
                  (optional — for display only)
                </span>
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* ✅ Bank selector — no code needed */}
                <div>
                  <Label>Select Bank</Label>
                  <select
                    value={selectedBank}
                    onChange={(e) => {
                      setSelectedBank(e.target.value);
                      setAccountName(''); // reset on bank change
                    }}
                    className="w-full h-10 text-sm border rounded-md px-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select bank —</option>
                    {banks.map((b) => (
                      <option key={b.code} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account number + verify */}
                <div>
                  <Label>Account Number</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="10 digits"
                      value={accountNumber}
                      onChange={(e) => {
                        setAccountNumber(e.target.value);
                        setAccountName('');
                      }}
                      maxLength={10}
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={verifyAccount}
                      disabled={
                        verifying ||
                        !selectedBank ||
                        accountNumber.length < 10
                      }
                      type="button"
                      className="shrink-0"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Verify'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Verified account name */}
              {accountName && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-green-700 text-sm font-semibold">
                      {accountName}
                    </p>
                    <p className="text-green-600 text-xs">
                      {selectedBank}
                    </p>
                  </div>
                </div>
              )}

              {/* Helper tip */}
              {!accountName && selectedBank && (
                <p className="text-xs text-gray-400">
                  Enter account number then tap{' '}
                  <strong>Verify</strong> to confirm
                </p>
              )}
            </section>

            {/* Completion Message */}
            <section className="space-y-4">
              <h3 className="font-semibold text-sm text-gray-700 border-b pb-1">
                ✅ After Payment Message
              </h3>

              <div>
                <Label htmlFor="receiptTitle">
                  Receipt Title
                </Label>
                <Input
                  id="receiptTitle"
                  placeholder="e.g. Engineering Registration Receipt"
                  value={receiptTitle}
                  onChange={(e) =>
                    setReceiptTitle(e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="completionMessage">
                  Completion Message
                </Label>
                <textarea
                  id="completionMessage"
                  placeholder={
                    `e.g. Your registration is complete!\n\n` +
                    `Show this receipt at the gate.\n\n` +
                    `Venue: Engineering Complex, Block A\n` +
                    `Time: 8AM - 4PM weekdays`
                  }
                  value={completionMessage}
                  onChange={(e) =>
                    setCompletionMessage(e.target.value)
                  }
                  rows={5}
                  className={
                    'w-full border rounded-lg p-3 text-sm ' +
                    'resize-none focus:outline-none ' +
                    'focus:ring-2 focus:ring-blue-500'
                  }
                />
                <p className="text-xs text-gray-400 mt-1">
                  Sent to the user after successful payment.
                  Include instructions, venue, time, etc.
                </p>
              </div>
            </section>

            {/* Form Fields */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="font-semibold text-sm text-gray-700">
                  📋 Form Fields
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  type="button"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className={
                      'flex gap-2 items-end ' +
                      'bg-gray-50 p-3 rounded-lg'
                    }
                  >
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">
                          Label *
                        </Label>
                        <Input
                          placeholder="e.g. Full Name"
                          value={field.field_label}
                          onChange={(e) =>
                            updateField(
                              index,
                              'field_label',
                              e.target.value
                            )
                          }
                          className="text-sm h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          Key
                          <span className="text-gray-400 ml-1">
                            (auto)
                          </span>
                        </Label>
                        <Input
                          placeholder="auto"
                          value={field.field_key}
                          onChange={(e) =>
                            updateField(
                              index,
                              'field_key',
                              e.target.value
                                .toLowerCase()
                                .replace(/\s+/g, '_')
                            )
                          }
                          className="text-sm h-8 font-mono text-gray-500"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          Type
                        </Label>
                        <select
                          value={field.field_type}
                          onChange={(e) =>
                            updateField(
                              index,
                              'field_type',
                              e.target.value
                            )
                          }
                          className="w-full h-8 text-sm border rounded px-2 bg-white"
                        >
                          <option value="text">
                            Text
                          </option>
                          <option value="email">
                            Email
                          </option>
                          <option value="phone">
                            Phone
                          </option>
                          <option value="number">
                            Number
                          </option>
                          <option value="date">
                            Date
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pb-0.5">
                      <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            updateField(
                              index,
                              'required',
                              e.target.checked
                            )
                          }
                        />
                        Req
                      </label>
                      {fields.length > 1 && (
                        <button
                          onClick={() =>
                            removeField(index)
                          }
                          className="text-red-400 hover:text-red-600"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Bot Preview */}
            <section className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-sm mb-2">
                📱 Bot Preview:
              </p>
              <div className="text-xs text-gray-600 font-mono bg-white rounded p-3 border space-y-1">
                <p className="text-blue-600">
                  User: {command || 'your-command'}
                </p>
                <p>
                  Bot: 🎯 *{title || 'Payment Form'}*
                </p>
                {description && (
                  <p className="text-gray-500">
                    Bot: {description}
                  </p>
                )}
                <p>
                  Bot: 💵 Amount:{' '}
                  <strong>
                    {amount
                      ? fmt(Number(amount))
                      : '₦5,000'}
                  </strong>
                </p>
                {fields.map((f) => (
                  <p key={f.field_key}>
                    Bot: Please enter your{' '}
                    <strong>
                      {f.field_label || 'Field'}
                    </strong>
                    {f.required ? ' *' : ''}:
                  </p>
                ))}
                <p className="text-gray-400">
                  ... (confirmation + payment link)
                </p>
                <p className="text-green-600">
                  Bot: 🎉 *
                  {receiptTitle || 'Payment Receipt'}*
                </p>
                {completionMessage && (
                  <p className="text-green-600">
                    Bot:{' '}
                    {completionMessage.split('\n')[0]}
                    ...
                  </p>
                )}
              </div>
            </section>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving
                  ? '⏳ Saving...'
                  : '✅ Create Form'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Payments View ────────────────────────────────── */}
      {viewingPayments && viewingForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  📋 Payments — {viewingForm.title}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Command:{' '}
                  <code className="font-mono bg-gray-100 px-1 rounded">
                    {viewingForm.command}
                  </code>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportCSV(viewingForm, payments)
                  }
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewingPayments(null);
                    setPayments([]);
                  }}
                >
                  ✕ Close
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {payments.length}
                </p>
                <p className="text-xs text-gray-500">
                  Total Entries
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {
                    payments.filter(
                      (p) => p.status === 'Success'
                    ).length
                  }
                </p>
                <p className="text-xs text-gray-500">
                  Paid
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-purple-600">
                  {fmt(totalCollected)}
                </p>
                <p className="text-xs text-gray-500">
                  Total Collected
                </p>
              </div>
            </div>

            {loadingPayments ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-16 rounded-lg"
                  />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-3xl mb-2">📭</p>
                <p>No payments yet</p>
                <p className="text-sm mt-1">
                  Share the command{' '}
                  <code className="font-mono bg-gray-100 px-1 rounded">
                    {viewingForm.command}
                  </code>{' '}
                  to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600">
                        S/N
                      </th>
                      {[...viewingForm.payment_form_fields]
                        .sort(
                          (a, b) =>
                            a.order_index - b.order_index
                        )
                        .map((f) => (
                          <th
                            key={f.field_key}
                            className="text-left p-2 font-medium text-gray-600 whitespace-nowrap"
                          >
                            {f.field_label}
                          </th>
                        ))}
                      <th className="text-left p-2 font-medium text-gray-600">
                        Phone
                      </th>
                      <th className="text-left p-2 font-medium text-gray-600">
                        Amount
                      </th>
                      <th className="text-left p-2 font-medium text-gray-600">
                        Status
                      </th>
                      <th className="text-left p-2 font-medium text-gray-600">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const pData =
                        payment.data as Record<
                          string,
                          string
                        >;
                      return (
                        <tr
                          key={payment.id}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="p-2 font-mono font-bold text-blue-600">
                            {payment.serial_number
                              ? `#${String(
                                  payment.serial_number
                                ).padStart(3, '0')}`
                              : '-'}
                          </td>
                          {[
                            ...viewingForm.payment_form_fields,
                          ]
                            .sort(
                              (a, b) =>
                                a.order_index -
                                b.order_index
                            )
                            .map((f) => (
                              <td
                                key={f.field_key}
                                className="p-2"
                              >
                                {pData[f.field_key] ??
                                  '-'}
                              </td>
                            ))}
                          <td className="p-2 font-mono text-xs">
                            {payment.phone}
                          </td>
                          <td className="p-2 text-green-600 font-medium">
                            {fmt(payment.amount)}
                          </td>
                          <td className="p-2">
                            <Badge
                              className={
                                payment.status ===
                                'Success'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }
                            >
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="p-2 text-xs text-gray-500">
                            {payment.paid_at
                              ? new Date(
                                  payment.paid_at
                                ).toLocaleDateString(
                                  'en-NG',
                                  {
                                    day:   'numeric',
                                    month: 'short',
                                    year:  'numeric',
                                  }
                                )
                              : 'Pending'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Forms List ───────────────────────────────────── */}
      {!showCreate && !viewingPayments && (
        loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-32 rounded-xl"
              />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-gray-500 font-medium">
                No payment forms yet
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Click "New Form" to create your first
                payment command
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => (
              <Card
                key={form.id}
                className={`hover:shadow-md transition-shadow ${
                  !form.is_active ? 'opacity-60' : ''
                }`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">

                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-sm">
                          {form.command}
                        </code>
                        <Badge
                          className={
                            form.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {form.is_active
                            ? 'Active'
                            : 'Inactive'}
                        </Badge>
                      </div>

                      <p className="font-semibold mt-1">
                        {form.title}
                      </p>
                      <p className="text-green-600 font-medium text-sm">
                        {fmt(form.amount)}
                      </p>

                      {form.description && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          {form.description}
                        </p>
                      )}

                      <div className="flex gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                        <span>
                          📋{' '}
                          {form.payment_form_fields
                            ?.length ?? 0}{' '}
                          fields
                        </span>
                        {form.account_name && (
                          <span>
                            🏦 {form.account_name}
                            {form.bank_name && (
                              <span className="text-gray-300 ml-1">
                                ({form.bank_name})
                              </span>
                            )}
                          </span>
                        )}
                        {form.completion_message && (
                          <span>
                            ✅ Has receipt message
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          loadPayments(form.id)
                        }
                        className="text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Payments
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyCommand(form.command)
                        }
                        className="text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleForm(
                            form.id,
                            form.is_active
                          )
                        }
                        className={`text-xs ${
                          form.is_active
                            ? 'text-red-500'
                            : 'text-green-500'
                        }`}
                      >
                        {form.is_active ? (
                          <>
                            <ToggleRight className="h-3 w-3 mr-1" />
                            Disable
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-3 w-3 mr-1" />
                            Enable
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          deleteForm(form.id)
                        }
                        className="text-xs text-red-500"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

    </div>
  );
}
