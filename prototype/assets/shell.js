/* BY Credit · 统一后台外壳（侧边栏 + 顶栏），所有页面共用，避免导航漂移 */
(function () {
  const NAV = [
    { group: '业务办理' },
    { key: 'orders', label: '订单池', href: 'admin-orders.html', roles: ['admin', 'first', 'final'] },
    { key: 'first', label: '初审待办', href: 'admin-orders.html?stage=first', count: 'first', hot: true, roles: ['admin', 'first'] },
    { key: 'sign', label: '待客户签约', href: 'admin-orders.html?stage=sign', count: 'sign', roles: ['admin', 'first'] },
    { key: 'final', label: '终审待办', href: 'admin-orders.html?stage=final', count: 'final', hot: true, roles: ['admin', 'final'] },
    { key: 'finance', label: '财务审核', href: 'admin-finance.html', count: 'finance', roles: ['admin', 'final', 'finance'] },
    { key: 'payout', label: '待放款', href: 'admin-finance.html?tab=payout', count: 'payout', roles: ['admin', 'final', 'finance'] },
    { key: 'bills', label: '账单管理', href: 'admin-bills.html', count: 'overdue', hot: true, roles: ['admin', 'finance', 'aftercare', 'collector'] },
    { group: '资料与合同' },
    { key: 'contracts', label: '合同管理', href: 'admin-contracts.html', roles: ['admin', 'first', 'final', 'finance'] },
    { key: 'customers', label: '客户档案', href: 'admin-customers.html', roles: ['admin', 'first', 'final', 'aftercare', 'collector'] },
    { group: '运营与系统' },
    { key: 'stores', label: '店铺管理', href: 'admin-stores.html', roles: ['admin', 'manager', 'finance'] },
    { key: 'roles', label: '角色与账号', href: 'admin-roles.html', roles: ['admin'] },
    { key: 'settings', label: '系统对接', href: 'admin-settings.html', roles: ['admin'] }
  ];

  const ROLES = {
    admin: { name: '陈志远', label: '管理员', avatar: '陈' },
    sales: { name: 'MHOA', label: '业务员', avatar: 'M', storeId: '101' },
    manager: { name: '陈店长', label: '门店店长', avatar: '陈', storeId: '101' },
    first: { name: '林初审', label: '初审专员', avatar: '林' },
    final: { name: '周终审', label: '终审专员', avatar: '周' },
    finance: { name: '王财务', label: '财务', avatar: '王' },
    aftercare: { name: '黄贷后', label: '贷后管理', avatar: '黄' },
    collector: { name: '吴催收', label: '催收专员', avatar: '吴' }
  };

  // 动作权限唯一配置：后续新增操作时添加一项，矩阵与 Shell.can 自动生效。
  const PERMISSION_GROUPS = [
    { group: '录单', actions: [
      { name: '新建订单与录入资料', roles: ['sales'] },
      { name: '上传 / 补充客户资料', roles: ['sales', 'manager'] },
      { name: '查看订单日志', roles: ['sales', 'manager', 'first', 'final', 'finance', 'aftercare', 'collector'] },
      { name: '添加备注', roles: ['sales', 'manager', 'first', 'final', 'finance', 'aftercare', 'collector'] },
      { name: '修改客户资料', roles: ['sales', 'manager'] }
    ] },
    { group: '审核', actions: [
      { name: '核对客户、订单与放款资料', roles: ['first', 'final'] },
      { name: '初审通过 / 退回', roles: ['first'] },
      { name: '终审通过 / 退回', roles: ['final'] },
      { name: '批量送财务', roles: ['final'] }
    ] },
    { group: '签约与 MDM', actions: [
      { name: '登记 MobiFone 上传', roles: ['first'] },
      { name: '回填电子签约结果', roles: ['first'] },
      { name: '绑定 / 更换 MDM 监管锁', roles: ['first'] }
    ] },
    { group: '财务', actions: [
      { name: '审批放款 / 退回异常单', roles: ['finance'] },
      { name: '导出财务明细', roles: ['finance'] },
      { name: '标记放款 / 回填银行回单', roles: ['finance'] }
    ] },
    { group: '账单贷后', actions: [
      { name: '查看账单与还款流水', roles: ['sales', 'manager', 'finance', 'aftercare', 'collector'] },
      { name: '修改账单方案', roles: ['first'] },
      { name: '修改还款日', roles: ['first'] },
      { name: '代客登记还款', roles: ['finance', 'aftercare'] },
      { name: '延期', roles: ['aftercare'] },
      { name: '标记坏账', roles: ['finance', 'aftercare'] },
      { name: '登记催收记录 / 承诺还款', roles: ['aftercare', 'collector'] }
    ] },
    { group: '门店与系统', actions: [
      { name: '查看本店订单与业务员进度', roles: ['manager'] },
      { name: '维护本店资料', roles: ['manager'] },
      { name: '新增 / 停用门店', roles: [] },
      { name: '账号与角色管理', roles: [] },
      { name: '系统参数配置', roles: [] }
    ] }
  ];
  const ACTION_ROLES = {};
  PERMISSION_GROUPS.forEach(group => group.actions.forEach(action => {
    ACTION_ROLES[action.name] = action.roles;
  }));

  function currentRole() {
    try { return localStorage.getItem('bycredit_role') || 'admin'; } catch (e) { return 'admin'; }
  }

  const Shell = {
    roles: ROLES,
    nav: NAV,
    permissionGroups: PERMISSION_GROUPS,
    role() { return currentRole(); },
    roleInfo() { return ROLES[currentRole()] || ROLES.admin; },
    can(action) {
      const role = currentRole();
      return role === 'admin' || (ACTION_ROLES[action] || []).indexOf(role) > -1;
    },

    mount(opts) {
      opts = opts || {};
      const role = currentRole();
      const info = ROLES[role] || ROLES.admin;
      const side = document.getElementById('appSidebar');
      const top = document.getElementById('appTopbar');

      if (side) {
        const items = NAV.map(item => {
          if (item.group) return `<div class="nav-label">${item.group}</div>`;
          if (item.roles && item.roles.indexOf(role) === -1) return '';
          const cnt = item.count ? `<span class="nav-count" data-count="${item.count}">–</span>` : '';
          return `<a class="nav-item" data-nav="${item.key}" href="${item.href}">${item.label}${cnt}</a>`;
        }).join('');
        side.innerHTML = `
          <div class="brand">
            <div class="brand-mark">BY</div>
            <div><div class="brand-name">BY Credit</div><div class="brand-sub">分期订单管理</div></div>
          </div>
          <nav class="nav">${items}</nav>
          <div class="sidebar-foot">
            <div class="avatar">${info.avatar}</div>
            <div><div class="who">${info.name}</div><div class="role">${info.label}</div></div>
          </div>`;
      }

      if (top) {
        top.innerHTML = `
          <div class="crumb">${opts.crumb || ''}</div>
          <div class="row">
            <a class="btn sm ghost" href="mp-bill.html">客户端预览</a>
            ${role === 'admin' ? '<button class="btn sm ghost" onclick="U.resetDemo()">重置数据</button>' : ''}
            <a class="btn sm" href="index.html">退出登录</a>
          </div>`;
      }

      if (opts.nav) U.setNav(opts.nav);
      if (U.navCounts) U.navCounts();
    }
  };

  window.Shell = Shell;
})();
