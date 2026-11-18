/* BY Credit · 本地数据层（localStorage + 模拟 API） */
(function () {
  const KEY = 'bycredit_v2';
  const STORE_KEY = 'bycredit_stores';
  const M = window.MOCK;
  const DEFAULT_STORES = JSON.parse(JSON.stringify(M.STORES));
  let mem = null;

  const ROLE_LABELS = {
    admin: '管理员', sales: '业务员', manager: '门店店长', first: '初审专员',
    final: '终审专员', finance: '财务', aftercare: '贷后管理', collector: '催收专员'
  };
  const BY_ROLES = {
    '陈志远': '管理员', '林初审': '初审专员', '周终审': '终审专员',
    '王财务': '财务', '黄贷后': '贷后管理', '陈店长': '门店店长', '吴催收': '催收专员'
  };

  function text(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'object') {
      return Object.keys(v).map(k => `${k}: ${v[k] == null || v[k] === '' ? '—' : v[k]}`).join('；');
    }
    return String(v);
  }
  function roleOf(by, role) {
    if (ROLE_LABELS[role] || BY_ROLES[by]) return ROLE_LABELS[role] || BY_ROLES[by];
    if (by === '系统') return '系统';
    if (String(by || '').indexOf('催收') > -1) return '催收专员';
    return '业务员';
  }
  function addLog(o, action, opts) {
    opts = opts || {};
    o.logs = o.logs || [];
    o.logs.push({
      id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10),
      at: now(), by: opts.by || '系统', role: roleOf(opts.by, opts.role), action,
      before: text(opts.before), after: text(opts.after), note: opts.note || ''
    });
  }
  function channelName(v) {
    return {
      '小程序支付': '线上QR', '越南银行 App / 电子钱包': '线上QR',
      '银行流水': '其他转账', '人工销账': '线下现金'
    }[v] || v || '';
  }
  function normalizeOrder(o) {
    o.customer = o.customer || {};
    o.plan = o.plan || {};
    o.device = o.device || {};
    o.docs = o.docs || {};
    o.notes = o.notes || [];
    o.edits = o.edits || [];
    o.mdm = Object.assign({ serial: '', imei: o.device.imei || '', bound: false }, o.mdm || {});
    o.mdm.status = o.mdm.bound ? '已绑定' : '未绑定';
    if (o.mdm.bound && !o.mdm.imei) o.mdm.imei = o.device.imei || '';
    Object.keys(o.docs).forEach(k => {
      const d = o.docs[k];
      if (!d) return;
      d.by = d.by || o.plan.salesName || '业务员';
      d.at = d.at || o.submittedAt;
      d.versions = d.versions && d.versions.length ? d.versions : [{ name: d.name, at: d.at, by: d.by }];
    });
    (o.bills || []).forEach(b => { b.channel = channelName(b.channel); b.txnNo = b.txnNo || ''; });
    if (!Array.isArray(o.logs)) {
      o.logs = [{ id: 'seed-' + o.id, at: o.submittedAt, by: o.plan.salesName || '业务员', role: '业务员', action: '提交订单', before: '—', after: M.ORDER_STATUS[o.status] ? M.ORDER_STATUS[o.status].label : o.status, note: '' }];
      (o.esignLog || []).forEach(l => o.logs.push({ id: 'seed-es-' + o.id + '-' + l.at + '-' + l.attempt, at: l.at, by: l.by || '系统', role: l.by ? roleOf(l.by) : '系统', action: l.action, before: '—', after: l.contractNo || '—', note: '' }));
      if (o.mdm.boundAt) o.logs.push({ id: 'seed-mdm-' + o.id, at: o.mdm.boundAt, by: o.mdm.boundBy || '林初审', role: '初审专员', action: '绑定监管锁', before: '未绑定', after: `IMEI ${o.mdm.imei || o.device.imei || '—'} / 序列号 ${o.mdm.serial}`, note: '' });
      (o.edits || []).forEach((e, i) => o.logs.push({ id: 'seed-edit-' + o.id + '-' + i, at: e.at, by: e.by, role: roleOf(e.by), action: '修改订单资料', before: '—', after: e.fields, note: '' }));
      ['first', 'final'].forEach(k => {
        const r = o.review && o.review[k];
        if (r) o.logs.push({ id: 'seed-review-' + o.id + '-' + k, at: r.at, by: r.by, role: k === 'first' ? '初审专员' : '终审专员', action: (k === 'first' ? '初审' : '终审') + (r.result === 'pass' ? '通过' : '驳回'), before: '—', after: r.result === 'pass' ? '通过' : '驳回', note: r.note || '' });
      });
      if (o.finance && o.finance.at) o.logs.push({ id: 'seed-fin-' + o.id, at: o.finance.at, by: o.finance.by || '王财务', role: '财务', action: '财务' + o.finance.status, before: '—', after: o.finance.status, note: o.finance.note || '' });
      if (o.payout && o.payout.at) o.logs.push({ id: 'seed-pay-' + o.id, at: o.payout.at, by: '王财务', role: '财务', action: '确认放款', before: '待放款', after: o.payout.ref || '已放款', note: '' });
      o.notes.forEach((n, i) => o.logs.push({ id: 'seed-note-' + o.id + '-' + i, at: n.at, by: n.by, role: roleOf(n.by), action: '添加备注', before: '—', after: '—', note: n.text }));
    }
    return o;
  }
  function migrateStore(s) {
    s.type = s.type || '合作店铺';
    s.status = s.status === '冻结' || s.status === '暂停' ? '冻结' : '正常';
    s.rating = s.rating || 'A';
    s.logs = s.logs || [];
    return s;
  }
  function loadStores() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
          M.STORES.splice(0, M.STORES.length, ...saved.map(migrateStore));
          return;
        }
      }
    } catch (e) { /* 降级内存 */ }
    M.STORES.forEach(migrateStore);
  }
  function saveStores() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(M.STORES)); } catch (e) { /* 降级 */ }
  }
  function getStore(id) { return M.STORES.find(s => s.id === id || String(s.id) === String(id)); }

  function addStoreLog(s, action, opts) {
    opts = opts || {};
    s.logs = s.logs || [];
    s.logs.push({
      id: 'SL' + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10),
      at: now(), by: opts.by || '陈志远', role: roleOf(opts.by, opts.role || 'admin'), action,
      before: text(opts.before), after: text(opts.after), note: opts.note || ''
    });
  }

  function storeStats(s, orders) {
    const list = orders.filter(o => String(o.plan.storeId) === String(s.id));
    const reviewed = list.filter(o => ['draft', 'pending_first', 'pending_customer_sign', 'cancelled'].indexOf(o.status) === -1);
    const passed = reviewed.filter(o => ['rejected_first', 'rejected_final'].indexOf(o.status) === -1);
    const repaid = list.filter(o => ['repaying', 'overdue', 'breach', 'closed'].indexOf(o.status) > -1);
    const firstOverdue = repaid.filter(o => o.bills && o.bills[0] && o.bills[0].status === 'Breach');
    const badDebt = repaid.filter(o => o.status === 'breach');
    const pct = (n, d) => d ? Math.round(n / d * 1000) / 10 : 0;
    const metrics = {
      orders: list.length,
      passRate: reviewed.length ? pct(passed.length, reviewed.length) : 100,
      firstOverdueRate: pct(firstOverdue.length, repaid.length),
      badDebtRate: pct(badDebt.length, repaid.length)
    };
    let ratingAuto = 'A';
    if (metrics.badDebtRate >= 20 || metrics.firstOverdueRate >= 40) ratingAuto = 'D';
    else if (metrics.badDebtRate >= 10 || metrics.firstOverdueRate >= 20 || metrics.passRate < 50) ratingAuto = 'C';
    else if (metrics.badDebtRate > 0 || metrics.firstOverdueRate >= 10 || metrics.passRate < 75) ratingAuto = 'B';
    return {
      metrics, ratingAuto,
      orders: list.length,
      pending: list.filter(o => ['pending_first', 'pending_customer_sign', 'pending_final', 'approved_final', 'pending_finance', 'pending_payout'].indexOf(o.status) > -1).length,
      payout: repaid.reduce((sum, o) => sum + o.plan.price - (o.plan.downPayment || 0), 0),
      overdue: list.filter(o => o.status === 'overdue' || o.status === 'breach').length
    };
  }

  function ensure() {
    if (mem) return mem;
    loadStores();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.version === 2 && Array.isArray(d.orders)) {
          d.orders.forEach(normalizeOrder);
          mem = d; save(mem); return mem;
        }
      }
    } catch (e) { /* file:// 下可能受限，降级内存 */ }
    mem = { version: 2, orders: JSON.parse(JSON.stringify(M.ORDERS)).map(normalizeOrder) };
    save(mem);
    return mem;
  }
  function save(d) {
    mem = d;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 降级 */ }
  }

  function now() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function today() { return now().slice(0, 10); }
  const delay = (ms) => new Promise(r => setTimeout(r, ms || 260));

  function find(id) { return ensure().orders.find(o => o.id === id || o.no === id); }

  /* ===== 第三方服务对接配置（电子签约 / 监管锁），独立存储 ===== */
  const INT_KEY = 'bycredit_integrations';
  const DEFAULT_INT = {
    esign: {
      name: '电子签约', provider: 'MobiFone eContract', account: 'galaxy.phone',
      api: 'https://econtract.mobifone.vn', status: 'bound',
      boundAt: '2026-10-16 19:21', updatedAt: '2026-10-16 19:21'
    },
    mdm: {
      name: '监管锁（MDM）', provider: '准富 MDM', account: '389346380',
      api: 'https://mdm.zhunfu.cc', status: 'bound', mode: 'web',
      boundAt: '2026-10-07 15:34', updatedAt: '2026-10-07 15:34'
    }
  };
  function loadInt() {
    let d = JSON.parse(JSON.stringify(DEFAULT_INT));
    try {
      const raw = localStorage.getItem(INT_KEY);
      if (raw) d = Object.assign(d, JSON.parse(raw));
    } catch (e) { /* 降级内存 */ }
    return d;
  }
  function saveInt(d) {
    try { localStorage.setItem(INT_KEY, JSON.stringify(d)); } catch (e) { /* 降级 */ }
  }

  function isPrePay(o) {
    return ['draft', 'pending_first', 'rejected_first', 'pending_customer_sign', 'pending_final',
      'rejected_final', 'approved_final', 'pending_finance', 'pending_payout', 'cancelled'].indexOf(o.status) > -1;
  }

  function recalcOrderStatus(o) {
    if (isPrePay(o)) return o.status;
    const breach = o.bills.filter(b => b.status === 'Breach').length;
    const unpaid = o.bills.filter(b => b.status !== 'Paid' && b.status !== 'Settled').length;
    if (breach > 0) return breach >= 2 ? 'breach' : 'overdue';
    if (unpaid === 0) return 'closed';
    return 'repaying';
  }

  /* 状态分组：tab / stage 共用一套 key */
  const GROUP = {
    all: null,
    first: ['pending_first'],
    sign: ['pending_customer_sign'],
    final: ['pending_final'],
    toFinance: ['approved_final'],
    finance: ['approved_final', 'pending_finance'],
    payout: ['pending_payout'],
    repaying: ['repaying', 'overdue', 'breach'],
    rejected: ['rejected_first', 'rejected_final'],
    closed: ['closed']
  };
  const STAGE_KEY = { first: 'first', sign: 'sign', final: 'final', finance: 'finance', payout: 'payout' };

  function inGroup(o, key) {
    const g = GROUP[key];
    return !g || g.indexOf(o.status) > -1;
  }

  const API = {
    now, today,

    async listOrders(q) {
      q = q || {};
      await delay();
      let arr = ensure().orders.slice();
      if (q.salesId) arr = arr.filter(o => o.plan.salesId === q.salesId);
      if (q.store) arr = arr.filter(o => o.plan.storeId === q.store);
      if (q.sales) arr = arr.filter(o => o.plan.salesId === q.sales);
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        arr = arr.filter(o =>
          (o.no + o.customer.name + o.customer.phone + o.device.model + o.device.imei + (o.mdm.serial || ''))
            .toLowerCase().indexOf(k) > -1);
      }
      if (q.from) arr = arr.filter(o => o.submittedAt.slice(0, 10) >= q.from);
      if (q.to) arr = arr.filter(o => o.submittedAt.slice(0, 10) <= q.to);
      if (q.urgent) arr = arr.filter(o => o.urgent);
      arr.sort((a, b) => {
        if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
        return a.submittedAt < b.submittedAt ? 1 : -1;
      });
      const counts = {
        all: arr.length,
        first: arr.filter(o => inGroup(o, 'first')).length,
        sign: arr.filter(o => inGroup(o, 'sign')).length,
        final: arr.filter(o => inGroup(o, 'final')).length,
        toFinance: arr.filter(o => inGroup(o, 'toFinance')).length,
        finance: arr.filter(o => inGroup(o, 'finance')).length,
        payout: arr.filter(o => inGroup(o, 'payout')).length,
        repaying: arr.filter(o => inGroup(o, 'repaying')).length,
        rejected: arr.filter(o => inGroup(o, 'rejected')).length
      };
      let key = q.stage ? STAGE_KEY[q.stage] : (q.status || 'all');
      if (key && key !== 'all') arr = arr.filter(o => inGroup(o, key));
      const size = q.size || 10;
      const page = q.page || 1;
      return { items: arr.slice((page - 1) * size, page * size), total: arr.length, counts };
    },

    async counts() {
      const o = ensure().orders;
      return {
        first: o.filter(x => x.status === 'pending_first').length,
        sign: o.filter(x => x.status === 'pending_customer_sign').length,
        final: o.filter(x => x.status === 'pending_final').length,
        finance: o.filter(x => x.status === 'pending_finance' || x.status === 'approved_final').length,
        payout: o.filter(x => x.status === 'pending_payout').length,
        overdue: o.filter(x => x.status === 'overdue' || x.status === 'breach').length
      };
    },

    async getOrder(id) {
      await delay(160);
      const o = find(id);
      return o ? JSON.parse(JSON.stringify(o)) : null;
    },

    /* ===== 初审：导出表格后人工上传 MobiFone，并登记上传文件 ===== */
    async startEsign(id, by, fileName) {
      await delay(720);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (['pending_first', 'rejected_first'].indexOf(o.status) === -1) throw new Error('当前状态不可发起签约');
      if (o.esign.status === '已签署') throw new Error('已签署，无需重复发起');
      const int = loadInt().esign;
      if (int.status !== 'bound') throw new Error('电子签约账号未绑定，请先在“系统对接”中配置');
      const uploadName = String(fileName || '').trim();
      if (!uploadName) throw new Error('请填写已上传 MobiFone 的资料表格文件名');
      const attempt = (o.esign.attempt || 0) + 1;
      const at = now();
      const before = o.status;
      o.esign.status = '待客户签约';
      o.esign.contractNo = '';
      o.esign.attempt = attempt;
      o.esign.uploadedAt = at;
      o.esign.smsSentAt = '';
      o.esign.signedAt = '';
      o.esign.failReason = '';
      o.esign.fileName = uploadName;
      o.status = 'pending_customer_sign';
      o.esignLog = o.esignLog || [];
      o.esignLog.push({ attempt, contractNo: '', at, action: `人工上传 MobiFone 表格：${uploadName}`, by });
      addLog(o, attempt > 1 ? '重新登记 MobiFone 上传' : '登记 MobiFone 上传', { by, before, after: '待客户签约 / 合同号待回填', note: uploadName });
      save(mem);
      return o;
    },

    /* 人工查看 MobiFone 结果后回填合同号与签署状态 */
    async simulateSign(id, ok, reason, by, contractNo) {
      await delay(520);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (o.status !== 'pending_customer_sign') throw new Error('订单不在待签约状态');
      const actor = by || '林初审';
      const no = String(contractNo || '').trim();
      const note = String(reason || '').trim();
      if (ok && !no) throw new Error('签署成功时必须回填 MobiFone 合同号');
      if (!ok && !note) throw new Error('签署失败时必须填写失败原因');
      o.esignLog = o.esignLog || [];
      if (ok) {
        o.esign.status = '已签署';
        o.esign.contractNo = no;
        o.esign.signedAt = now();
        o.esign.failReason = '';
        o.contract = { type: '电子签约', status: '已签署', no, signedAt: o.esign.signedAt };
        o.esignLog.push({ attempt: o.esign.attempt, contractNo: no, at: now(), action: '人工回填签署成功', by: actor });
        o.status = o.mdm.bound ? 'pending_final' : 'pending_first';
        if (o.mdm.bound) {
          o.review.first = { by: actor, at: now(), result: 'pass', note: '人工确认签署成功，MDM 已绑定，流转终审', checks: [] };
          o.rejectReason = '';
        }
        addLog(o, '回填签署成功', { by: actor, before: '待客户签约', after: M.ORDER_STATUS[o.status].label, note: no });
      } else {
        o.esign.status = '签署失败';
        o.esign.contractNo = no;
        o.esign.failReason = note;
        o.status = 'pending_first';
        o.esignLog.push({ attempt: o.esign.attempt, contractNo: no, at: now(), action: '人工回填签署失败：' + note, by: actor });
        addLog(o, '回填签署失败', { by: actor, before: '待客户签约', after: '退回初审', note });
      }
      save(mem);
      return o;
    },

    /* ===== 初审：准富后台人工绑定，IMEI 与序列号分别必填 ===== */
    async bindMdm(id, serial, imei, by) {
      await delay(480);
      const o = find(id); if (!o) throw new Error('订单不存在');
      const s = String(serial || '').trim().replace(/\s+/g, '');
      const i = String(imei || '').trim().replace(/\s+/g, '').replace(/^IMEI[:：]?/i, '');
      if (i.length < 10) throw new Error('请填写正确的设备 IMEI');
      if (s.length < 6) throw new Error('请填写正确的监管锁序列号');
      const int = loadInt().mdm;
      if (int.status !== 'bound') throw new Error('监管锁账号未绑定，请先在“系统对接”中配置');
      const before = o.mdm && o.mdm.bound ? `IMEI ${o.mdm.imei} / 序列号 ${o.mdm.serial}` : '未绑定';
      o.mdm = {
        serial: s, imei: i, bound: true, boundAt: now(), boundBy: by || '林初审',
        provider: int.provider, account: int.account, status: '已绑定',
        source: '人工绑定（准富后台）'
      };
      o.device.imei = i;
      addLog(o, '绑定监管锁', { by: by || '林初审', before, after: `已绑定 / IMEI ${i} / 序列号 ${s}`, note: '准富无结果回调，人工回填' });
      save(mem);
      return o;
    },

    async unbindMdm(id, note, by) {
      await delay(420);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (!o.mdm || !o.mdm.bound) throw new Error('当前未绑定监管锁');
      if (!String(note || '').trim()) throw new Error('解除监管锁必须填写原因');
      const before = `IMEI ${o.mdm.imei || o.device.imei} / 序列号 ${o.mdm.serial}`;
      o.mdm = Object.assign({}, o.mdm, { bound: false, status: '未绑定', releasedAt: now(), releasedBy: by || '林初审' });
      addLog(o, '解除监管锁', { by: by || '林初审', before, after: '未绑定', note: String(note).trim() });
      save(mem);
      return o;
    },

    /* ===== 资料与账单方案：初审通过前初审可改，之后仅管理员可改 ===== */
    async updateOrder(id, patch, by, role) {
      await delay(360);
      const o = find(id); if (!o) throw new Error('订单不存在');
      patch = patch || {};
      const beforeFirstPass = ['pending_first', 'rejected_first', 'pending_customer_sign'].indexOf(o.status) > -1;
      const isAdmin = role === 'admin' || by === '陈志远' || (!role && !by);
      if (patch.plan && !beforeFirstPass && !isAdmin) throw new Error('初审通过后仅管理员可修改账单方案');
      if (patch.plan && beforeFirstPass && role && ['admin', 'first'].indexOf(role) === -1) throw new Error('当前角色不可修改账单方案');
      if (!patch.plan && isPrePay(o) === false) throw new Error('放款后不可修改客户资料');

      let nextPlan = null;
      if (patch.plan) {
        nextPlan = Object.assign({}, o.plan, patch.plan);
        nextPlan.price = Number(nextPlan.price) || 0;
        nextPlan.periods = Number(nextPlan.periods) || 0;
        nextPlan.downPayment = Number(nextPlan.downPayment) || 0;
        nextPlan.perPeriod = Number(nextPlan.perPeriod) || Math.round((nextPlan.price - nextPlan.downPayment) / (nextPlan.periods || 1));
        if (nextPlan.price <= 0 || nextPlan.downPayment < 0 || nextPlan.downPayment >= nextPlan.price) throw new Error('请检查商品售价与首付款');
        if (!Number.isInteger(nextPlan.periods) || nextPlan.periods < 1 || nextPlan.perPeriod <= 0) throw new Error('请检查期数与每期金额');
      }

      const before = {};
      const after = {};
      ['customer', 'device', 'payee'].forEach(k => {
        if (!patch[k]) return;
        before[k] = text(o[k]);
        o[k] = Object.assign({}, o[k], patch[k]);
        after[k] = text(o[k]);
      });
      if (nextPlan) {
        before.plan = `首付款 ${o.plan.downPayment || 0}；分期额 ${o.plan.price - (o.plan.downPayment || 0)}；期数 ${o.plan.periods}；每期金额 ${o.plan.perPeriod}`;
        const oldBills = o.bills || [];
        o.plan = nextPlan;
        o.bills = M.makeBills(o.plan, {}).map(b => {
          const old = oldBills.find(x => x.period === b.period && (x.status === 'Paid' || x.status === 'Settled'));
          return old ? Object.assign(b, {
            status: old.status, paidAmount: old.paidAmount, paidAt: old.paidAt,
            channel: old.channel, txnNo: old.txnNo, note: old.note
          }) : b;
        });
        after.plan = `首付款 ${o.plan.downPayment}；分期额 ${o.plan.price - o.plan.downPayment}；期数 ${o.plan.periods}；每期金额 ${o.plan.perPeriod}`;
      }
      o.edits = o.edits || [];
      o.edits.push({ by: by || '林初审', at: now(), fields: Object.keys(patch).filter(k => k !== 'note').join(' / ') });
      addLog(o, nextPlan ? '修改账单方案' : '修改订单资料', { by: by || '林初审', role, before, after, note: patch.note || '' });
      save(mem);
      return o;
    },

    async changeDueDate(id, date, note, by, role) {
      await delay(320);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('请选择新的首期还款日');
      if (!String(note || '').trim()) throw new Error('修改还款日必须填写原因');
      const beforeFirstPass = ['pending_first', 'rejected_first', 'pending_customer_sign'].indexOf(o.status) > -1;
      const isAdmin = role === 'admin' || by === '陈志远';
      if (!beforeFirstPass && !isAdmin) throw new Error('初审通过后仅管理员可修改还款日');
      if (beforeFirstPass && role && ['admin', 'first'].indexOf(role) === -1) throw new Error('当前角色不可修改还款日');
      const before = o.plan.firstDueDate;
      o.plan.firstDueDate = date;
      o.plan.dueDay = date.slice(8, 10);
      o.bills.forEach(b => { b.dueDate = M.addMonths(date, b.period - 1); });
      addLog(o, '修改还款日', { by: by || '林初审', role, before: `首期 ${before} / 每月 ${String(before).slice(8, 10)} 日`, after: `首期 ${date} / 每月 ${o.plan.dueDay} 日`, note: String(note).trim() });
      save(mem);
      return o;
    },

    async cancelOrder(id, note, by) {
      await delay(260);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (!String(note || '').trim()) throw new Error('取消订单必须填写原因');
      if (['repaying', 'overdue', 'breach', 'closed', 'cancelled'].indexOf(o.status) > -1) throw new Error('当前状态不可取消');
      const before = o.status;
      o.status = 'cancelled';
      addLog(o, '取消订单', { by: by || '陈志远', role: 'admin', before, after: 'cancelled', note: String(note).trim() });
      save(mem);
      return o;
    },

    async getCustomerHistory(id) {
      await delay(80);
      const o = find(id); if (!o) return [];
      const idNo = String(o.customer.idNo || '').replace(/\s/g, '');
      if (!idNo) return [];
      return ensure().orders.filter(x => x.id !== o.id && String(x.customer.idNo || '').replace(/\s/g, '') === idNo).map(x => {
        const bad = x.status === 'overdue' || x.status === 'breach' || (x.bills || []).some(b => b.status === 'Breach');
        return { id: x.id, no: x.no, status: x.status, risk: bad ? 'bad' : 'normal', label: bad ? '历史订单存在逾期 / 坏账' : (x.status === 'closed' ? '历史订单已结清' : '历史客户正常还款中') };
      });
    },

    /* ===== 初审 / 终审 ===== */
    async reviewFirst(id, payload) {
      await delay(360);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (o.status !== 'pending_first') throw new Error('订单不在待初审状态');
      if (payload.result !== 'pass' && !String(payload.note || '').trim()) throw new Error('初审驳回必须填写原因');
      const before = o.status;
      if (payload.result === 'pass') {
        if (o.esign.status !== '已签署') throw new Error('电子签约未完成，不能初审通过');
        if (!o.mdm.bound) throw new Error('请先绑定 MDM（IMEI 与序列号均必填）');
        if (!o.payee || !o.payee.account) throw new Error('请先补充门店收款信息');
        o.status = 'pending_final';
        o.rejectReason = '';
      } else {
        o.status = 'rejected_first';
        o.rejectReason = String(payload.note).trim();
      }
      o.review.first = { by: '林初审', at: now(), result: payload.result, note: payload.note || '', checks: payload.checks || [] };
      addLog(o, payload.result === 'pass' ? '初审通过' : '初审驳回', { by: '林初审', role: 'first', before, after: o.status, note: payload.note || '' });
      save(mem);
      return o;
    },

    async reviewFinal(id, payload) {
      await delay(360);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (o.status !== 'pending_final') throw new Error('订单不在待终审状态');
      if (payload.result !== 'pass' && !String(payload.note || '').trim()) throw new Error('终审驳回必须填写原因');
      const before = o.status;
      if (payload.terms) throw new Error('初审通过后仅管理员可修改账单方案');
      if (payload.result === 'pass') {
        o.status = 'approved_final';
        o.rejectReason = '';
      } else {
        o.status = 'rejected_final';
        o.rejectReason = String(payload.note).trim();
      }
      o.review.final = { by: '周终审', at: now(), result: payload.result, note: payload.note || '', checks: payload.checks || [] };
      addLog(o, payload.result === 'pass' ? '终审通过' : '终审驳回', { by: '周终审', role: 'final', before, after: o.status, note: payload.note || '' });
      save(mem);
      return o;
    },

    /* ===== 财务 ===== */
    async sendToFinance(ids, by) {
      await delay(420);
      const arr = Array.isArray(ids) ? ids : [ids];
      let n = 0;
      arr.forEach(id => {
        const o = find(id);
        if (!o || o.status !== 'approved_final') return;
        const st = getStore(o.plan.storeId);
        if (st && st.status === '冻结') {
          addLog(o, '送财务被拦截', { by: by || '周终审', before: o.status, after: o.status, note: '门店已冻结，不可送财务' });
          return;
        }
        o.status = 'pending_finance';
        o.finance = { status: '待审核', by: '', at: '', note: '' };
        addLog(o, '发送财务审核', { by: by || '周终审', role: 'final', before: 'approved_final', after: o.status });
        n++;
      });
      save(mem);
      return n;
    },

    async financeApprove(ids, by) {
      await delay(420);
      const arr = Array.isArray(ids) ? ids : [ids];
      let n = 0;
      arr.forEach(id => {
        const o = find(id);
        if (o && o.status === 'pending_finance') {
          o.status = 'pending_payout';
          o.finance = { status: '已通过', by: by || '王财务', at: now(), note: '' };
          o.payout = { status: '待放款', at: '', ref: '' };
          addLog(o, '财务审批通过', { by: by || '王财务', role: 'finance', before: 'pending_finance', after: o.status });
          n++;
        }
      });
      save(mem);
      return n;
    },

    async financeReject(id, note, by) {
      await delay(320);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (!String(note || '').trim()) throw new Error('财务退回必须填写原因');
      const before = o.status;
      o.status = 'approved_final';
      o.finance = { status: '已退回', by: by || '王财务', at: now(), note: String(note).trim() };
      addLog(o, '财务退回', { by: by || '王财务', role: 'finance', before, after: o.status, note: o.finance.note });
      save(mem);
      return o;
    },

    async markPayout(id, ref) {
      await delay(360);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (o.status !== 'pending_payout') throw new Error('订单不在待放款状态');
      const before = o.status;
      o.status = 'repaying';
      o.payout = { status: '已放款', at: now(), ref: ref || ('VCB-' + today().replace(/-/g, '') + '-' + o.no.slice(-4)) };
      addLog(o, '确认放款', { by: '王财务', role: 'finance', before, after: o.status, note: '银行回单号 ' + o.payout.ref });
      save(mem);
      return o;
    },

    async markUrgent(ids, flag) {
      await delay(200);
      const arr = Array.isArray(ids) ? ids : [ids];
      arr.forEach(id => {
        const o = find(id); if (!o) return;
        const before = !!o.urgent;
        o.urgent = flag !== false;
        addLog(o, o.urgent ? '标记加急' : '取消加急', { by: '陈志远', role: 'admin', before: before ? '加急' : '普通', after: o.urgent ? '加急' : '普通' });
      });
      save(mem);
      return true;
    },

    /* ===== 录单 ===== */
    async createOrder(payload) {
      await delay(520);
      const d = ensure();
      const id = 'o' + Date.now().toString(36);
      const no = 'N' + today().replace(/-/g, '') + String(Math.floor(Math.random() * 9000000 + 1000000));
      const plan = Object.assign({}, payload.plan);
      plan.price = Number(plan.price);
      plan.downPayment = Number(plan.downPayment || 0);
      plan.periods = Number(plan.periods);
      const st = getStore(plan.storeId);
      if (!st) throw new Error('请选择有效门店');
      const sl = M.SALES.find(s => s.id === plan.salesId) || M.SALES[0];
      if (st.status === '冻结') {
        addStoreLog(st, '录单被拦截', { by: sl.name, role: 'sales', before: '提交新订单', after: '未创建', note: '门店已冻结，不可录入新单' });
        saveStores();
        throw new Error('所选门店已冻结，不可录入新单');
      }
      if (plan.price <= 0 || plan.downPayment < 0 || plan.downPayment >= plan.price) throw new Error('请检查商品售价与首付款');
      if (!Number.isInteger(plan.periods) || plan.periods < 1) throw new Error('请填写正确的期数');
      plan.storeId = st.id; plan.storeName = st.name; plan.storeCity = st.city;
      plan.salesId = sl.id; plan.salesName = sl.name;
      if (!plan.firstDueDate) {
        const n = new Date();
        n.setMonth(n.getMonth() + 1);
        const p2 = v => String(v).padStart(2, '0');
        plan.firstDueDate = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;
      }
      plan.dueDay = plan.dueDay || plan.firstDueDate.slice(8, 10);
      plan.perPeriod = Math.round((plan.price - plan.downPayment) / plan.periods);
      const o = {
        id, no, status: 'pending_first', submittedAt: now(), source: '业务员录单',
        customer: payload.customer, docs: payload.docs || {}, device: payload.device,
        plan,
        esign: { status: '未发起', contractNo: '', attempt: 0, uploadedAt: '', smsSentAt: '', signedAt: '', failReason: '' },
        esignLog: [],
        contract: { type: '电子签约', status: '未签署', no: '', signedAt: '' },
        mdm: { serial: '', imei: '', bound: false, status: '未绑定', boundAt: '', boundBy: '' },
        payee: Object.assign({ qr: '' }, payload.payee || st.payee),
        finance: { status: '未提交', by: '', at: '', note: '' },
        payout: { status: '待放款', at: '', ref: '' },
        urgent: !!payload.urgent,
        review: { first: null, final: null },
        bills: M.makeBills(plan, {}),
        notes: [], deviceLock: '未锁定', rejectReason: '', edits: [], logs: []
      };
      normalizeOrder(o);
      addLog(o, '提交订单', { by: sl.name, role: 'sales', before: '—', after: '待初审', note: `门店：${st.name}；客户资料 ${Object.keys(o.docs).length} 项` });
      d.orders.unshift(o);
      save(d);
      return o;
    },

    async updateOrderDoc(id, docKey, doc, by) {
      await delay(240);
      const o = find(id); if (!o) throw new Error('订单不存在');
      if (!doc || !String(doc.name || '').trim()) throw new Error('请选择要上传的附件');
      const old = o.docs[docKey];
      const actor = by || doc.by || (window.Shell ? window.Shell.roleInfo().name : '') || o.plan.salesName || '业务员';
      const next = Object.assign({}, doc, {
        name: String(doc.name).trim(), at: doc.at || now(), by: actor
      });
      const versions = old && Array.isArray(old.versions) ? old.versions.slice() : [];
      versions.push({ name: next.name, at: next.at, by: next.by });
      next.versions = versions;
      o.docs[docKey] = next;
      addLog(o, old ? '更新附件' : '上传附件', {
        by: next.by, before: old ? `${old.name} / ${old.at || '—'} / ${old.by || '—'}` : '未上传',
        after: `${docKey} / ${next.name}`, note: doc.note || ''
      });
      save(mem);
      return o;
    },

    async resubmit(orderId, by) {
      await delay(320);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      if (['rejected_first', 'rejected_final'].indexOf(o.status) === -1) throw new Error('当前状态不可重新提交');
      const before = o.status;
      o.status = 'pending_first';
      o.rejectReason = '';
      o.submittedAt = now();
      addLog(o, '重新提交订单', { by: by || o.plan.salesName, role: 'sales', before, after: o.status, note: '资料已补充，重新进入初审' });
      save(mem);
      return o;
    },

    async addNote(orderId, noteText, by) {
      await delay(220);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      const value = String(noteText || '').trim();
      if (!value) throw new Error('备注内容不能为空');
      o.notes.push({ by: by || '陈志远', at: now(), text: value });
      addLog(o, '添加备注', { by: by || '陈志远', before: '—', after: '—', note: value });
      save(mem);
      return o;
    },

    /* ===== 账单 ===== */
    async listBills(q) {
      q = q || {};
      await delay();
      let rows = [];
      ensure().orders.forEach(o => {
        if (['repaying', 'overdue', 'breach', 'closed'].indexOf(o.status) === -1) return;
        o.bills.forEach(b => rows.push(Object.assign({}, b, {
          orderId: o.id, orderNo: o.no, customer: o.customer.name, phone: o.customer.phone,
          storeId: o.plan.storeId, storeName: o.plan.storeName, salesName: o.plan.salesName,
          model: o.device.model + ' ' + o.device.capacity, orderStatus: o.status
        })));
      });
      if (q.status && q.status !== 'all') rows = rows.filter(r => r.status === q.status);
      if (q.month) rows = rows.filter(r => r.dueDate.slice(0, 7) === q.month);
      if (q.store) rows = rows.filter(r => r.storeId === q.store);
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        rows = rows.filter(r => (r.orderNo + r.customer + r.phone + r.model).toLowerCase().indexOf(k) > -1);
      }
      rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      const summary = {
        due: rows.filter(r => r.status !== 'Settled').reduce((s, r) => s + r.amount, 0),
        paid: rows.reduce((s, r) => s + r.paidAmount, 0),
        overdue: rows.filter(r => r.status === 'Breach').reduce((s, r) => s + r.amount, 0),
        overdueCount: rows.filter(r => r.status === 'Breach').length,
        count: rows.length
      };
      const size = q.size || 12, page = q.page || 1;
      return { items: rows.slice((page - 1) * size, page * size), total: rows.length, summary };
    },

    async payBill(orderId, period, meta) {
      await delay(420);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      const b = o.bills.find(x => x.period === period); if (!b) throw new Error('账单不存在');
      if (b.status === 'Paid' || b.status === 'Settled') throw new Error('该期账单已完成还款，不可重复登记');
      meta = meta || {};
      const channel = channelName(meta.channel || '线上QR');
      if (['线上QR', '其他转账', '线下现金'].indexOf(channel) === -1) throw new Error('支付渠道仅支持线上QR、其他转账或线下现金');
      const txnNo = String(meta.txnNo || '').trim();
      if (meta.manual === true && !txnNo) throw new Error('代客登记必须填写支付订单号');
      const paymentTxnNo = txnNo || ('TXN' + Date.now().toString().slice(-10));
      const paidAt = String(meta.at || meta.paidAt || now()).replace('T', ' ').trim();
      const before = `第 ${period} 期 ${b.status} / 未收款`;
      b.status = 'Paid';
      b.paidAmount = b.amount;
      b.paidAt = paidAt;
      b.channel = channel;
      b.txnNo = paymentTxnNo;
      b.note = String(meta.note || '').trim();
      const beforeOrderStatus = o.status;
      o.status = recalcOrderStatus(o);
      const by = meta.by || (channel === '线上QR' && meta.manual !== true ? '系统' : '黄贷后');
      addLog(o, by === '系统' ? '线上支付到账' : '代客登记还款', {
        by, role: meta.role, before: `${before}；订单 ${beforeOrderStatus}`,
        after: `第 ${period} 期已还 / ${channel} / ${paymentTxnNo} / ${paidAt}；订单 ${o.status}`,
        note: b.note
      });
      save(mem);
      return o;
    },

    async settleEarly(orderId, amount, meta) {
      await delay(420);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      meta = meta || {};
      const channel = channelName(meta.channel || '其他转账');
      if (['线上QR', '其他转账', '线下现金'].indexOf(channel) === -1) throw new Error('支付渠道不正确');
      const unpaid = o.bills.filter(b => b.status !== 'Paid' && b.status !== 'Settled');
      if (!unpaid.length) throw new Error('订单已全部结清');
      const paidAt = String(meta.at || meta.paidAt || now()).replace('T', ' ');
      const txnNo = String(meta.txnNo || '').trim() || ('SETTLE' + Date.now().toString().slice(-10));
      const before = `剩余 ${unpaid.length} 期 / ${U.currency(unpaid.reduce((s, b) => s + b.amount, 0))}`;
      const settleAmount = amount || unpaid.reduce((s, b) => s + b.amount, 0);
      const by = meta.by || '王财务';
      unpaid.forEach(b => {
        b.status = 'Settled'; b.paidAmount = b.amount; b.paidAt = paidAt;
        b.channel = channel; b.txnNo = txnNo; b.note = '提前结清';
      });
      o.status = 'closed';
      const note = String(meta.note || '客户提前结清').trim();
      o.notes.push({ by, at: now(), text: `操作提前结清，结清金额 ${U.currency(settleAmount)}` });
      addLog(o, '提前结清', { by, role: meta.role || 'finance', before, after: `已结清 / ${channel} / ${txnNo} / ${paidAt}`, note });
      save(mem);
      return o;
    },

    async deferBill(orderId, period, days, note, by) {
      await delay(300);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      const b = o.bills.find(x => x.period === period); if (!b) throw new Error('账单不存在');
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error('延期天数须为 1-30 天');
      if (!String(note || '').trim()) throw new Error('办理延期必须填写原因');
      if (b.status === 'Paid' || b.status === 'Settled') throw new Error('已还账单不可延期');
      const before = `${b.status} / 应还日 ${b.dueDate}`;
      b.status = 'Deferred';
      b.note = `延期 ${n} 天：${String(note).trim()}`;
      o.status = recalcOrderStatus(o);
      addLog(o, '办理延期', { by: by || '黄贷后', role: 'aftercare', before, after: `Deferred / 延期 ${n} 天`, note: String(note).trim() });
      save(mem);
      return o;
    },

    async markBreach(orderId, period, note, by) {
      await delay(300);
      const o = find(orderId); if (!o) throw new Error('订单不存在');
      const b = o.bills.find(x => x.period === period); if (!b) throw new Error('账单不存在');
      if (!String(note || '').trim()) throw new Error('标记坏账必须填写原因');
      if (b.status === 'Paid' || b.status === 'Settled') throw new Error('已还账单不可标记坏账');
      const before = `账单 ${b.status} / 订单 ${o.status}`;
      b.status = 'Breach';
      b.note = String(note).trim();
      o.status = recalcOrderStatus(o);
      addLog(o, '标记坏账', { by: by || '黄贷后', role: 'aftercare', before, after: `第 ${period} 期 Breach / 订单 ${o.status}`, note: b.note });
      save(mem);
      return o;
    },

    /* ===== 贷后对账 ===== */
    async listRecon(q) {
      q = q || {};
      await delay();
      const todayStr = today();
      let rows = [];
      ensure().orders.forEach(o => {
        if (['repaying', 'overdue', 'breach', 'closed'].indexOf(o.status) === -1) return;
        const dueBills = o.bills.filter(b =>
          b.status === 'Paid' || b.status === 'Settled' || b.dueDate <= todayStr);
        const dueAmount = dueBills.reduce((s, b) => s + b.amount, 0);
        const bankPaid = o.bills
          .filter(b => (b.status === 'Paid' || b.status === 'Settled') && ['线上QR', '其他转账'].indexOf(b.channel) > -1)
          .reduce((s, b) => s + b.paidAmount, 0);
        const paidAtList = o.bills.filter(b => b.paidAt).map(b => b.paidAt).sort();
        rows.push({
          orderId: o.id, orderNo: o.no, customer: o.customer.name, phone: o.customer.phone,
          storeName: o.plan.storeName, model: o.device.model + ' ' + o.device.capacity,
          periods: o.plan.periods, perPeriod: o.plan.perPeriod,
          duePeriods: dueBills.length, dueAmount, bankPaid,
          diff: bankPaid - dueAmount,
          lastPaidAt: paidAtList.length ? paidAtList[paidAtList.length - 1] : '',
          orderStatus: o.status, notes: o.notes.length
        });
      });
      if (q.status === 'diff') rows = rows.filter(r => r.diff !== 0);
      if (q.status === 'ok') rows = rows.filter(r => r.diff === 0);
      if (q.status === 'short') rows = rows.filter(r => r.diff < 0);
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        rows = rows.filter(r => (r.orderNo + r.customer + r.phone + r.model).toLowerCase().indexOf(k) > -1);
      }
      rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      const summary = {
        count: rows.length,
        diffCount: rows.filter(r => r.diff !== 0).length,
        dueAmount: rows.reduce((s, r) => s + r.dueAmount, 0),
        bankPaid: rows.reduce((s, r) => s + r.bankPaid, 0),
        diffAmount: rows.reduce((s, r) => s + r.diff, 0)
      };
      const size = q.size || 12, page = q.page || 1;
      return { items: rows.slice((page - 1) * size, page * size), total: rows.length, summary };
    },

    /* ===== 合同清单 ===== */
    async listContracts(q) {
      q = q || {};
      await delay();
      let rows = ensure().orders
        .filter(o => o.esign.contractNo || (o.contract && o.contract.no))
        .map(o => ({
          orderId: o.id, orderNo: o.no, customer: o.customer.name, phone: o.customer.phone,
          storeName: o.plan.storeName, salesName: o.plan.salesName,
          contractNo: o.esign.contractNo || o.contract.no,
          type: o.esign.contractNo ? '电子签约' : (o.contract.type || '电子签约'),
          signStatus: o.contract.status === '已签署' ? '已签署' : (o.esign.status || '未签署'),
          attempt: o.esign.attempt || 1,
          signedAt: o.contract.signedAt || o.esign.signedAt || '',
          amount: o.plan.price, orderStatus: o.status
        }));
      if (q.type && q.type !== 'all') rows = rows.filter(r => r.type === q.type);
      if (q.status && q.status !== 'all') {
        rows = rows.filter(r => q.status === 'signed' ? r.signStatus === '已签署' : r.signStatus !== '已签署');
      }
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        rows = rows.filter(r => (r.contractNo + r.orderNo + r.customer + r.phone).toLowerCase().indexOf(k) > -1);
      }
      rows.sort((a, b) => (a.signedAt || '') < (b.signedAt || '') ? 1 : -1);
      const summary = {
        count: rows.length,
        signed: rows.filter(r => r.signStatus === '已签署').length,
        pending: rows.filter(r => r.signStatus !== '已签署').length,
        amount: rows.filter(r => r.signStatus === '已签署').reduce((s, r) => s + r.amount, 0)
      };
      const size = q.size || 12, page = q.page || 1;
      return { items: rows.slice((page - 1) * size, page * size), total: rows.length, summary };
    },

    /* ===== 客户档案 ===== */
    async listCustomers(q) {
      q = q || {};
      await delay();
      const map = {};
      ensure().orders.forEach(o => {
        const k = o.customer.idNo || o.customer.phone;
        if (!map[k]) {
          map[k] = {
            name: o.customer.name, phone: o.customer.phone, idNo: o.customer.idNo,
            address: o.customer.address, emergencyName: o.customer.emergencyName,
            emergencyPhone: o.customer.emergencyPhone,
            orders: 0, total: 0, lastAt: '', models: [], status: 'normal', overdue: 0, orderIds: []
          };
        }
        const c = map[k];
        c.orders++;
        c.total += o.plan.price;
        c.orderIds.push(o.id);
        if (!c.lastAt || o.submittedAt > c.lastAt) c.lastAt = o.submittedAt;
        const m = o.device.model + ' ' + o.device.capacity;
        if (c.models.indexOf(m) === -1) c.models.push(m);
        if (o.status === 'overdue' || o.status === 'breach') { c.overdue++; c.status = 'overdue'; }
        else if (o.status === 'repaying' && c.status === 'normal') c.status = 'repaying';
      });
      let rows = Object.keys(map).map(k => map[k]);
      if (q.status && q.status !== 'all') rows = rows.filter(r => r.status === q.status);
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        rows = rows.filter(r => (r.name + r.phone + r.idNo + r.address).toLowerCase().indexOf(k) > -1);
      }
      rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
      const size = q.size || 12, page = q.page || 1;
      return {
        items: rows.slice((page - 1) * size, page * size), total: rows.length,
        summary: {
          count: rows.length,
          repeat: rows.filter(r => r.orders > 1).length,
          overdue: rows.filter(r => r.status === 'overdue').length,
          total: rows.reduce((s, r) => s + r.total, 0)
        }
      };
    },

    /* ===== 门店 ===== */
    async listStores(q) {
      q = q || {};
      await delay();
      const orders = ensure().orders;
      let rows = M.STORES.map(s => {
        const stats = storeStats(s, orders);
        s.metrics = stats.metrics;
        s.ratingAuto = stats.ratingAuto;
        return Object.assign({}, s, stats);
      });
      if (q.status && q.status !== 'all') rows = rows.filter(r => r.status === q.status);
      if (q.type && q.type !== 'all') rows = rows.filter(r => r.type === q.type);
      if (q.rating && q.rating !== 'all') rows = rows.filter(r => r.rating === q.rating);
      if (q.city) rows = rows.filter(r => r.city === q.city);
      if (q.q) {
        const k = q.q.trim().toLowerCase();
        rows = rows.filter(r => (r.name + r.id + r.city + r.contact + r.phone).toLowerCase().indexOf(k) > -1);
      }
      rows.sort((a, b) => b.orders - a.orders);
      return { items: JSON.parse(JSON.stringify(rows)), total: rows.length };
    },

    async saveStore(payload, by, note) {
      await delay(320);
      const id = String(payload.id || '').trim();
      const name = String(payload.name || '').trim();
      if (!id || !name) throw new Error('门店编号与名称必填');
      const idx = M.STORES.findIndex(s => String(s.id) === id);
      const old = idx > -1 ? M.STORES[idx] : null;
      const next = Object.assign({}, old || {
        logs: [], status: '正常', rating: 'A', agreement: '待签署'
      }, payload, { id, name });
      next.type = next.type === '自有店铺' ? '自有店铺' : '合作店铺';
      next.status = old ? old.status : '正常';
      next.rating = old ? old.rating : (['A', 'B', 'C', 'D'].indexOf(next.rating) > -1 ? next.rating : 'A');
      next.agreement = next.type === '自有店铺' ? '无需签署' : (next.agreement || '待签署');
      next.logs = old ? old.logs : [];
      addStoreLog(next, old ? '编辑门店资料' : '新增门店', {
        by: by || '陈志远', before: old ? `${old.name} / ${old.type} / ${old.status}` : '—',
        after: `${next.name} / ${next.type} / ${next.status}`, note: note || ''
      });
      if (idx > -1) M.STORES[idx] = next;
      else M.STORES.push(next);
      saveStores();
      return JSON.parse(JSON.stringify(next));
    },

    async changeStoreRating(id, rating, note, by) {
      await delay(260);
      const s = getStore(id); if (!s) throw new Error('门店不存在');
      if (['A', 'B', 'C', 'D'].indexOf(rating) === -1) throw new Error('请选择正确的门店评级');
      if (!String(note || '').trim()) throw new Error('修改评级必须填写原因');
      if (s.rating === rating) throw new Error('生效评级未发生变化');
      const before = s.rating;
      s.rating = rating;
      addStoreLog(s, '修改门店评级', { by: by || '陈志远', before, after: rating, note: String(note).trim() });
      saveStores();
      return JSON.parse(JSON.stringify(s));
    },

    async changeStoreStatus(id, status, note, by) {
      await delay(260);
      const s = getStore(id); if (!s) throw new Error('门店不存在');
      if (['正常', '冻结'].indexOf(status) === -1) throw new Error('请选择正确的门店状态');
      if (!String(note || '').trim()) throw new Error('冻结或恢复门店必须填写原因');
      if (s.status === status) throw new Error('门店状态未发生变化');
      const before = s.status;
      s.status = status;
      addStoreLog(s, status === '冻结' ? '冻结门店' : '恢复门店', { by: by || '陈志远', before, after: status, note: String(note).trim() });
      saveStores();
      return JSON.parse(JSON.stringify(s));
    },

    /* ===== 系统对接：电子签约 / 监管锁 ===== */
    async getIntegrations() {
      await delay(140);
      return JSON.parse(JSON.stringify(loadInt()));
    },

    async saveIntegration(key, patch) {
      await delay(380);
      const d = loadInt();
      if (!d[key]) throw new Error('未知的服务类型');
      d[key] = Object.assign({}, d[key], patch, { status: 'bound', updatedAt: now() });
      if (!d[key].boundAt) d[key].boundAt = now();
      saveInt(d);
      return JSON.parse(JSON.stringify(d));
    },

    async testIntegration(key) {
      await delay(640);
      const d = loadInt();
      if (!d[key]) throw new Error('未知的服务类型');
      if (!d[key].api) throw new Error('请先填写平台后台地址');
      if (!d[key].account) throw new Error('请先填写账号');
      if (key === 'esign') return { ok: true, message: '配置完整：请登录 MobiFone 后台上传统一表格' };
      if (d[key].mode === 'web') {
        return { ok: true, message: '配置完整：请用该账号登录准富后台，完成后人工回填结果' };
      }
      return { ok: true, message: `配置已保存 · ${d[key].provider}` };
    },

    async unbindIntegration(key) {
      await delay(340);
      const d = loadInt();
      if (!d[key]) throw new Error('未知的服务类型');
      d[key] = Object.assign({}, d[key], { status: 'unbound', updatedAt: now() });
      saveInt(d);
      return JSON.parse(JSON.stringify(d));
    },

    async reset() {
      M.STORES.splice(0, M.STORES.length, ...JSON.parse(JSON.stringify(DEFAULT_STORES)).map(migrateStore));
      saveStores();
      mem = { version: 2, orders: JSON.parse(JSON.stringify(M.ORDERS)).map(normalizeOrder) };
      save(mem);
      return true;
    }
  };

  /* ===== 通用工具 ===== */
  const U = {
    money(n) {
      if (n == null || isNaN(n)) return '0';
      return Math.round(Number(n)).toLocaleString('en-US');
    },
    currency(n) { return U.money(n) + ' ₫'; },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    pill(status, map) {
      const m = (map || M.ORDER_STATUS)[status] || { label: status, tone: 'gray' };
      return `<span class="pill ${m.tone}">${U.esc(m.label)}</span>`;
    },
    billPill(status) {
      const m = M.BILL_STATUS[status] || { label: status, tone: 'gray' };
      return `<span class="pill ${m.tone}">${m.label}</span>`;
    },
    qs(name) { return new URLSearchParams(location.search).get(name); },
    toast(msg, type) {
      let el = document.querySelector('.toast');
      if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
      el.className = 'toast ' + (type || 'ok');
      el.textContent = msg;
      requestAnimationFrame(() => el.classList.add('show'));
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), 2600);
    },
    async navCounts() {
      const c = await API.counts();
      document.querySelectorAll('[data-count]').forEach(el => {
        const k = el.getAttribute('data-count');
        if (c[k] == null) return;
        el.textContent = c[k];
        el.classList.toggle('hot', c[k] > 0);
      });
    },
    setNav(key) {
      document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-nav') === key);
      });
    },
    resetDemo() {
      if (!confirm('将恢复内置的演示订单，当前操作记录会丢失。继续？')) return;
      API.reset().then(() => { U.toast('演示数据已重置'); setTimeout(() => location.reload(), 420); });
    }
  };

  window.API = API;
  window.U = U;
})();
