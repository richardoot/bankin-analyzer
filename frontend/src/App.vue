<script setup lang="ts">
  import Navbar from './components/Navbar.vue'
  import Footer from './components/Footer.vue'
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-slate-900 transition-colors">
    <Navbar />
    <main>
      <RouterView />
    </main>
    <Footer />
  </div>
</template>
