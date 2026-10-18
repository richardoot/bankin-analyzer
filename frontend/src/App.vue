<script setup lang="ts">
  import Navbar from './components/Navbar.vue'
  import Footer from './components/Footer.vue'
  import ToastContainer from './components/ToastContainer.vue'
  import AppTabBar from './components/AppTabBar.vue'
</script>

<template>
  <!-- The bottom padding is the room the tab bar takes below lg (0 when
       the page has none): the last line of a page and the footer are never
       left under it. -->
  <div
    class="min-h-screen bg-white pb-[var(--tab-bar-space)] transition-colors dark:bg-slate-900"
  >
    <!-- First tab stop: past the navigation, straight to the page. -->
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      Aller au contenu
    </a>
    <Navbar />
    <main id="main" tabindex="-1" class="focus:outline-none">
      <RouterView />
    </main>
    <Footer />
    <AppTabBar />
    <ToastContainer />
  </div>
</template>
