'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  LayoutDashboard,
  School,
  DollarSign,
  Users,
  FileText,
  Gift,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href:  '/dashboard',
    label: 'Dashboard',
    icon:  LayoutDashboard,
  },
  {
    href:  '/schools',
    label: 'Schools',
    icon:  School,
  },
  {
    href:  '/revenue',
    label: 'Revenue',
    icon:  DollarSign,
  },
  {
    href:  '/leads',
    label: 'Leads',
    icon:  Users,
  },
  {
    href:  '/trial-codes',
    label: 'Trial Codes',
    icon:  Gift,
  },
  {
    href:  '/logs',
    label: 'System Logs',
    icon:  FileText,
  },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName]     = useState('Admin');
  const [checking, setChecking]       = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { data: { session } } =
        await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      const { data: admin } = await supabase
        .from('platform_admins')
        .select('full_name, is_active')
        .eq('email', session.user.email ?? '')
        .single();

      if (!admin || !admin.is_active) {
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      setAdminName(
        admin.full_name?.split(' ')[0] ?? 'Admin'
      );
      setChecking(false);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent mb-4" />
          <p className="text-gray-500 text-sm">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg',
          'transform transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:inset-auto',
          sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h1 className="text-xl font-bold text-blue-600">
              XtopEdu
            </h1>
            <p className="text-xs text-gray-500">
              Super Admin
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg',
                  'text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.href === '/trial-codes' && (
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    NEW
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 text-sm font-medium">
                {adminName[0]}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium">
                {adminName}
              </p>
              <p className="text-xs text-gray-500">
                Super Admin
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500">
              Welcome, {adminName}!
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>

      </div>
    </div>
  );
}
