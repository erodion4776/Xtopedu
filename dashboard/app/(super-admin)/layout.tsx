// app/(super-admin)/layout.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  LayoutDashboard,
  School,
  DollarSign,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/schools',
    label: 'Schools',
    icon: School,
  },
  {
    href: '/revenue',
    label: 'Revenue',
    icon: DollarSign,
  },
  {
    href: '/leads',
    label: 'Leads',
    icon: Users,
  },
  {
    href: '/sessions',
    label: 'Active Sessions',
    icon: MessageSquare,
  },
  {
    href: '/logs',
    label: 'System Logs',
    icon: BarChart3,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState('Admin');

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: admin } = await supabase
      .from('platform_admins')
      .select('full_name')
      .eq('email', user.email)
      .single();

    if (!admin) {
      router.push('/login');
      return;
    }

    setAdminName(admin.full_name.split(' ')[0]);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg',
          'transform transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:inset-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h1 className="text-xl font-bold text-blue-600">
              XtopEdu
            </h1>
            <p className="text-xs text-gray-500">Super Admin</p>
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

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
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
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                {adminName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{adminName}</p>
              <p className="text-xs text-gray-500">Super Admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-red-500"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
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
