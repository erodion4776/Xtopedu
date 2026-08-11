export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">
        Privacy Policy
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Last updated: {new Date().toLocaleDateString(
          'en-NG', {
            day:   'numeric',
            month: 'long',
            year:  'numeric',
          }
        )}
      </p>

      <div className="prose prose-gray max-w-none space-y-6">

        <section>
          <h2 className="text-xl font-bold mb-3">
            1. Introduction
          </h2>
          <p className="text-gray-600">
            XtopEdu ("we", "our", "us") operates the
            SchoolBot platform, a WhatsApp-based school
            management system for Nigerian schools.
            This Privacy Policy explains how we collect,
            use and protect your information when you
            use our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            2. Information We Collect
          </h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2">
            <li>
              <strong>School Information:</strong> School
              name, address, contact details
            </li>
            <li>
              <strong>Student Information:</strong> Names,
              admission numbers, class information
            </li>
            <li>
              <strong>Parent Information:</strong> Names,
              WhatsApp numbers, email addresses
            </li>
            <li>
              <strong>Attendance Data:</strong> Daily
              attendance records for each student
            </li>
            <li>
              <strong>Payment Information:</strong> Fee
              payment records (processed by Paystack)
            </li>
            <li>
              <strong>WhatsApp Messages:</strong> Messages
              sent through our bot for service delivery
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            3. How We Use Your Information
          </h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2">
            <li>
              Send attendance notifications to parents
            </li>
            <li>
              Process fee payments and send receipts
            </li>
            <li>
              Generate school reports and analytics
            </li>
            <li>
              Manage student pickup notifications
            </li>
            <li>
              Provide customer support
            </li>
            <li>
              Improve our services
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            4. WhatsApp Data Usage
          </h2>
          <p className="text-gray-600">
            We use the WhatsApp Business API to send
            automated messages to parents and school
            staff. We collect and store WhatsApp phone
            numbers solely for the purpose of delivering
            school-related notifications. We do not sell
            or share WhatsApp data with third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            5. Data Storage & Security
          </h2>
          <p className="text-gray-600">
            All data is stored securely on Supabase
            (PostgreSQL) with encryption at rest and
            in transit. We implement industry-standard
            security measures to protect your data from
            unauthorized access, disclosure or destruction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            6. Payment Processing
          </h2>
          <p className="text-gray-600">
            All payments are processed by Paystack,
            a PCI-DSS compliant payment processor.
            We do not store credit card or bank account
            details on our servers. Please review
            Paystack's privacy policy for information
            on how they handle payment data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            7. Data Sharing
          </h2>
          <p className="text-gray-600">
            We do not sell, trade or rent your personal
            information to third parties. We may share
            data with:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mt-2">
            <li>
              <strong>Paystack:</strong> For payment
              processing
            </li>
            <li>
              <strong>Meta (WhatsApp):</strong> For
              message delivery
            </li>
            <li>
              <strong>Supabase:</strong> For data storage
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            8. Your Rights
          </h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2">
            <li>
              Request access to your personal data
            </li>
            <li>
              Request correction of inaccurate data
            </li>
            <li>
              Request deletion of your data
            </li>
            <li>
              Opt out of non-essential communications
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            9. Children's Privacy
          </h2>
          <p className="text-gray-600">
            Our service is designed for schools and
            parents. Student data is collected only
            with school authorization and is used
            solely for educational management purposes.
            We take special care to protect student
            data in compliance with applicable laws.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            10. Changes to This Policy
          </h2>
          <p className="text-gray-600">
            We may update this Privacy Policy from
            time to time. We will notify schools of
            any significant changes via WhatsApp or
            email. Continued use of our service after
            changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            11. Contact Us
          </h2>
          <p className="text-gray-600">
            If you have any questions about this
            Privacy Policy, please contact us:
          </p>
          <div className="mt-2 text-gray-600">
            <p>📱 WhatsApp: +2348184774884</p>
            <p>🌐 Website: XtopEdu</p>
            <p>📍 Nigeria</p>
          </div>
        </section>

      </div>
    </div>
  );
}
