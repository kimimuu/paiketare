import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin',
    isTeacher: (s) => s.user?.role === 'teacher'
  },
  actions: {
    setUser(user) {
      this.user = user
      localStorage.setItem('user', JSON.stringify(user))
    },
    logout() {
      this.user = null
      localStorage.removeItem('user')
    }
  }
})
