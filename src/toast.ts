
export function showToast(text: string, status: 'info' | 'success' | 'warning' | 'error' = 'success') {
  document.querySelectorAll('dss-toast').forEach((t) => t.remove())
  const toast = Object.assign(document.createElement('dss-toast'), {
    text,
    status,
    duration: 5000,
    position: 'bottom-left',
    hasButtonClose: true,
    isShow: true,
  })
  document.body.append(toast)
}
