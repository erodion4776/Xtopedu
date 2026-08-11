export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">
        Terms of Service
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
            1. Acceptance of Terms
          </h2>
          <p className="text-gray-600">
            By using XtopEdu SchoolBot ("Service"),
            you agree to be bound by these Terms of
            Service. If you do not agree to these
            terms, please do not use our Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            2. Description of Service
          </h2>
          <p className="text-gray-600">
            XtopEdu provides a WhatsApp-based school
            management platform that enables schools to:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mt-2">
            <li>Track and report student attendance</li>
            <li>Collect school fees online</li>
            <li>Send notifications to parents</li>
            <li>Manage student pickup security</li>
            <li>Generate academic reports</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            3. School Registration & Fees
          </h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2">
            <li>
              Schools pay a one-time setup fee based
              on student count (₦25,000 — ₦250,000)
            </li>
            <li>
              A 1.5% commission is added to parent
              fee payments — schools receive 100%
              of their stated fees
            </li>
            <li>
              Setup fees are non-refundable after
              7 days of activation
            </li>
            <li>
              Parents may subscribe to alert plans
              (₦200 — ₦600/month) for automatic
              notifications
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            4. WhatsApp Usage Policy
          </h2>
          <p className="text-gray-600">
            Schools using our service agree to:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mt-2">
            <li>
              Only send relevant school-related
              messages to parents
            </li>
            <li>
              Comply with WhatsApp Business Policy
            </li>
            <li>
              Not use the platform for spam or
              unsolicited marketing
            </li>
            <li>
              Obtain proper consent from parents
              before adding their numbers
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            5. Data Responsibility
          </h2>
          <p className="text-gray-600">
            Schools are responsible for:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mt-2">
            <li>
              Accuracy of student and parent data
              entered into the system
            </li>
            <li>
              Obtaining consent from parents to
              receive WhatsApp notifications
            </li>
            <li>
              Keeping their admin credentials secure
            </li>
            <li>
              Reporting any data breaches immediately
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            6. Service Availability
          </h2>
          <p className="text-gray-600">
            We strive to maintain 99% uptime but
            cannot guarantee uninterrupted service.
            We are not liable for any losses caused
            by service interruptions, WhatsApp API
            downtime or third-party service failures.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            7. Termination
          </h2>
          <p className="text-gray-600">
            We reserve the right to terminate or
            suspend service to any school that:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mt-2">
            <li>Violates these Terms of Service</li>
            <li>
              Uses the platform for illegal activities
            </li>
            <li>
              Fails to comply with WhatsApp policies
            </li>
            <li>
              Engages in fraud or misrepresentation
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            8. Limitation of Liability
          </h2>
          <p className="text-gray-600">
            XtopEdu shall not be liable for any
            indirect, incidental, special or
            consequential damages arising from use
            of our service. Our total liability
            shall not exceed the amount paid for
            the service in the preceding 12 months.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            9. Governing Law
          </h2>
          <p className="text-gray-600">
            These Terms are governed by the laws
            of the Federal Republic of Nigeria.
            Any disputes shall be resolved through
            arbitration in Nigeria.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">
            10. Contact Us
          </h2>
          <p className="text-gray-600">
            For questions about these Terms:
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
