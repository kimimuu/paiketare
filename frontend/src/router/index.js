import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('../views/Login.vue') },
  { path: '/register', component: () => import('../views/Register.vue') },
  { path: '/change-password', component: () => import('../views/ChangePassword.vue') },
  // 老师端
  { path: '/teacher/home', component: () => import('../views/teacher/Home.vue') },
  { path: '/teacher/availability', component: () => import('../views/teacher/Availability.vue') },
  { path: '/teacher/campuses', component: () => import('../views/teacher/Campuses.vue') },
  { path: '/teacher/todo', component: () => import('../views/teacher/Todo.vue') },
  { path: '/teacher/schedule', component: () => import('../views/teacher/Schedule.vue') },
  // 管理端
  { path: '/admin/dashboard', component: () => import('../views/admin/Dashboard.vue') },
  { path: '/admin/booking', component: () => import('../views/admin/Booking.vue') },
  { path: '/admin/schedule', component: () => import('../views/admin/Schedule.vue') },
  { path: '/admin/teachers', component: () => import('../views/admin/Teachers.vue') },
  { path: '/admin/students', component: () => import('../views/admin/Students.vue') },
  { path: '/admin/campuses', component: () => import('../views/admin/Campuses.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫：未登录跳登录页；按角色分流首页
router.beforeEach((to) => {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!user && to.path !== '/login' && to.path !== '/register') {
    return '/login'
  }
  if (user && user.needChangePassword && to.path !== '/change-password') {
    return '/change-password'
  }
  if (user && (to.path === '/login' || to.path === '/')) {
    return user.role === 'admin' ? '/admin/dashboard' : '/teacher/home'
  }
})

export default router
