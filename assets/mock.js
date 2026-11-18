/* BY Credit · 演示数据（字段与真实导出表 + 新流程对齐） */
(function () {
  const STORES = [
    { id: '101', name: 'hanoi', city: '河内', type: '自有店铺', rating: 'A', address: 'Số 12 Trần Duy Hưng, Cầu Giấy', contact: 'Nguyễn Văn Hùng', phone: '0912345678', agreement: '无需签署', status: '正常', payee: { name: 'Nguyễn Văn Hùng', account: '1903 6688 9999', bank: 'Techcombank' } },
    { id: '223', name: 'Hanoi-Topmax 50', city: '河内', type: '合作店铺', rating: 'B', address: '50 Thái Hà, Đống Đa', contact: 'Trần Thị Mai', phone: '0987654321', agreement: '已签署', status: '正常', payee: { name: 'Trần Thị Mai', account: '0123 4567 8901', bank: 'Vietcombank' } },
    { id: '141', name: 'Hanoi-KT 268 Mobile', city: '河内', type: '合作店铺', rating: 'A', address: '268 Kim Mã, Ba Đình', contact: 'Đỗ Quang Minh', phone: '0901234567', agreement: '已签署', status: '正常', payee: { name: 'Đỗ Quang Minh', account: '0881 0023 4567', bank: 'MB Bank' } },
    { id: '114', name: 'Hanoi-Ti Mobile', city: '河内', type: '合作店铺', rating: 'A', address: '88 Chùa Bộc, Đống Đa', contact: 'Lê Thị Hoa', phone: '0978123456', agreement: '已签署', status: '正常', payee: { name: 'Lê Thị Hoa', account: '0071 0002 3456', bank: 'Agribank' } },
    { id: '264', name: 'Hanoi-Alo Mobile 360', city: '河内', type: '合作店铺', rating: 'B', address: '360 Cầu Giấy', contact: 'Phạm Văn Nam', phone: '0967123456', agreement: '待续签', status: '正常', payee: { name: 'Phạm Văn Nam', account: '0602 1234 5678', bank: 'Sacombank' } },
    { id: '185', name: 'Hanoi-Quang Đại Apple', city: '河内', type: '合作店铺', rating: 'A', address: '185 Nguyễn Trãi, Thanh Xuân', contact: 'Vũ Đức Anh', phone: '0918765432', agreement: '已签署', status: '正常', payee: { name: 'Vũ Đức Anh', account: '1023 4567 8901', bank: 'VPBank' } },
    { id: '119', name: 'Hùng Store-Quang Trung', city: '胡志明', type: '合作店铺', rating: 'A', address: '119 Quang Trung, Gò Vấp', contact: 'Hùng', phone: '0938123456', agreement: '已签署', status: '正常', payee: { name: 'Nguyễn Hùng', account: '0071 0009 8765', bank: 'Agribank' } },
    { id: '116', name: 'Hcm-KTV store Phan Van Tri', city: '胡志明', type: '合作店铺', rating: 'C', address: '116 Phan Văn Trị, Bình Thạnh', contact: 'KTV', phone: '0948123456', agreement: '已签署', status: '正常', payee: { name: 'Trần KTV', account: '1903 7788 1122', bank: 'Techcombank' } },
    { id: '130', name: 'Hcm-Minh Khôi store-344s', city: '胡志明', type: '合作店铺', rating: 'D', address: '344 Lê Văn Sỹ, Quận 3', contact: 'Minh Khôi', phone: '0958123456', agreement: '待续签', status: '冻结', payee: { name: 'Minh Khôi', account: '0123 9988 7766', bank: 'Vietcombank' } }
  ];

  const SALES = [
    { id: 's1', name: 'MHOA', storeId: '101' }, { id: 's2', name: 'MBAO', storeId: '223' },
    { id: 's3', name: 'NTRUONG', storeId: '264' }, { id: 's4', name: 'QMinh', storeId: '114' },
    { id: 's5', name: 'MHAI', storeId: '141' }, { id: 's6', name: 'MCOUNG', storeId: '101' },
    { id: 's7', name: 'VPHOUNG', storeId: '101' }, { id: 's8', name: 'L.NHI', storeId: '130' },
    { id: 's9', name: 'MHIEN', storeId: '185' }, { id: 's10', name: 'DQUYET', storeId: '119' },
    { id: 's11', name: 'Trần Sơn', storeId: '116' }
  ];

  const DOC_TYPES = [
    { key: 'id_front', label: '身份证正面', required: true },
    { key: 'id_back', label: '身份证反面', required: true },
    { key: 'selfie', label: '手持身份证照', required: true },
    { key: 'work_proof', label: '工作证明', required: true },
    { key: 'bank_statement', label: '银行流水', required: true },
    { key: 'staff_customer_photo', label: '员工与客户合影', required: true },
    { key: 'phone_verify', label: '手机号实名满半年', required: true },
    { key: 'imei_photo', label: '手机串码实拍图', required: true },
    { key: 'address_photo', label: '常用住址拍照', required: true, multiple: true },
    { key: 'emergency_contact_photo', label: '紧急联系人通讯录', required: false },
    { key: 'other', label: '其他资料', required: false }
  ];

  const ORDER_STATUS = {
    draft: { label: '草稿', tone: 'gray' },
    pending_first: { label: '待初审', tone: 'amber' },
    rejected_first: { label: '初审驳回', tone: 'red' },
    pending_customer_sign: { label: '待客户签约', tone: 'purple' },
    pending_final: { label: '待终审', tone: 'blue' },
    rejected_final: { label: '终审驳回', tone: 'red' },
    approved_final: { label: '终审通过 · 待送财务', tone: 'purple' },
    pending_finance: { label: '待财务审核', tone: 'amber' },
    pending_payout: { label: '待放款', tone: 'blue' },
    repaying: { label: '还款中', tone: 'green' },
    overdue: { label: '逾期', tone: 'red' },
    breach: { label: '坏账', tone: 'red' },
    closed: { label: '已结清', tone: 'gray' },
    cancelled: { label: '已取消', tone: 'gray' }
  };

  const BILL_STATUS = {
    Pending: { label: '待还', tone: 'gray' },
    Paid: { label: '已还', tone: 'green' },
    Deferred: { label: '已延期', tone: 'amber' },
    Breach: { label: '逾期', tone: 'red' },
    Settled: { label: '已结清', tone: 'gray' }
  };

  function addMonths(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = new Date(y, m - 1 + n, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(d, lastDay);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function makeBills(plan, cfg) {
    cfg = cfg || {};
    const bills = [];
    const principal = plan.price - (plan.downPayment || 0);
    let allocated = 0;
    for (let i = 0; i < plan.periods; i++) {
      const isLast = i === plan.periods - 1;
      const amount = isLast ? principal - allocated : plan.perPeriod;
      allocated += amount;
      const due = addMonths(plan.firstDueDate, i);
      let status = 'Pending', paidAt = '', channel = '', txn = '', note = '';
      if (cfg.paid && i < cfg.paid) {
        status = 'Paid'; paidAt = due;
        channel = i % 3 === 0 ? '线上QR' : '其他转账';
        txn = 'TXN' + (2600000 + i * 37 + Math.floor(Math.random() * 90));
      }
      if (cfg.deferred && cfg.deferred.indexOf(i) > -1) { status = 'Deferred'; note = '已延期 8 天'; }
      if (cfg.breach && cfg.breach.indexOf(i) > -1) { status = 'Breach'; note = cfg.breachNote || '超期未还'; }
      if (cfg.settled && i >= (cfg.paid || 0)) { status = 'Settled'; note = '提前结清'; }
      bills.push({
        id: 'B' + (1000 + bills.length) + '-' + Math.floor(Math.random() * 900 + 100),
        period: i + 1, periods: plan.periods, dueDate: due, amount,
        paidAmount: (status === 'Paid' || status === 'Settled') ? amount : 0,
        paidAt: status === 'Paid' ? paidAt : (status === 'Settled' ? due : ''),
        status, channel: status === 'Paid' ? channel : (status === 'Settled' ? '线下现金' : ''),
        txnNo: status === 'Paid' ? txn : '', note: note
      });
    }
    return bills;
  }

  const store = id => STORES.find(s => s.id === id) || STORES[0];
  const sales = id => SALES.find(s => s.id === id) || SALES[0];

  function order(o) {
    const st = store(o.storeId), sl = sales(o.salesId);
    const plan = Object.assign({
      storeId: st.id, storeName: st.name, storeCity: st.city,
      salesId: sl.id, salesName: sl.name
    }, o.plan);
    return {
      id: o.id, no: o.no, status: o.status, submittedAt: o.submittedAt,
      source: o.source || '业务员录单',
      customer: o.customer,
      docs: o.docs,
      device: o.device,
      plan: plan,
      esign: o.esign || { status: '未发起', contractNo: '', attempt: 0, uploadedAt: '', smsSentAt: '', signedAt: '', failReason: '' },
      contract: o.contract || { type: '电子签约', status: '未签署', no: '', signedAt: '' },
      mdm: o.mdm || { serial: '', bound: false, boundAt: '', boundBy: '' },
      payee: o.payee || Object.assign({ qr: '' }, st.payee),
      finance: o.finance || { status: '未提交', by: '', at: '', note: '' },
      payout: o.payout || { status: '待放款', at: '', ref: '' },
      urgent: !!o.urgent,
      review: o.review || { first: null, final: null },
      bills: makeBills(plan, o.billCfg || {}),
      notes: o.notes || [],
      deviceLock: o.deviceLock || '未锁定',
      rejectReason: o.rejectReason || '',
      edits: o.edits || []
    };
  }

  const fullDocs = {
    id_front: { name: 'CCCD_mat_truoc.jpg', at: '2026-11-14 09:20' },
    id_back: { name: 'CCCD_mat_sau.jpg', at: '2026-11-14 09:21' },
    selfie: { name: 'Selfie_CCCD.jpg', at: '2026-11-14 09:22' },
    work_proof: { name: 'Giay_xac_nhan_cong_tac.pdf', at: '2026-11-14 09:24' },
    bank_statement: { name: 'Sao_ke_TPBank_3thang.pdf', at: '2026-11-14 09:26' },
    staff_customer_photo: { name: 'Nhan_vien_khach_hang.jpg', at: '2026-11-14 09:27' },
    phone_verify: { name: 'Xac_thuc_sdt_6thang.jpg', at: '2026-11-14 09:28' },
    imei_photo: { name: 'IMEI_thuc_te.jpg', at: '2026-11-14 09:29' },
    address_photo: { name: 'Dia_chi_thuong_tru_1.jpg, Dia_chi_2.jpg', at: '2026-11-14 09:30' },
    emergency_contact_photo: { name: 'Danh_ba_lien_he_khan_cap.jpg', at: '2026-11-14 09:31' }
  };

  const signed = (no, at) => ({ type: '电子签约', status: '已签署', no, signedAt: at });
  const bound = (serial, at) => ({ serial, bound: true, boundAt: at, boundBy: '林初审' });

  const list = [
    order({
      id: 'o1', no: 'N20261114001234501', status: 'pending_first', submittedAt: '2026-11-14 09:32',
      customer: { name: 'Nguyễn Tiến Nam', idNo: '031088001234', phone: '0961920398', address: 'Thành phố Hà Nội, Quận Thanh Xuân, Phường Nhân Chính', emergencyName: 'Nguyễn Thị Lan', emergencyRelation: 'Bố mẹ', emergencyPhone: '0974151359' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 12', capacity: '128G', color: 'Đen', imei: '35 160128 628641 4', score: '7/7' },
      plan: { price: 4779999, downPayment: 0, periods: 3, perPeriod: 1593333, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '141', salesId: 's5'
    }),
    order({
      id: 'o2', no: 'N20261114001234502', status: 'pending_first', submittedAt: '2026-11-14 10:15',
      customer: { name: 'Cao Chí Vỹ', idNo: '039797477102', phone: '0397974771', address: 'Thành phố Hồ Chí Minh, Quận Tân Bình, Phường 12', emergencyName: 'Cao Thị Mai', emergencyRelation: 'Bố mẹ', emergencyPhone: '0333826957' },
      docs: { id_front: fullDocs.id_front, id_back: fullDocs.id_back, selfie: fullDocs.selfie, work_proof: fullDocs.work_proof, staff_customer_photo: fullDocs.staff_customer_photo, phone_verify: fullDocs.phone_verify, imei_photo: fullDocs.imei_photo, address_photo: fullDocs.address_photo },
      device: { model: 'iPhone 17 Pro', capacity: '256G', color: 'Cam Vũ Trụ', imei: '35 045577 437724 8', score: '7/7' },
      plan: { price: 17375004, downPayment: 0, periods: 6, perPeriod: 2895834, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '114', salesId: 's4'
    }),
    order({
      id: 'o3', no: 'N20261114001234503', status: 'pending_first', submittedAt: '2026-11-14 11:04',
      customer: { name: 'Phàng A Gư', idNo: '015207006098', phone: '0877796245', address: 'Tỉnh Lào Cai, Xã Phình Hồ, Thôn Pá Làng', emergencyName: 'Vàng Thị Cha', emergencyRelation: 'Bố mẹ', emergencyPhone: '0818733925' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 11 Pro', capacity: '64G', color: 'Xám', imei: '35 384110 221164 6', score: '6/7' },
      plan: { price: 3226500, downPayment: 0, periods: 3, perPeriod: 1075500, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '264', salesId: 's3',
      esign: { status: '签署失败', contractNo: 'ESIGN-20261114-0123-A', attempt: 1, uploadedAt: '2026-11-14 11:20', smsSentAt: '2026-11-14 11:22', signedAt: '', failReason: '客户人脸识别未通过（Liveness 0.62）' }
    }),
    order({
      id: 'o4', no: 'N20261113001100901', status: 'pending_final', submittedAt: '2026-11-13 15:20',
      customer: { name: 'Đặng Ngọc Tấn', idNo: '079090030197', phone: '0777362126', address: 'Thành phố Hồ Chí Minh, Phường Bến Thành, Quận 1', emergencyName: 'Nguyễn Hồng Vũ', emergencyRelation: 'Khác', emergencyPhone: '0389338737' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 14 Plus', capacity: '128G', color: 'Tím', imei: '35 680635 543981 1', score: '7/7' },
      plan: { price: 8520000, downPayment: 0, periods: 6, perPeriod: 1420000, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '116', salesId: 's11',
      esign: { status: '已签署', contractNo: 'ESIGN-20261113-0091', attempt: 1, uploadedAt: '2026-11-13 15:40', smsSentAt: '2026-11-13 15:42', signedAt: '2026-11-13 16:10', failReason: '' },
      contract: signed('ESIGN-20261113-0091', '2026-11-13 16:10'),
      mdm: bound('MDM-CWPVV5Q73L', '2026-11-13 16:20'),
      review: { first: { by: '林初审', at: '2026-11-13 16:25', result: 'pass', note: '资料齐全，签约完成，MDM 已绑定' }, final: null }
    }),
    order({
      id: 'o5', no: 'N20261113001100902', status: 'pending_final', submittedAt: '2026-11-13 17:41',
      customer: { name: 'Nguyễn Thị Thảo Vân', idNo: '086591036901', phone: '0865910369', address: 'Tỉnh Đồng Nai, Xã Long Thành, Ấp 3', emergencyName: 'Trần Văn Hùng', emergencyRelation: 'Anh chị em', emergencyPhone: '0358018512' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 14 Pro Max', capacity: '256G', color: 'Vàng', imei: '35 112829 031264 8', score: '7/7' },
      plan: { price: 12904998, downPayment: 0, periods: 9, perPeriod: 1433889, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '101', salesId: 's2',
      esign: { status: '已签署', contractNo: 'ESIGN-20261113-0092', attempt: 2, uploadedAt: '2026-11-13 18:00', smsSentAt: '2026-11-13 18:02', signedAt: '2026-11-13 18:30', failReason: '' },
      contract: signed('ESIGN-20261113-0092', '2026-11-13 18:30'),
      mdm: bound('MDM-LFQN9K17RR', '2026-11-13 18:40'),
      review: { first: { by: '林初审', at: '2026-11-13 18:45', result: 'pass', note: '首次签约失败，换号后重签成功' }, final: null }
    }),
    order({
      id: 'o6', no: 'N20261112001000101', status: 'rejected_first', submittedAt: '2026-11-12 14:08',
      customer: { name: 'Lê Ngọc Anh', idNo: '093620119501', phone: '0936201195', address: 'Thành phố Hà Nội, Quận Cầu Giấy, Phường Dịch Vọng', emergencyName: 'Lê Văn Nam', emergencyRelation: 'Bố mẹ', emergencyPhone: '0961217643' },
      docs: { id_front: fullDocs.id_front, id_back: fullDocs.id_back, selfie: fullDocs.selfie, work_proof: fullDocs.work_proof, phone_verify: fullDocs.phone_verify },
      device: { model: 'iPhone 15 Plus', capacity: '128G', color: 'Xanh Lá', imei: '35 220033 774411 9', score: '6/7' },
      plan: { price: 11120000, downPayment: 0, periods: 6, perPeriod: 1853333, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '101', salesId: 's6',
      rejectReason: '工作证明单位与填表单位不一致；银行流水、串码实拍图缺失，请补齐后重新提交。',
      review: { first: { by: '林初审', at: '2026-11-12 15:30', result: 'reject', note: '工作证明单位与填表单位不一致；缺少银行流水与串码实拍图' }, final: null }
    }),
    order({
      id: 'o7', no: 'N20261110000900901', status: 'pending_customer_sign', submittedAt: '2026-11-10 10:26',
      customer: { name: 'Đặng Văn Thái', idNo: '040200014922', phone: '0382229830', address: 'Tỉnh Nghệ An, Xã Minh Châu, Xóm 4', emergencyName: 'Đặng Thị Hồng', emergencyRelation: 'Anh chị em', emergencyPhone: '0975503719' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 16', capacity: '128G', color: 'Xanh Mòng Két', imei: '35 884411 223310 5', score: '7/7' },
      plan: { price: 8365002, downPayment: 0, periods: 3, perPeriod: 2788334, dueDay: '01', firstDueDate: '2026-12-01' },
      storeId: '185', salesId: 's9',
      esign: { status: '待客户签约', contractNo: 'ESIGN-20261110-0077', attempt: 1, uploadedAt: '2026-11-10 11:10', smsSentAt: '2026-11-10 11:12', signedAt: '', failReason: '' },
      mdm: bound('MDM-K9QW2MXP0D', '2026-11-10 11:20')
    }),
    order({
      id: 'o8', no: 'N20261008000800801', status: 'repaying', submittedAt: '2026-10-08 09:12',
      customer: { name: 'Nguyễn Tiến Nam', idNo: '031088001234', phone: '0961920398', address: 'Thành phố Hà Nội, Quận Thanh Xuân, Phường Nhân Chính', emergencyName: 'Nguyễn Thị Lan', emergencyRelation: 'Bố mẹ', emergencyPhone: '0974151359' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 14 Pro Max', capacity: '128G', color: 'Đen', imei: '35 667788 990011 2', score: '7/7' },
      plan: { price: 7800000, downPayment: 0, periods: 6, perPeriod: 1300000, dueDay: '08', firstDueDate: '2026-11-08' },
      storeId: '101', salesId: 's1',
      esign: { status: '已签署', contractNo: 'ESIGN-20261008-0034', attempt: 1, uploadedAt: '2026-10-08 09:30', smsSentAt: '2026-10-08 09:32', signedAt: '2026-10-08 10:02', failReason: '' },
      contract: signed('ESIGN-20261008-0034', '2026-10-08 10:02'),
      mdm: bound('MDM-D22F00RYQN', '2026-10-08 10:10'),
      review: { first: { by: '林初审', at: '2026-10-08 10:15', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-10-08 10:30', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-10-08 10:50', note: '' },
      payout: { status: '已放款', at: '2026-10-08 11:30', ref: 'VCB-20261008-0034' },
      billCfg: { paid: 1 }
    }),
    order({
      id: 'o9', no: 'N20260910000700701', status: 'closed', submittedAt: '2026-09-10 13:44',
      customer: { name: 'Vũ Mạnh Đông', idNo: '098129722301', phone: '0981297223', address: 'Tỉnh Nam Định, Xã Hải Anh, Thôn Đông', emergencyName: 'Vũ Thị Hoa', emergencyRelation: 'Bố mẹ', emergencyPhone: '0967895612' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 12', capacity: '64G', color: 'Trắng', imei: '35 111222 333444 5', score: '7/7' },
      plan: { price: 4182501, downPayment: 0, periods: 3, perPeriod: 1394167, dueDay: '09', firstDueDate: '2026-10-09' },
      storeId: '101', salesId: 's7',
      esign: { status: '已签署', contractNo: 'ESIGN-20260910-0012', attempt: 1, uploadedAt: '2026-09-10 14:00', smsSentAt: '2026-09-10 14:02', signedAt: '2026-09-10 14:20', failReason: '' },
      contract: { type: '纸质合同', status: '已签署', no: 'PAPER-20260910-0012', signedAt: '2026-09-10 14:00' },
      mdm: bound('MDM-H08D109PN6Y2', '2026-09-10 14:30'),
      review: { first: { by: '林初审', at: '2026-09-10 14:05', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-09-10 14:20', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-09-10 15:00', note: '' },
      payout: { status: '已放款', at: '2026-09-10 15:30', ref: 'VCB-20260910-0012' },
      billCfg: { paid: 1, settled: true }
    }),
    order({
      id: 'o10', no: 'N20261002000600601', status: 'overdue', submittedAt: '2026-10-02 16:30',
      customer: { name: 'Cao Chí Vỹ', idNo: '039797477102', phone: '0397974771', address: 'Thành phố Hồ Chí Minh, Quận Tân Bình, Phường 12', emergencyName: 'Cao Thị Mai', emergencyRelation: 'Bố mẹ', emergencyPhone: '0333826957' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 16 Pro Max', capacity: '256G', color: 'Titan Tự Nhiên', imei: '35 998877 665544 3', score: '7/7' },
      plan: { price: 12840000, downPayment: 0, periods: 9, perPeriod: 1426667, dueDay: '02', firstDueDate: '2026-11-02' },
      storeId: '130', salesId: 's8',
      esign: { status: '已签署', contractNo: 'ESIGN-20261002-0058', attempt: 1, uploadedAt: '2026-10-02 16:45', smsSentAt: '2026-10-02 16:47', signedAt: '2026-10-02 17:10', failReason: '' },
      contract: signed('ESIGN-20261002-0058', '2026-10-02 17:10'),
      mdm: bound('MDM-J3KQ8M2P9X', '2026-10-02 17:20'),
      review: { first: { by: '林初审', at: '2026-10-02 16:50', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-10-02 17:00', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-10-02 18:00', note: '' },
      payout: { status: '已放款', at: '2026-10-03 09:00', ref: 'TCB-20261003-0058' },
      billCfg: { breach: [0], breachNote: '超期 12 天，电话可接通' },
      notes: [{ by: '催收·阿玲', at: '2026-11-12 10:20', text: '已电话联系，客户承诺 11-15 前还款。' }]
    }),
    order({
      id: 'o11', no: 'N20260902000500501', status: 'breach', submittedAt: '2026-09-02 11:20',
      customer: { name: 'Phan Chí Thanh', idNo: '094202007922', phone: '0942020079', address: 'Tỉnh Bình Dương, Thị xã Thuận An, Phường Lái Thiêu', emergencyName: 'Phan Văn Tú', emergencyRelation: 'Bố mẹ', emergencyPhone: '0888179170' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 15 Plus', capacity: '128G', color: 'Hồng', imei: '35 556677 889900 1', score: '7/7' },
      plan: { price: 13095000, downPayment: 0, periods: 9, perPeriod: 1455000, dueDay: '02', firstDueDate: '2026-10-02' },
      storeId: '101', salesId: 's6',
      esign: { status: '已签署', contractNo: 'ESIGN-20260902-0021', attempt: 1, uploadedAt: '2026-09-02 11:40', smsSentAt: '2026-09-02 11:42', signedAt: '2026-09-02 12:00', failReason: '' },
      contract: signed('ESIGN-20260902-0021', '2026-09-02 12:00'),
      mdm: bound('MDM-G4TQ1L8M2K', '2026-09-02 12:10'),
      review: { first: { by: '林初审', at: '2026-09-02 11:40', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-09-02 11:55', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-09-02 13:00', note: '' },
      payout: { status: '已放款', at: '2026-09-02 14:00', ref: 'VCB-20260902-0021' },
      billCfg: { breach: [0, 1], breachNote: '连续 2 期未还，号码被锁定' },
      deviceLock: '已锁定（MDM）',
      notes: [
        { by: '催收·小玉', at: '2026-10-20 09:10', text: '已锁机，号码被锁定，电话打不通。' },
        { by: '催收·小玉', at: '2026-11-05 15:30', text: '联系紧急联系人，号主称未购买手机，转坏账处理。' }
      ]
    }),
    order({
      id: 'o12', no: 'N20261015000400401', status: 'repaying', submittedAt: '2026-10-15 09:05',
      customer: { name: 'Lại Bảo Long', idNo: '032572299701', phone: '0325722997', address: 'Tỉnh Hà Nam, Xã Cân Cước, Thôn 2', emergencyName: 'Lại Thị Hồng', emergencyRelation: 'Bố mẹ', emergencyPhone: '' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 13 Pro Max', capacity: '128G', color: 'Xanh Xa-phia', imei: '35 334455 667788 9', score: '7/7' },
      plan: { price: 8060000, downPayment: 0, periods: 4, perPeriod: 2015000, dueDay: '01', firstDueDate: '2026-11-01' },
      storeId: '119', salesId: 's10',
      esign: { status: '已签署', contractNo: 'ESIGN-20261015-0033', attempt: 1, uploadedAt: '2026-10-15 09:20', smsSentAt: '2026-10-15 09:22', signedAt: '2026-10-15 10:00', failReason: '' },
      contract: { type: '纸质合同', status: '已签署', no: 'PAPER-20261015-0033', signedAt: '2026-10-15 10:00' },
      mdm: bound('MDM-F7WD2Q9K1L', '2026-10-15 10:10'),
      review: { first: { by: '林初审', at: '2026-10-15 09:30', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-10-15 09:45', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-10-15 11:00', note: '' },
      payout: { status: '已放款', at: '2026-10-15 11:30', ref: 'ACB-20261015-0033' },
      billCfg: { deferred: [0] },
      notes: [{ by: '催收·阿玲', at: '2026-11-02 11:00', text: '客户申请延期至 11-09，已审批。' }]
    }),
    order({
      id: 'o13', no: 'N20261012000300301', status: 'repaying', submittedAt: '2026-10-12 13:10',
      customer: { name: 'Nghiêm Minh Tú', idNo: '037406866701', phone: '0374068667', address: 'Thành phố Hà Nội, Quận Hà Đông, Phường La Khê', emergencyName: 'Nghiêm Văn Bình', emergencyRelation: 'Bố mẹ', emergencyPhone: '0964943239' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 17 Pro Max', capacity: '256G', color: 'Xanh Đậm', imei: '35 770088 221199 4', score: '7/7' },
      plan: { price: 22525000, downPayment: 0, periods: 5, perPeriod: 4505000, dueDay: '12', firstDueDate: '2026-11-12' },
      storeId: '223', salesId: 's2',
      esign: { status: '已签署', contractNo: 'ESIGN-20261012-0066', attempt: 1, uploadedAt: '2026-10-12 13:30', smsSentAt: '2026-10-12 13:32', signedAt: '2026-10-12 14:05', failReason: '' },
      contract: signed('ESIGN-20261012-0066', '2026-10-12 14:05'),
      mdm: bound('MDM-K1LM3NQ8P2', '2026-10-12 14:15'),
      review: { first: { by: '林初审', at: '2026-10-12 13:40', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-10-12 13:55', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-10-12 15:00', note: '' },
      payout: { status: '已放款', at: '2026-10-12 15:30', ref: 'VCB-20261012-0066' },
      billCfg: { paid: 1 }
    }),
    order({
      id: 'o14', no: 'N20261101000200201', status: 'approved_final', submittedAt: '2026-11-11 16:02',
      customer: { name: 'Phạm Quốc Việt', idNo: '091234579301', phone: '0912345793', address: 'Tỉnh Thái Bình, Xã Vũ Quý, Thôn Trung', emergencyName: 'Phạm Thị Nga', emergencyRelation: 'Bố mẹ', emergencyPhone: '0902145923' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 11 Pro Max', capacity: '256G', color: 'Vàng', imei: '35 223344 556677 8', score: '6/7' },
      plan: { price: 5560002, downPayment: 0, periods: 6, perPeriod: 926667, dueDay: '01', firstDueDate: '2026-12-01' },
      storeId: '101', salesId: 's4',
      esign: { status: '已签署', contractNo: 'ESIGN-20261111-0102', attempt: 1, uploadedAt: '2026-11-11 16:20', smsSentAt: '2026-11-11 16:22', signedAt: '2026-11-11 17:00', failReason: '' },
      contract: signed('ESIGN-20261111-0102', '2026-11-11 17:00'),
      mdm: bound('MDM-H5JK9L2M4N', '2026-11-11 17:10'),
      review: { first: { by: '林初审', at: '2026-11-11 17:20', result: 'pass', note: '客户年龄偏大，建议缩短期数' }, final: { by: '周终审', at: '2026-11-12 09:10', result: 'pass', note: '同意 6 期方案' } }
    }),
    order({
      id: 'o15', no: 'N20261113000100101', status: 'pending_finance', submittedAt: '2026-11-13 09:12',
      customer: { name: 'Hoàng Văn Dũng', idNo: '026185003412', phone: '0912887766', address: 'Tỉnh Bắc Ninh, Xã Võ Cường, Phường Đại Phúc', emergencyName: 'Hoàng Thị Yến', emergencyRelation: 'Bố mẹ', emergencyPhone: '0977334455' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 15 Pro Max', capacity: '256G', color: 'Titan Xanh', imei: '35 441122 334455 6', score: '7/7' },
      plan: { price: 19250000, downPayment: 0, periods: 9, perPeriod: 2138889, dueDay: '08', firstDueDate: '2026-12-08' },
      storeId: '141', salesId: 's5', urgent: true,
      esign: { status: '已签署', contractNo: 'ESIGN-20261113-0110', attempt: 1, uploadedAt: '2026-11-13 09:30', smsSentAt: '2026-11-13 09:32', signedAt: '2026-11-13 10:05', failReason: '' },
      contract: signed('ESIGN-20261113-0110', '2026-11-13 10:05'),
      mdm: bound('MDM-J8LM2NQ5R1', '2026-11-13 10:15'),
      review: { first: { by: '林初审', at: '2026-11-13 10:20', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-11-13 11:00', result: 'pass', note: '' } },
      finance: { status: '待审核', by: '', at: '', note: '' }
    }),
    order({
      id: 'o16', no: 'N20261112000000101', status: 'pending_payout', submittedAt: '2026-11-12 10:40',
      customer: { name: 'Bùi Thị Kim Ngân', idNo: '079196004422', phone: '0933112233', address: 'Thành phố Hồ Chí Minh, Quận 7, Phường Tân Phong', emergencyName: 'Bùi Văn Lực', emergencyRelation: 'Bố mẹ', emergencyPhone: '0908223344' },
      docs: Object.assign({}, fullDocs),
      device: { model: 'iPhone 16 Pro', capacity: '128G', color: 'Titan Trắng', imei: '35 667700 112233 4', score: '7/7' },
      plan: { price: 15480000, downPayment: 0, periods: 6, perPeriod: 2580000, dueDay: '12', firstDueDate: '2026-12-12' },
      storeId: '116', salesId: 's11', urgent: true,
      esign: { status: '已签署', contractNo: 'ESIGN-20261112-0108', attempt: 1, uploadedAt: '2026-11-12 11:00', smsSentAt: '2026-11-12 11:02', signedAt: '2026-11-12 11:40', failReason: '' },
      contract: signed('ESIGN-20261112-0108', '2026-11-12 11:40'),
      mdm: bound('MDM-M2NQ8L5K7P', '2026-11-12 11:50'),
      review: { first: { by: '林初审', at: '2026-11-12 11:55', result: 'pass', note: '' }, final: { by: '周终审', at: '2026-11-12 14:00', result: 'pass', note: '' } },
      finance: { status: '已通过', by: '王财务', at: '2026-11-12 15:20', note: '已汇总老板确认' },
      payout: { status: '待放款', at: '', ref: '' }
    })
  ];

  window.MOCK = { STORES, SALES, DOC_TYPES, ORDER_STATUS, BILL_STATUS, ORDERS: list, makeBills, addMonths };
})();
