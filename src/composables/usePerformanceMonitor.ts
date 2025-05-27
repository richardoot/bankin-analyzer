/**
 * Composable pour surveiller les performances de l'application
 * Fournit des outils de mesure et d'optimisation
 */

import { ref, watch, type Ref } from 'vue'

export interface PerformanceMetrics {
  componentRenderTime: number
  computedCalculationTime: number
  watcherExecutionTime: number
  memoryUsage: number
  updateCount: number
}

export interface PerformanceMonitorOptions {
  enabled?: boolean
  logToConsole?: boolean
  trackMemory?: boolean
}

const DEFAULT_OPTIONS: PerformanceMonitorOptions = {
  enabled: import.meta.env.DEV,
  logToConsole: false,
  trackMemory: true,
}

export const usePerformanceMonitor = (
  componentName: string,
  options: PerformanceMonitorOptions = {}
) => {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const metrics = ref<PerformanceMetrics>({
    componentRenderTime: 0,
    computedCalculationTime: 0,
    watcherExecutionTime: 0,
    memoryUsage: 0,
    updateCount: 0,
  })

  const timers = new Map<string, number>()

  /**
   * Démarre la mesure d'une opération
   */
  const startMeasure = (operationName: string): void => {
    if (!config.enabled) return
    timers.set(operationName, performance.now())
  }

  /**
   * Termine la mesure d'une opération et met à jour les métriques
   */
  const endMeasure = (
    operationName: string,
    metricKey: keyof PerformanceMetrics = 'componentRenderTime'
  ): number => {
    if (!config.enabled) return 0

    const startTime = timers.get(operationName)
    if (!startTime) return 0

    const duration = performance.now() - startTime
    timers.delete(operationName)

    // Mettre à jour les métriques avec une moyenne mobile
    if (typeof metrics.value[metricKey] === 'number') {
      metrics.value[metricKey] = metrics.value[metricKey] * 0.8 + duration * 0.2
    }

    metrics.value.updateCount++

    if (config.logToConsole && duration > 16) {
      console.warn(
        `⚠️ Performance: ${componentName}.${operationName} took ${duration.toFixed(2)}ms`
      )
    }

    return duration
  }

  /**
   * Mesure la mémoire utilisée
   */
  const measureMemory = (): void => {
    if (!config.enabled || !config.trackMemory) return

    if ('memory' in performance) {
      const memInfo = (
        performance as unknown as {
          memory: { usedJSHeapSize: number }
        }
      ).memory
      metrics.value.memoryUsage = memInfo.usedJSHeapSize / 1024 / 1024 // MB
    }
  }

  /**
   * Surveille les changements d'une ref et mesure le temps d'exécution
   */
  const watchWithPerformance = <T>(
    source: Ref<T>,
    callback: (newVal: T, oldVal: T) => void,
    operationName: string = 'watcher'
  ) => {
    return watch(
      source,
      (newVal, oldVal) => {
        startMeasure(operationName)
        callback(newVal, oldVal)
        endMeasure(operationName, 'watcherExecutionTime')
        measureMemory()
      },
      { deep: true, flush: 'post' }
    )
  }

  /**
   * Wrapper pour computed avec mesure de performance
   */
  const computedWithPerformance = <T>(
    getter: () => T,
    operationName: string = 'computed'
  ) => {
    return () => {
      startMeasure(operationName)
      const result = getter()
      endMeasure(operationName, 'computedCalculationTime')
      return result
    }
  }

  /**
   * Obtient un rapport de performance
   */
  const getPerformanceReport = () => {
    if (!config.enabled) return null

    measureMemory()

    return {
      component: componentName,
      timestamp: new Date().toISOString(),
      metrics: { ...metrics.value },
      recommendations: generateRecommendations(),
    }
  }

  /**
   * Génère des recommandations d'optimisation
   */
  const generateRecommendations = (): string[] => {
    const recommendations: string[] = []

    if (metrics.value.componentRenderTime > 16) {
      recommendations.push('Considérer la virtualisation ou le lazy loading')
    }

    if (metrics.value.computedCalculationTime > 10) {
      recommendations.push('Optimiser les computed properties avec du cache')
    }

    if (metrics.value.watcherExecutionTime > 5) {
      recommendations.push('Implémenter du debouncing pour les watchers')
    }

    if (metrics.value.memoryUsage > 50) {
      recommendations.push('Vérifier les fuites mémoire potentielles')
    }

    if (metrics.value.updateCount > 100) {
      recommendations.push('Réduire la fréquence des mises à jour')
    }

    return recommendations
  }

  /**
   * Réinitialise les métriques
   */
  const resetMetrics = (): void => {
    metrics.value = {
      componentRenderTime: 0,
      computedCalculationTime: 0,
      watcherExecutionTime: 0,
      memoryUsage: 0,
      updateCount: 0,
    }
    timers.clear()
  }

  /**
   * Active/désactive le monitoring
   */
  const setEnabled = (enabled: boolean): void => {
    config.enabled = enabled
    if (!enabled) {
      timers.clear()
    }
  }

  return {
    metrics: metrics.value,
    startMeasure,
    endMeasure,
    measureMemory,
    watchWithPerformance,
    computedWithPerformance,
    getPerformanceReport,
    resetMetrics,
    setEnabled,
  }
}

/**
 * Composable global pour monitorer les performances de l'app
 */
export const useGlobalPerformanceMonitor = () => {
  const componentMetrics = new Map<string, PerformanceMetrics>()

  const registerComponent = (
    componentName: string,
    metrics: PerformanceMetrics
  ) => {
    componentMetrics.set(componentName, metrics)
  }

  const getGlobalReport = () => {
    const totalTime = Array.from(componentMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.componentRenderTime,
      0
    )

    const slowestComponents = Array.from(componentMetrics.entries())
      .sort(([, a], [, b]) => b.componentRenderTime - a.componentRenderTime)
      .slice(0, 5)

    return {
      totalRenderTime: totalTime,
      componentCount: componentMetrics.size,
      slowestComponents,
      totalUpdates: Array.from(componentMetrics.values()).reduce(
        (sum, metrics) => sum + metrics.updateCount,
        0
      ),
    }
  }

  return {
    registerComponent,
    getGlobalReport,
  }
}
