package expo.modules.chartview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ChartViewModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ChartView")

        View(ChartView::class) {
            Prop("xLabels") { view: ChartView, labels: List<String> ->
                view.xLabels = labels
                view.invalidate()
            }
            Prop("yValues") { view: ChartView, values: List<Double> ->
                view.yValues = values
                view.invalidate()
            }
            Prop("chartType") { view: ChartView, type: String ->
                view.chartType = type
                view.invalidate()
            }
        }
    }
}
