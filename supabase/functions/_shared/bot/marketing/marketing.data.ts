// ============================================================
// SCHOOLBOT - MARKETING DEMO DATA
// supabase/functions/_shared/bot/marketing/marketing.data.ts
// ============================================================

export const DEMO_SCHOOL = {
  name:     'Greenfield Academy',
  location: 'Lagos, Nigeria',
  students: 347,
  staff:    28,
  parents:  412,
};

export const DEMO_ATTENDANCE = {
  today: {
    date: new Date().toLocaleDateString('en-NG', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      year:    'numeric',
    }),
    present: 312,
    absent:  23,
    late:    12,
    rate:    '90%',
  },
  student: {
    name:        'Chidi Okonkwo',
    class:       'JSS 3A',
    status:      'present',
    arrivalTime: '07:45 AM',
    termRate:    '94%',
    present:     47,
    absent:      2,
    late:        1,
    total:       50,
  },
  parentMessage:
    `✅ *Attendance Update*\n\n` +
    `👤 *Chidi Okonkwo* has been marked *Present* today.\n` +
    `🏫 Class: JSS 3A\n` +
    `⏰ Arrival: 07:45 AM\n\n` +
    `_This is an automated message from Greenfield Academy_`,
};

export const DEMO_FEES = {
  student: 'Chidi Okonkwo',
  class:   'JSS 3A',
  invoices: [
    {
      id:          'inv-001',
      title:       'First Term School Fees 2024/2025',
      amount:      150000,
      amountPaid:  75000,
      balance:     75000,
      status:      'Partial',
      dueDate:     '2024-12-31',
    },
    {
      id:          'inv-002',
      title:       'PTA Levy 2024/2025',
      amount:      15000,
      amountPaid:  0,
      balance:     15000,
      status:      'Pending',
      dueDate:     '2024-11-30',
    },
  ],
  totalOutstanding: 90000,
  lastPayment: {
    amount:    75000,
    date:      '15 Oct 2024',
    method:    'Bank Transfer',
    reference: 'SCH-A1B2C3-D4E5',
  },
};

export const DEMO_PICKUP = {
  student: 'Amara Adeleke',
  contacts: [
    {
      name:         'Mr. Bayo Adeleke',
      relationship: 'Father',
      phone:        '+234 802 345 6789',
    },
    {
      name:         'Mrs. Funmi Adeleke',
      relationship: 'Mother',
      phone:        '+234 807 654 3210',
    },
    {
      name:         'Uncle Seun Adeleke',
      relationship: 'Uncle',
      phone:        '+234 805 111 2222',
    },
  ],
  recentPickup: {
    pickedBy: 'Mrs. Funmi Adeleke',
    time:     '2:30 PM',
    date:     'Yesterday',
  },
};

export const DEMO_REPORTS = {
  feeCollection: {
    totalBilled:      52350000,
    totalCollected:   38640000,
    outstanding:      13710000,
    collectionRate:   '73.8%',
    paidStudents:     281,
    pendingStudents:  66,
  },
  attendance: {
    thisWeek:   '88%',
    thisMonth:  '91%',
    thisTerm:   '89%',
    bestClass:  'SS 2A (97%)',
    worstClass: 'JSS 1B (79%)',
  },
  whatsappStats: {
    messagesSent:    2847,
    delivered:       2801,
    read:            2654,
    deliveryRate:    '98.4%',
    parentsEngaged:  389,
  },
};

export const SETUP_FEE_TIERS = [
  {
    name:  'Micro',
    range: '1 — 100 students',
    fee:   '₦25,000',
  },
  {
    name:  'Small',
    range: '101 — 300 students',
    fee:   '₦50,000',
  },
  {
    name:  'Medium',
    range: '301 — 500 students',
    fee:   '₦80,000',
  },
  {
    name:  'Large',
    range: '501 — 1,000 students',
    fee:   '₦120,000',
  },
  {
    name:  'X-Large',
    range: '1,001 — 2,000 students',
    fee:   '₦180,000',
  },
  {
    name:  'Enterprise',
    range: '2,000+ students',
    fee:   '₦250,000',
  },
];
