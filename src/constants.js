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
  country: 'Egypt',
  currency: 'EGP',
  language: 'arabic',
  month_start: '1',
  first_month: 'January',
  week_start: '6', // السبت (0=الأحد)
};

module.exports = { DEFAULT_SETTINGS, LEAVE_TYPES, PERMISSIONS, REQUEST_TYPES };
