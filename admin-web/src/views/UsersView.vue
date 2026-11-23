<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../api'
import AppPagination from '../components/AppPagination.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusPill from '../components/StatusPill.vue'
import { useAuthStore } from '../stores/auth'
import auth from '../stores/auth'

const list = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const loading = ref(false)
const teams = ref([])
const stores = ref([])
const showModal = ref(false)
const editing = ref(null)
const roleList = ['admin', 'sales', 'first', 'final', 'finance', 'manager', 'store', 'collector', 'aftercare']

async function load() {
  loading.value = true
  const r = await api.listUsers({ page: page.value, size: size.value })
  list.value = r.items || []
  total.value = r.total || 0
  loading.value = false
}

onMounted(async () => {
  await Promise.all([
    load(),
    api.listTeams().then(r => teams.value = r || []),
    api.listStores().then(r => stores.value = r.items || [])
  ])
})

function openCreate() {
  editing.value = { username: '', name: '', role: 'sales', teamId: '', storeId: '', password: 'Default123!', active: true }
  showModal.value = true
}
function openEdit(u) {
  editing.value = { ...u, password: '' }
  showModal.value = true
}

async function submit() {
  const e = editing.value
  if (e.id) {
    await api.updateUser(e.id, { name: e.name, role: e.role, teamId: e.teamId || null, storeId: e.storeId || null, active: e.active })
  } else {
    await api.createUser(e)
  }
  showModal.value = false
  await load()
}

async function resetPwd(u) {
  const newPwd = prompt(`重置 ${u.name} 的密码：`, 'Reset123!')
  if (!newPwd) return
  const r = await api.resetUserPassword(u.id, { password: newPwd })
  alert(`密码已重置为: ${r.message ? r.password : r}`)
}

const teamName = id => teams.value.find(t => t.id === id)?.name || '-'
const storeName = id => stores.value.find(s => s.id === id)?.name || '-'
</script>

<template>
  <AppShell title="员工管理" subtitle="独立账号、角色权限、团队归属">
    <div class="page-actions">
      <div class="spacer"></div>
      <button v-if="auth.can('manageStores')" class="btn primary" @click="openCreate">+ 新建员工</button>
    </div>

    <table class="table" style="margin-top:16px">
      <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>团队</th><th>门店</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="u in list" :key="u.id">
          <td><b>{{ u.username }}</b></td>
          <td>{{ u.name }}</td>
          <td><StatusPill :status="u.role" :label="u.role" /></td>
          <td>{{ teamName(u.teamId) }}</td>
          <td>{{ storeName(u.storeId) }}</td>
          <td><StatusPill :status="u.active ? 'active' : 'inactive'" :label="u.active ? '启用' : '停用'" /></td>
          <td>{{ new Date(u.createdAt).toLocaleString() }}</td>
          <td class="actions">
            <button class="btn sm ghost" @click="openEdit(u)">编辑</button>
            <button class="btn sm ghost" @click="resetPwd(u)">重置密码</button>
          </td>
        </tr>
        <tr v-if="!list.length && !loading"><td colspan="8" class="empty">暂无员工</td></tr>
      </tbody>
    </table>
    <AppPagination v-if="total > size" v-model:page="page" :total="total" :size="size" @change="load" />

    <BaseModal v-if="showModal" title="员工信息" @close="showModal = false">
      <form v-if="editing" class="form-grid">
        <label>账号
          <input v-model="editing.username" :disabled="!!editing.id" :placeholder="editing.id ? '' : '登录账号'" />
        </label>
        <label>姓名 <input v-model="editing.name" /></label>
        <label>角色
          <select v-model="editing.role">
            <option v-for="r in roleList" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label>团队
          <select v-model="editing.teamId"><option value="">不归属</option><option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option></select>
        </label>
        <label>门店
          <select v-model="editing.storeId"><option value="">不归属</option><option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option></select>
        </label>
        <label v-if="!editing.id">初始密码 <input v-model="editing.password" /></label>
        <label v-if="editing.id" class="checkbox"><input type="checkbox" v-model="editing.active" />启用</label>
      </form>
      <div class="modal-actions">
        <button class="btn" @click="showModal = false">取消</button>
        <button class="btn primary" @click="submit">保存</button>
      </div>
    </BaseModal>
  </AppShell>
</template>
