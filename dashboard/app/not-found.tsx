import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center px-4">
        <div className="text-6xl font-bold text-blue-600 mb-4">
          404
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-500 mb-8">
          The page you are looking for does not exist
          or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">
              🏠 Go to Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/login">
              🔐 Sign In
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
