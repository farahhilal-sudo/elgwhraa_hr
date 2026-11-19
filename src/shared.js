'use strict';
/* src/shared.js — دوال مشتركة بين أكتر من مجموعة API */


/* ----- لوحة المعلومات ----- */
/* ----- لوحة المعلومات: تجميعات بنفس معادلات كشف المرتب (بما فيها سياسات الجزاءات والإضافي والعطلات) ----- */
const locIds = (u) => { try { return JSON.parse(u.location_ids || '[]'); } catch { return []; } };
const parseCfg = (r) => { let d = {}; try { d = JSON.parse(r.data || '{}'); } catch { /* تجاهل */ } return { id: r.id, kind: r.kind, name: r.name, active: !!r.active, created_at: r.created_at, ...d }; };
const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

// موظفين شهر معيّن: النشطين + اللي اتوقفوا خلال الشهر أو بعده + (القدام) الموقوفين اللي ليهم حضور أو كشف مرتب في الشهر.
// كده الموظف الموقوف بيتشال من الشهور الجاية بس، وسجله القديم (مرتبات/تقارير) يفضل ظاهر.
async function monthUsers(month) {
  const { db } = require('./db');
  const first = `${month}-01`;
  return db.all(`SELECT * FROM users u WHERE u.is_admin=0 AND u.pending=0 AND (u.active=1
      OR (u.suspended_at IS NOT NULL AND u.suspended_at>=?)
      OR (u.suspended_at IS NULL AND (EXISTS(SELECT 1 FROM attendance a WHERE a.user_id=u.id AND a.date LIKE ?)
        OR EXISTS(SELECT 1 FROM payslips p WHERE p.user_id=u.id AND p.month=?)))) ORDER BY u.id`, first, month + '-%', month);
}

module.exports = { locIds, monthUsers, parseCfg, truthy };
