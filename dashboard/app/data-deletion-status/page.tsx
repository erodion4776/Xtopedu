// Page users see after requesting data deletion

export default function DataDeletionStatusPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-4 text-center">
        <div className="bg-white rounded-2xl shadow p-8">

          <div className="text-4xl mb-4">🗑️</div>

          <h1 className="text-xl font-bold mb-2">
            Data Deletion Request Received
          </h1>

          <p className="text-gray-600 mb-6">
            We have received your request to delete
            your data from Space (XtopEdu).
          </p>

          <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2">
            <p className="font-semibold text-gray-700">
              What happens next:
            </p>
            <p className="text-gray-600">
              ✅ Your request has been logged
            </p>
            <p className="text-gray-600">
              ✅ We will delete your data within
              30 days
            </p>
            <p className="text-gray-600">
              ✅ You will not receive any more
              messages from us
            </p>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            Questions? Contact us on WhatsApp:
            +2348184774884
          </p>

        </div>
      </div>
    </div>
  );
}
