import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import PublicApp from './PublicApp.vue';
import '../style.css';

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/rooms' },
    { path: '/rooms', component: () => import('../pages/RoomsPlayground.vue') },
    { path: '/sandbox', component: () => import('../pages/SandboxIndex.vue') },
    { path: '/sandbox/stl', component: () => import('../pages/SandboxStl.vue') },
    { path: '/sandbox/:id', component: () => import('../pages/SandboxPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/rooms' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.afterEach(to => { document.title = to.path === '/rooms' ? '小部屋プレイグラウンド | Three.js Sandbox' : 'コードで遊ぶ | Three.js Sandbox'; });
createApp(PublicApp).use(router).mount('#app');
