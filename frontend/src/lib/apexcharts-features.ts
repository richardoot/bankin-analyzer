/**
 * The ApexCharts pieces the app ships.
 *
 * `vue3-apexcharts/core` and `apexcharts/core` bring the bare chart class;
 * chart types and features register themselves on it when imported. The
 * default `apexcharts` entry bundles every type and feature and doubled the
 * chart chunk with v7. The app draws bars and donuts with a legend, y-axis
 * annotations and keyboard navigation, so that is the whole list. Toolbars
 * are switched off on every chart, so the toolbar and export features stay
 * out. Each chart component imports this module, so the registrations travel
 * with the lazily loaded chart chunk instead of the initial bundle.
 */
import 'apexcharts/bar'
import 'apexcharts/donut'
import 'apexcharts/features/legend'
import 'apexcharts/features/annotations'
import 'apexcharts/features/keyboard'
