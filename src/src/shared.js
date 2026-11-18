'use strict';
/* src/shared.js — دوال مشتركة بين أكتر من مجموعة API */


/* ----- لوحة المعلومات ----- */
/* ----- لوحة المعلومات: تجميعات بنفس معادلات كشف المرتب (بما فيها سياسات الجزاءات والإضافي والعطلات) ----- */
const locIds = (u) => { try { return JSON.parse(u.location_ids || '[]'); } catch { return []; } };
const parseCfg = (r) => { let d = {}; try { d = JSON.parse(r.data || '{}'); } catch { /* تجاهل */ } return { id: r.id, kind: r.kind, name: r.name, active: !!r.active, created_at: r.created_at, ...d }; };
const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

module.exports = { locIds, parseCfg, truthy };
