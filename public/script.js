document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "trust",
    inputs: [
      { key: "errors", sliderId: "errorsSlider", numberId: "errors", valueId: "eValue" },
      { key: "connections", sliderId: "connectionsSlider", numberId: "connections", valueId: "cValue" },
      { key: "bytes", sliderId: "bytesSlider", numberId: "bytes", valueId: "bValue" },
    ],
    output: {
      valueId: "trustIndexOutput",
      termId: "activeOutputTerm",
    },
    membership: {
      errors: "eMembership",
      connections: "cMembership",
      bytes: "bMembership",
      trustIndex: "tMembership",
    },
    graphs: {
      inputs: {
        errors: {
          canvasId: "errorsCanvas",
          axisLabels: {
            xKey: "index.graphs.axes.errorsX",
            yKey: "index.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        connections: {
          canvasId: "connectionsCanvas",
          axisLabels: {
            xKey: "index.graphs.axes.connectionsX",
            yKey: "index.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        bytes: {
          canvasId: "bytesCanvas",
          axisLabels: {
            xKey: "index.graphs.axes.bytesX",
            yKey: "index.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "trustIndex",
        canvasId: "trustIndexCanvas",
        axisLabels: {
          xKey: "index.graphs.axes.trustX",
          yKey: "index.graphs.axes.membershipY",
        },
        showPeakLabels: true,
      },
      aggregated: {
        canvasId: "trustAggregatedCanvas",
        axisLabels: {
          xKey: "index.graphs.axes.trustX",
          yKey: "index.graphs.axes.membershipY",
        },
      },
    },
  });
});
