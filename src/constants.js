'use strict';
/* src/constants.js — ثوابت: الصلاحيات وأنواع الطلبات والإعدادات الافتراضية */


/* ---------------- الصلاحيات ---------------- */
const PERMISSIONS = {
  'dashboard.view': 'عرض لوحة المعلومات',
  'employees.view': 'عرض الموظفين',
  'employees.manage': 'إضافة وتعديل الموظفين',
  'attendance.view_all': 'عرض حضور الجميع',
  'attendance.edit': 'تعديل سجلات الحضور',
  'requests.view_all': 'عرض طلبات الجميع',
  'requests.approve': 'قبول ورفض الطلبات',
  'payroll.view': 'عرض المرتبات',
  'payroll.manage': 'إدارة الخصومات والمكافآت',
  'reports.view': 'عرض التقارير',
  'settings.manage': 'تعديل إعدادات النظام',
};
const REQUEST_TYPES = {
  overtime: 'وقت إضافي',
  permission: 'إذن',
  annual_leave: 'إجازة سنوية',
  sick_leave: 'إجازة مرضية',
  emergency_leave: 'إجازة طارئة',
  work_mission: 'مهمة عمل',
  shift_change: 'تغيير وردية',
  attendance_edit: 'طلب تعديل حضور',
};
const LEAVE_TYPES = ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'];
// أنواع إضافية بيقدمها الموظف نفسه
Object.assign(REQUEST_TYPES, { expense: 'مطالبة نفقات', loan: 'قرض', shift_swap: 'تبادل ورديات', leave_swap: 'تبادل إجازات' });
// أنواع بيبدأها المدير/الموارد البشرية (محتاجة صلاحية requests.approve) وليها أثر لما تتقبل
const MGR_TYPES = { bonus_req: 'مكافأة', deduction_req: 'خصم', allowance_req: 'صرف بدل', join_req: 'انضمام', suspend_req: 'إيقاف', transfer_req: 'تحويل', schedule_req: 'جدول', bulk_req: 'طلب جماعي' };
const ALL_TYPES = { ...REQUEST_TYPES, ...MGR_TYPES };
const AMOUNT_TYPES = ['expense', 'loan', 'bonus_req', 'deduction_req', 'allowance_req'];
const ON_BEHALF = ['bonus_req', 'deduction_req', 'allowance_req', 'suspend_req', 'transfer_req', 'schedule_req'];

const DEFAULT_SETTINGS = {
  company_name: 'شركتي',
  timezone: 'Africa/Cairo',
  work_lat: '',
  work_lng: '',
  radius_m: '150',
  grace_minutes: '5',
  face_threshold: '0.5',
  weekend_days: '5,6', // الجمعة والسبت (0=الأحد)
  signup_enabled: '1', // السماح بإنشاء حساب جديد من صفحة الدخول (بيحتاج موافقة المدير)
  late_factor: '1',
  absence_factor: '1',
  overtime_factor: '1.5',
  overtime_minute_rate: '2', // قيمة الدقيقة الإضافية بالجنيه (لو مفيش سياسة إضافي مربوطة بالوردية). صفر = أجر الساعة × المعامل
  overtime_auto_approve: '1', // اعتماد الإضافي التلقائي لحظة تسجيل الانصراف
  country: 'Egypt',
  currency: 'EGP',
  language: 'arabic',
  month_start: '1',
  first_month: 'January',
  week_start: '6', // السبت (0=الأحد)
};

module.exports = { ALL_TYPES, AMOUNT_TYPES, DEFAULT_SETTINGS, LEAVE_TYPES, MGR_TYPES, ON_BEHALF, PERMISSIONS, REQUEST_TYPES };
