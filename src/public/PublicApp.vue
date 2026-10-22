<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="public-sandbox">
    <header class="public-header"><RouterLink to="/rooms" class="public-brand"><span>3D</span>Three.js Sandbox</RouterLink><nav aria-label="ページを選ぶ"><RouterLink to="/rooms" active-class="is-active">小部屋で遊ぶ</RouterLink><RouterLink to="/sandbox" active-class="is-active">コードで作る</RouterLink></nav></header>
    <main><RouterView /></main>
    <footer class="public-footer">Vue 3 + TypeScript + Three.js · 配置と作品はこのブラウザに保存されます</footer>
  </div>
</template>

<style scoped>
.public-sandbox { max-width: 1680px; margin: 0 auto; }
.public-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding: 20px 30px; border-bottom: 1px solid #dfe6ee; }
.public-brand { display: flex; align-items: center; gap: 10px; color: #354c64; font-size: 16px; font-weight: 650; text-decoration: none; }
.public-brand > span { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: #52799b; color: #fff; font: 13px/1.5 Consolas, monospace; }
.public-header nav { display: flex; gap: 8px; }
.public-header nav a { padding: 8px 12px; border-radius: 6px; color: #8195a8; text-decoration: none; font-size: 12px; }
.public-header nav a.is-active { color: #3c6285; background: #e6eef6; }
main { padding: 30px; min-width: 0; }
.public-footer { padding: 0 30px 25px; color: #98a8b7; font-size: 10px; }
@media (max-width: 600px) { .public-header { padding: 15px; gap: 12px; } .public-header nav a { padding: 9px 10px; } main { padding: 22px 14px; } .public-footer { padding: 0 14px 20px; } }
</style>
