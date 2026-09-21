/**
 * The ApexCharts build the app actually ships.
 *
 * `import ApexCharts from 'apexcharts'` bundles every chart type and every
 * everyday feature, which doubled the chart chunk when v7 landed. The app
 * draws bars and donuts, with a legend and y-axis annotations, so the core
 * class plus those pieces is the whole requirement. Vite aliases the bare
 * `apexcharts` specifier here, so vue3-apexcharts gets this build too.
 */
import ApexCharts from 'apexcharts/core'
import 'apexcharts/bar'
import 'apexcharts/donut'
import 'apexcharts/features/legend'
import 'apexcharts/features/annotations'

export default ApexCharts
