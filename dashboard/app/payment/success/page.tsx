import { Suspense } from 'react';
import { CheckCircle } from 'lucide-react';

function SuccessContent() {
  const { useSearchParams } = require('next/navigation');
  const params = useSearchParams();
  const ref = params.get('ref');

  return (
    <div className="text-center max-w-md px-4">
      <div className="flex justify-center mb-6">
        <CheckCircle className="h-20 w-20 text-green-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Payment Successful!
      </h1>
      <p className="text-gray-600 mb-4">
        Your payment has been confirmed. Check your
        WhatsApp for a confirmation message and receipt.
      </p>
      {ref && (
        <p className="text-sm text-gray-400">
          Reference: {ref}
        </p>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense
        fallback={
          <div className="text-center">
            <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
            <p>Payment Successful!</p>
          </div>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
