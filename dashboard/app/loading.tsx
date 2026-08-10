export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-r-transparent mb-4" />
        <p className="text-gray-500 text-sm">
          Loading...
        </p>
      </div>
    </div>
  );
}
