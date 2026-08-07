// dashboard/lib/api.ts

// Use local API proxy instead of calling Supabase directly
// This keeps the token server-side and secure
const API_URL = '/api/admin';

async function apiCall(
  path: string,
  method = 'GET',
  body?: unknown
) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `[API] ${method} ${path} failed:`,
        res.status,
        errorText
      );
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[API] ${method} ${path} error:`, err);
    return null;
  }
}

export const superAdminApi = {
  getStats: () => apiCall('/stats'),

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
    const qs = query.toString();
    return apiCall(`/schools${qs ? `?${qs}` : ''}`);
  },

  getSchool: (id: string) => apiCall(`/schools/${id}`),

  updateSchool: (id: string, data: Record<string, unknown>) =>
    apiCall(`/schools/${id}`, 'PATCH', data),

  getRevenue: () => apiCall('/revenue'),

  getRevenueChart: (months = 12) =>
    apiCall(`/revenue/chart?months=${months}`),

  getPayments: (page = 1) =>
    apiCall(`/payments?page=${page}`),

  getLeads: (status?: string) =>
    apiCall(`/leads${status ? `?status=${status}` : ''}`),

  getLogs: (params?: {
    level?: string;
    schoolId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.level) query.set('level', params.level);
    if (params?.schoolId) query.set('school_id', params.schoolId);
    const qs = query.toString();
    return apiCall(`/logs${qs ? `?${qs}` : ''}`);
  },

  debugSchool: (id: string) => apiCall(`/debug/${id}`),

  getSessions: (schoolId?: string) =>
    apiCall(
      `/sessions${schoolId ? `?school_id=${schoolId}` : ''}`
    ),

  getPlans: () => apiCall('/plans'),
};

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
