// بيانات تجريبية فقط (أسماء وهمية). شغّليه محلياً للتجربة: npm run seed
// لازم DATABASE_URL يكون متحدد (قاعدة تجريبية، مش قاعدة الإنتاج!)
// حماية: السكريبت ده بيضيف حسابات كلمة مرورها 123456، فمايشتغلش إلا لو أنتِ صرّحتي بكده صراحةً
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SEED !== '1') {
  console.error('رفض التشغيل: ده سكريبت تجريبي. على قاعدة تجريبية فقط شغّليه هكذا: ALLOW_SEED=1 npm run seed');
  process.exit(1);
}
const bcrypt = require('bcryptjs');
const { db, pool, ready } = require('./server');

const people = [
  ['سارة أحمد', 'sara', 'مدير التشغيل', 'الإدارة', 9000, ['dashboard.view', 'employees.view', 'employees.manage', 'attendance.view_all', 'attendance.edit', 'requests.view_all', 'requests.approve', 'payroll.view', 'payroll.manage', 'reports.view']],
  ['محمد علي', 'mohamed', 'فني إنتاج', 'الإنتاج', 5400, []],
  ['منى حسن', 'mona', 'موظفة استقبال', 'المكتب', 3500, []],
  ['كريم سعيد', 'karim', 'محاسب', 'المالية', 6000, []],
  ['هبة عادل', 'heba', 'مصممة', 'التسويق', 5000, []],
];

(async () => {
  await ready;
  for (const [name, username, job, dept, salary, perms] of people) {
    if (await db.get('SELECT 1 FROM users WHERE username=?', username)) continue;
    await db.run('INSERT INTO users(name,username,password_hash,must_change,job_title,department,base_salary,allowances,permissions,hire_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
      name, username, bcrypt.hashSync('123456', 10), 0, job, dept, salary, Math.round(salary * 0.1), JSON.stringify(perms), '2026-01-01');
  }
  console.log('تمت إضافة موظفين تجريبيين، كلمة المرور 123456');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
