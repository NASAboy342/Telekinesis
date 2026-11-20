import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history: the desktop host serves a static index.html.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/play', name: 'play', component: () => import('../views/GameView.vue') },
    { path: '/arena', name: 'arena', component: () => import('../views/ArenaView.vue') },
    { path: '/tutorial', name: 'tutorial', component: () => import('../views/TutorialView.vue') },
    { path: '/spike', name: 'spike', component: () => import('../views/SpikeView.vue') },
  ],
})

export default router
