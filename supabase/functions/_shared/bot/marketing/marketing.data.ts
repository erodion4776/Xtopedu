// ============================================================
// SCHOOLBOT - MARKETING SANDBOX DEMO DATA
// _shared/bot/marketing/marketing.data.ts
// ✅ Live sandbox data for prospective school owners
// ✅ Structured for PDF generation & live interaction
// ============================================================

export const DEMO_SCHOOL = {
  id:       'demo-greenfield-academy',
  name:     'Greenfield Academy',
  address:  '12, Greenfield Estate Way, Victoria Island, Lagos',
  phone:    '+234 802 345 6789',
  email:    'info@greenfieldacademy.ng',
  motto:    'Knowledge, Discipline & Excellence',
  principal: 'Dr. (Mrs.) Folashade Adeleke',
  students: 347,
  classes:  12,
  staff:    28,
  parents:  412,
};

export const DEMO_STUDENTS = [
  {
    id:        'demo-std-1',
    name:      'Chidi Okonkwo',
    admNo:     'GA/2024/001',
    class:     'JSS 3',
    arm:       'A',
    gender:    'Male',
    parent:    'Mr. & Mrs. Okonkwo',
    phone:     '+234 803 111 2233',
  },
  {
    id:        'demo-std-2',
    name:      'Amara Adeleke',
    admNo:     'GA/2024/002',
    class:     'JSS 3',
    arm:       'A',
    gender:    'Female',
    parent:    'Alhaji & Mrs. Adeleke',
    phone:     '+234 805 222 3344',
  },
  {
    id:        'demo-std-3',
    name:      'Tunde Bello',
    admNo:     'GA/2024/003',
    class:     'JSS 3',
    arm:       'A',
    gender:    'Male',
    parent:    'Chief & Mrs. Bello',
    phone:     '+234 807 333 4455',
  },
  {
    id:        'demo-std-4',
    name:      'Fatima Musa',
    admNo:     'GA/2024/004',
    class:     'JSS 3',
    arm:       'A',
    gender:    'Female',
    parent:    'Mallam & Mrs. Musa',
    phone:     '+234 809 444 5566',
  },
];

export const DEMO_RESULT_DATA = {
  school_id:   'demo-greenfield-academy',
  school_name: DEMO_SCHOOL.name,
  term:        'Second Term',
  academic_year: '2024/2025',
  average:     81.4,
  position:    '3rd out of 38 students',
  total_score: 814,
  class_count: 38,
  student: {
    full_name:        'Chidi Okonkwo (Demo Student)',
    admission_number: 'GA/2024/001',
    class_name:       'JSS 3A',
    gender:           'Male',
    school_id:        'demo-greenfield-academy',
    passport_url:     null,
  },
  subjects: [
    { name: 'Mathematics',           ca_score: 9, ca2_score: 18, exam_score: 58, total: 85, grade: 'A', remark: 'EXCELLENT' },
    { name: 'English Language',      ca_score: 8, ca2_score: 17, exam_score: 54, total: 79, grade: 'A', remark: 'EXCELLENT' },
    { name: 'Basic Science',         ca_score: 8, ca2_score: 16, exam_score: 50, total: 74, grade: 'B', remark: 'VERY GOOD' },
    { name: 'Social Studies',        ca_score: 7, ca2_score: 15, exam_score: 48, total: 70, grade: 'B', remark: 'VERY GOOD' },
    { name: 'Business Studies',      ca_score: 8, ca2_score: 17, exam_score: 56, total: 81, grade: 'A', remark: 'EXCELLENT' },
    { name: 'Computer Science',      ca_score: 10, ca2_score: 19, exam_score: 62, total: 91, grade: 'A', remark: 'EXCELLENT' },
    { name: 'Agricultural Science',  ca_score: 7, ca2_score: 14, exam_score: 44, total: 65, grade: 'B', remark: 'VERY GOOD' },
    { name: 'Civic Education',       ca_score: 8, ca2_score: 16, exam_score: 52, total: 76, grade: 'A', remark: 'EXCELLENT' },
    { name: 'Cultural & Creative Art',ca_score: 9, ca2_score: 17, exam_score: 53, total: 79, grade: 'A', remark: 'EXCELLENT' },
    { name: 'Literature in English', ca_score: 7, ca2_score: 15, exam_score: 47, total: 69, grade: 'B', remark: 'VERY GOOD' },
  ],
};

export const DEMO_FEES = {
  student: 'Chidi Okonkwo',
  class:   'JSS 3A',
  invoices: [
    {
      id:          'inv-001',
      title:       'Second Term Tuition 2024/2025',
      amount:      75000,
      amountPaid:  0,
      balance:     75000,
      status:      'Pending',
      dueDate:     '2025-04-15',
    },
    {
      id:          'inv-002',
      title:       'School Uniform & Sports Kit',
      amount:      18000,
      amountPaid:  0,
      balance:     18000,
      status:      'Pending',
      dueDate:     '2025-03-30',
    },
    {
      id:          'inv-003',
      title:       'PTA & Development Levy',
      amount:      7000,
      amountPaid:  7000,
      balance:     0,
      status:      'Paid',
      dueDate:     '2025-01-31',
    },
  ],
  totalOutstanding: 93000,
};

export const DEMO_PICKUP = {
  student: 'Chidi Okonkwo',
  class:   'JSS 3A',
  contacts: [
    {
      name:         'Mr. Emeka Okonkwo',
      relationship: 'Father',
      phone:        '+234 803 111 2233',
    },
    {
      name:         'Mrs. Ifeoma Okonkwo',
      relationship: 'Mother',
      phone:        '+234 807 444 5566',
    },
    {
      name:         'Uncle Somto Okonkwo',
      relationship: 'Uncle (Authorized Driver)',
      phone:        '+234 802 999 8877',
    },
  ],
  recentPickup: {
    pickedBy: 'Mrs. Ifeoma Okonkwo (Mother)',
    time:     '02:45 PM',
    date:     'Yesterday',
    loggedBy: 'Security Officer Musa',
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
