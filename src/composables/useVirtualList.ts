/**
 * Composable pour la virtualisation de listes - Optimisation performance 2025
 * Gère l'affichage efficace de grandes listes en ne rendant que les éléments visibles
 */

import { computed, ref, nextTick, onMounted, onUnmounted, type Ref } from 'vue'

interface VirtualListOptions {
  /** Hauteur fixe de chaque élément en pixels */
  itemHeight: number
  /** Nombre d'éléments supplémentaires à rendre au-dessus et en-dessous de la zone visible */
  overscan?: number
  /** Hauteur du conteneur en pixels (si non fournie, utilise la hauteur complète) */
  containerHeight?: number
}

interface VirtualListState {
  /** Index du premier élément visible */
  startIndex: number
  /** Index du dernier élément visible */
  endIndex: number
  /** Décalage du conteneur virtuel */
  offsetY: number
  /** Éléments actuellement visibles */
  visibleItems: any[]
}

export function useVirtualList<T>(
  items: Ref<T[]>,
  containerRef: Ref<HTMLElement | null>,
  options: VirtualListOptions
) {
  const { itemHeight, overscan = 5, containerHeight: fixedHeight } = options

  // État de la virtualisation
  const scrollTop = ref(0)
  const containerHeight = ref(fixedHeight || 400)

  // Calcul des indices visibles
  const virtualState = computed<VirtualListState>(() => {
    const itemCount = items.value.length

    if (itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        offsetY: 0,
        visibleItems: [],
      }
    }

    // Calculer les indices de début et fin avec overscan
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop.value / itemHeight) - overscan
    )
    const endIndex = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop.value + containerHeight.value) / itemHeight) +
        overscan
    )

    // Extraire les éléments visibles
    const visibleItems = items.value.slice(startIndex, endIndex + 1)

    return {
      startIndex,
      endIndex,
      offsetY: startIndex * itemHeight,
      visibleItems,
    }
  })

  // Hauteur totale de la liste virtuelle
  const totalHeight = computed(() => items.value.length * itemHeight)

  // Gestionnaire de scroll
  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement
    scrollTop.value = target.scrollTop
  }

  // Mise à jour de la hauteur du conteneur
  const updateContainerHeight = () => {
    if (containerRef.value && !fixedHeight) {
      containerHeight.value = containerRef.value.clientHeight
    }
  }

  // Observer de redimensionnement
  let resizeObserver: ResizeObserver | null = null

  onMounted(async () => {
    await nextTick()
    updateContainerHeight()

    // Observer les changements de taille du conteneur
    if (containerRef.value && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        updateContainerHeight()
      })
      resizeObserver.observe(containerRef.value)
    }

    // Écouter les événements de redimensionnement de la fenêtre
    window.addEventListener('resize', updateContainerHeight)
  })

  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    window.removeEventListener('resize', updateContainerHeight)
  })

  // Méthodes utilitaires
  const scrollToIndex = (
    index: number,
    behavior: ScrollBehavior = 'smooth'
  ) => {
    if (!containerRef.value) return

    const targetScrollTop = index * itemHeight
    containerRef.value.scrollTo({
      top: targetScrollTop,
      behavior,
    })
  }

  const scrollToTop = (behavior: ScrollBehavior = 'smooth') => {
    scrollToIndex(0, behavior)
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (items.value.length > 0) {
      scrollToIndex(items.value.length - 1, behavior)
    }
  }

  // Métriques de performance
  const performanceMetrics = computed(() => ({
    totalItems: items.value.length,
    visibleItems: virtualState.value.visibleItems.length,
    renderRatio:
      items.value.length > 0
        ? (
            (virtualState.value.visibleItems.length / items.value.length) *
            100
          ).toFixed(1) + '%'
        : '0%',
    scrollPercentage:
      totalHeight.value > 0
        ? (
            (scrollTop.value / (totalHeight.value - containerHeight.value)) *
            100
          ).toFixed(1) + '%'
        : '0%',
  }))

  return {
    // État
    virtualState,
    totalHeight,
    scrollTop,
    containerHeight,
    performanceMetrics,

    // Gestionnaires d'événements
    handleScroll,

    // Méthodes de navigation
    scrollToIndex,
    scrollToTop,
    scrollToBottom,

    // Méthodes utilitaires
    updateContainerHeight,
  }
}
