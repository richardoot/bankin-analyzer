// Applies the stored theme before first paint, so the page never flashes the
// wrong one. External file rather than an inline <script>: the CSP says
// `script-src 'self'`, which is only honest if nothing executes inline.
;(function () {
  const stored = localStorage.getItem('bankin-analyzer-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark =
    stored === 'dark' ||
    (stored === 'system' && prefersDark) ||
    (!stored && prefersDark)
  if (isDark) document.documentElement.classList.add('dark')
})()
