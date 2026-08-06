// app/payment/success/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const ref = params.get('ref');
  const amount = params.get('amount');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="flex justify-center mb-6">
          <CheckCircle className="h-20 w-20 text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Successful!
        </h1>

        <p className="text-gray-600 mb-6">
          Your payment has been confirmed.
          Check your WhatsApp for a confirmation message
          and receipt.
        </p>

        {ref && (
          <p className="text-sm text-gray-400 mb-6">
            Reference: {ref}
          </p>
        )}

        <div className="space-y-3">
          <Button className="w-full" asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
