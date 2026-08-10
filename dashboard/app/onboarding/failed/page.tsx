import { XCircle } from 'lucide-react';

export default function OnboardingFailedPage() {
  // ✅ Fixed: use env variable instead of hardcoded number
  const waNumber =
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ??
    '2348073128887';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-4 text-center">
        <div className="bg-white rounded-2xl shadow-lg p-8">

          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle className="h-12 w-12 text-red-500" />
            </div>
          </div>

          <h2 className="text-xl font-bold mb-2">
            Payment Failed
          </h2>

          <p className="text-gray-600 mb-6">
            Your setup fee payment was not completed.
            Please try again or contact our support team.
          </p>

          <div className="space-y-3">
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              💬 Contact Support on WhatsApp
            </a>

            <a
              href="/"
              className="block w-full px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              ↩️ Try Again
            </a>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            © {new Date().getFullYear()} XtopEdu
          </p>
        </div>
      </div>
    </div>
  );
}
