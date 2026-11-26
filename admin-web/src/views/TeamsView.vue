<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import BaseModal from '../components/BaseModal.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const teams = ref([])
const users = ref([])
const editing = ref(null)
const showModal = ref(false)

const CITY_LIST = [
  'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
  'Biên Hòa', 'Thủ Đức', 'Huyện Nhà Bè', 'Quận 1', 'Quận 3', 'Quận 5', 'Quận 10'
]

async function load() {
  teams.value = await api.listTeams()
  const u = await api.listUsers({ page: 1, size: 200 })
  users.value = u.items || []
}
onMounted(load)

function openCreate() { editing.value = { name: '', managerId: '', city: CITY_LIST[0], active: true, remark: '' }; showModal.value = true }
function openEdit(t) { editing.value = { ...t, managerId: t.managerId || '' }; showModal.value = true }

async function submit() {
  const e = editing.value
  const payload = { ...e, manager: e.managerId ? users.value.find(u => u.id === e.managerId)?.name : '' }
  if (e.id) await api.updateTeam(e.id, payload)
  else await api.createTeam(payload)
  showModal.value = false
  await load()
}
</script>

<template>
  <AppShell title="团队管理" subtitle="业务员团队归属与划分">
    <div class="page-actions"><div class="spacer"></div>
      <button v-if="auth.role === 'admin'" class="btn primary" @click="openCreate">+ 新建团队</button>
    </div>
    <div class="grid cols-3" style="margin-top:16px">
      <div v-for="t in teams" :key="t.id" class="card">
        <div class="card-title">{{ t.name }} <span class="pill" :class="t.active?'ok':'warn'">{{ t.active?'启用':'停用' }}</span></div>
        <div class="card-body">
          <div><b>负责人:</b> {{ t.manager || '-' }}</div>
          <div><b>城市:</b> {{ t.city || '-' }}</div>
          <div><b>人数:</b> {{ t.userCount || 0 }} 人</div>
        </div>
        <div class="card-actions"><button class="btn sm ghost" v-if="auth.role === 'admin'" @click="openEdit(t)">编辑</button></div>
      </div>
      <div v-if="!teams.length" class="empty" style="grid-column:1/-1;padding:40px;text-align:center">暂无团队</div>
    </div>
    <BaseModal v-if="showModal" title="团队信息" @close="showModal = false">
      <form v-if="editing" class="form-grid">
        <label>团队名称 <input v-model="editing.name" /></label>
        <label>负责人
          <select v-model="editing.managerId"><option value="">不指定</option>
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}（{{ u.username }}）</option>
          </select>
        </label>
        <label>所在城市
          <select v-model="editing.city"><option value="">请选择</option>
            <option v-for="c in CITY_LIST" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="checkbox"><input type="checkbox" v-model="editing.active" />启用</label>
        <label class="full">备注 <textarea v-model="editing.remark" rows="2"></textarea></label>
      </form>
      <div class="modal-actions">
        <button class="btn" @click="showModal = false">取消</button>
        <button class="btn primary" @click="submit">保存</button>
      </div>
    </BaseModal>
  </AppShell>
</template>
