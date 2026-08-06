// app/onboarding/success/page.tsx

'use client';

import { CheckCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function OnboardingSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">
            XtopEdu
          </h1>
        </div>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>

            <h2 className="text-xl font-bold mb-2">
              Setup Fee Confirmed! 🎉
            </h2>

            <p className="text-gray-600 mb-6">
              Your SchoolBot account is now active.
              Check your WhatsApp for next steps.
            </p>

            <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-blue-800 mb-2">
                What happens next:
              </h3>
              <ol className="space-y-2 text-sm text-blue-700">
                <li>1️⃣ Our team contacts you within 2 hours</li>
                <li>2️⃣ Add your bank account</li>
                <li>3️⃣ Set up your classes</li>
                <li>4️⃣ Invite your teachers</li>
                <li>5️⃣ Go LIVE! 🚀</li>
              </ol>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <MessageSquare className="h-4 w-4" />
              <span>Continue setup via WhatsApp bot</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
