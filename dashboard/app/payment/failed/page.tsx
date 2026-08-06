// app/payment/failed/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PaymentFailedPage() {
  const params = useSearchParams();
  const reason = params.get('reason');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="flex justify-center mb-6">
          <XCircle className="h-20 w-20 text-red-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Failed
        </h1>

        <p className="text-gray-600 mb-6">
          Something went wrong with your payment.
          Please try again or contact support.
        </p>

        {reason && (
          <p className="text-sm text-gray-400 mb-6">
            Reason: {reason}
          </p>
        )}

        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={() => window.history.back()}
          >
            Try Again
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
