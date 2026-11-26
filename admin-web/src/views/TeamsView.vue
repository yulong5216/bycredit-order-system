<script setup>
import { ref, computed, onMounted } from 'vue'
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

function openCreate() {
  editing.value = { name: '', managerId: '', city: CITY_LIST[0], active: true, remark: '' }
  showModal.value = true
}
function openEdit(t) {
  editing.value = { ...t, managerId: t.managerId || '' }
  showModal.value = true
}

async function submit() {
  const e = editing.value
  const payload = { ...e, manager: e.managerId ? users.value.find(u => u.id === e.managerId)?.name : '' }
  if (e.id) await api.updateTeam(e.id, payload)
  else await api.createTeam(payload)
  showModal.value = false
  await load()
}

function toggleActive(t) {
  api.updateTeam(t.id, { ...t, active: !t.active }).then(() => load())
}

const teamCards = computed(() => teams.value.map(t => ({
  ...t,
  managerName: t.manager || '未指定',
  memberCount: t.userCount || users.value.filter(u => u.teamId === t.id).length
})))
</script>

<template>
  <AppShell title="团队管理" subtitle="业务员团队归属与划分">
    <div class="page-head">
      <div></div>
      <button v-if="auth.role === 'admin'" class="btn primary" @click="openCreate">+ 新建团队</button>
    </div>

    <div v-if="teamCards.length" class="teams-grid">
      <div v-for="t in teamCards" :key="t.id" class="team-card card">
        <div class="tc-head">
          <div>
            <div class="tc-name">{{ t.name }}</div>
            <div class="tc-meta">{{ t.city || '-' }}</div>
          </div>
          <span class="pill" :class="t.active ? 'green' : 'gray'">{{ t.active ? '启用' : '停用' }}</span>
        </div>
        <div class="tc-body">
          <div class="tc-row"><span>负责人</span><b>{{ t.managerName }}</b></div>
          <div class="tc-row"><span>成员</span><b>{{ t.memberCount }} 人</b></div>
        </div>
        <div class="tc-foot">
          <button class="btn sm ghost" v-if="auth.role === 'admin'" @click="openEdit(t)">编辑</button>
          <button class="btn sm ghost" v-if="auth.role === 'admin'" @click="toggleActive(t)">{{ t.active ? '停用' : '启用' }}</button>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <div class="empty-mark">👥</div>
      暂无团队，点击右上角新建
    </div>

    <BaseModal v-if="showModal" :title="editing?.id ? '编辑团队' : '新建团队'" @close="showModal = false">
      <form v-if="editing" @submit.prevent="submit">
        <div class="form-grid">
          <div class="field">
            <label class="label">团队名称 <span class="req">*</span></label>
            <input v-model="editing.name" class="input" placeholder="如：HN 销售一队" required />
          </div>
          <div class="field">
            <label class="label">负责人</label>
            <select v-model="editing.managerId" class="select">
              <option value="">不指定</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}（{{ u.username }}）</option>
            </select>
          </div>
          <div class="field">
            <label class="label">所在城市 <span class="req">*</span></label>
            <select v-model="editing.city" class="select" required>
              <option value="">请选择</option>
              <option v-for="c in CITY_LIST" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="field">
            <label class="label">状态</label>
            <label class="check-inline">
              <input type="checkbox" v-model="editing.active" /> 启用
            </label>
          </div>
          <div class="field full">
            <label class="label">备注</label>
            <textarea v-model="editing.remark" class="textarea" rows="2" placeholder="选填"></textarea>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" type="button" @click="showModal = false">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </div>
      </form>
    </BaseModal>
  </AppShell>
</template>

<style scoped>
.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-top: 16px }
.team-card { padding: 0; overflow: hidden; display: flex; flex-direction: column }
.tc-head { padding: 16px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; background: linear-gradient(135deg, #F0F5FF, #E8EFFE) }
.tc-name { font-size: 15px; font-weight: 600 }
.tc-meta { font-size: 11.5px; color: var(--muted); margin-top: 2px }
.tc-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1 }
.tc-row { display: flex; justify-content: space-between; font-size: 13px }
.tc-row span { color: var(--muted) }
.tc-foot { padding: 12px 18px; border-top: 1px solid var(--line); display: flex; gap: 8px }
.check-inline { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink); font-weight: normal; cursor: pointer }
.check-inline input { accent-color: var(--primary); width: 14px; height: 14px }
</style>
