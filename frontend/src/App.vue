<script setup lang="ts">
  import Navbar from './components/Navbar.vue'
  import HeroSection from './components/HeroSection.vue'
  import FeaturesSection from './components/FeaturesSection.vue'
  import Footer from './components/Footer.vue'
</script>

<template>
  <div class="min-h-screen bg-white">
    <Navbar />
    <main>
      <HeroSection />
      <FeaturesSection />
    </main>
    <Footer />
  </div>
</template>
