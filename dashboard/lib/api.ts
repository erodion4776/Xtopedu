// lib/api.ts
// Calls your super-admin-api edge function

const API_URL = process.env.NEXT_PUBLIC_SUPER_ADMIN_API_URL!;
const API_TOKEN = process.env.SUPER_ADMIN_API_TOKEN!;

async function apiCall(
  path: string,
  method = 'GET',
  body?: unknown
) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'x-admin-token': API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

// ─── Super Admin APIs ──────────────────────────────────────────
export const superAdminApi = {

  // Dashboard stats
  getStats: () => apiCall('/stats'),

  // Schools
  getSchools: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    return apiCall(`/schools?${query}`);
  },

  getSchool: (id: string) => apiCall(`/schools/${id}`),

  updateSchool: (id: string, data: Record<string, unknown>) =>
    apiCall(`/schools/${id}`, 'PATCH', data),

  // Revenue
  getRevenue: () => apiCall('/revenue'),
  getRevenueChart: (months = 12) =>
    apiCall(`/revenue/chart?months=${months}`),

  // Payments
  getPayments: (page = 1) =>
    apiCall(`/payments?page=${page}`),

  // Commissions
  getCommissions: (page = 1) =>
    apiCall(`/commissions?page=${page}`),

  // Leads
  getLeads: (status?: string) =>
    apiCall(`/leads${status ? `?status=${status}` : ''}`),

  // Logs
  getLogs: (params?: {
    level?: string;
    schoolId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.level) query.set('level', params.level);
    if (params?.schoolId) query.set('school_id', params.schoolId);
    return apiCall(`/logs?${query}`);
  },

  // Debug
  debugSchool: (id: string) => apiCall(`/debug/${id}`),

  // Sessions
  getSessions: (schoolId?: string) =>
    apiCall(`/sessions${schoolId ? `?school_id=${schoolId}` : ''}`),

  // Plans
  getPlans: () => apiCall('/plans'),
};

// ─── Format helpers ────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
