import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Inject site filter automatically (multi-sites)
  const site = (window as unknown as { __trimaintSite?: string | null }).__trimaintSite
  if (site && config.url && !config.url.startsWith('/auth/') && !config.url.startsWith('/uploads/')) {
    config.params = { ...config.params, site }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
