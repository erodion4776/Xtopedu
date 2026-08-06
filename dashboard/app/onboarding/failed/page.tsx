import { XCircle } from 'lucide-react';

export default function OnboardingFailedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-4 text-center">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">
            Payment Failed
          </h2>
          <p className="text-gray-600 mb-6">
            Your setup fee payment was not completed.
            Please try again or contact support.
          </p>
          <a
            href="https://wa.me/your-number"
            className="inline-block px-4 py-2 bg-green-600 text-white rounded-md"
          >
            Contact Support on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
