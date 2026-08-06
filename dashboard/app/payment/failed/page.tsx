import { Suspense } from 'react';
import { XCircle } from 'lucide-react';

function FailedContent() {
  const { useSearchParams } = require('next/navigation');
  const params = useSearchParams();
  const reason = params.get('reason');

  return (
    <div className="text-center max-w-md px-4">
      <div className="flex justify-center mb-6">
        <XCircle className="h-20 w-20 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Payment Failed
      </h1>
      <p className="text-gray-600 mb-4">
        Something went wrong with your payment.
        Please try again or contact support.
      </p>
      {reason && (
        <p className="text-sm text-gray-400 mb-4">
          Reason: {reason}
        </p>
      )}
      <button
        onClick={() => window.history.back()}
        className="px-4 py-2 bg-blue-600 text-white rounded-md"
      >
        Try Again
      </button>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Suspense
        fallback={
          <div className="text-center">
            <XCircle className="h-20 w-20 text-red-500 mx-auto mb-4" />
            <p>Payment Failed</p>
          </div>
        }
      >
        <FailedContent />
      </Suspense>
    </div>
  );
}
