import { reactive } from 'vue'

export const toastState = reactive({ show: false, message: '', type: 'ok' })
let timer

export function toast(message, type = 'ok') {
  clearTimeout(timer)
  toastState.message = String(message || (type === 'err' ? '操作失败' : '操作成功'))
  toastState.type = type
  toastState.show = true
  timer = setTimeout(() => { toastState.show = false }, 3200)
}
