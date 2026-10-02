document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "trust",
    inputs: [
      {
        key: "errors",
        sliderId: "errorsSlider",
        numberId: "errors",
        valueId: "eValue",
        min: 0,
        max: 1,
        step: 0.01,
        digits: 2,
      },
      {
        key: "connections",
        sliderId: "connectionsSlider",
        numberId: "connections",
        valueId: "cValue",
        min: 0,
        max: 200,
        step: 1,
        digits: 0,
      },
      {
        key: "bytes",
        sliderId: "bytesSlider",
        numberId: "bytes",
        valueId: "bValue",
        min: 0,
        max: 12,
        step: 0.05,
        digits: 2,
      },
    ],
    surface: {
      outputTitleKey: "index.membership.trust",
    },
    output: {
      valueId: "trustIndexOutput",
      termId: "activeOutputTerm",
    },
    rules: {
      containerId: "trustRuleEval",
    },
    // Assignment rule table: the terms of inputs ER, CC and BS take the
    // feminine form; output TI keeps the default (masculine) labels.
    termForms: {
      errors: "f",
      connections: "f",
      bytes: "f",
    },
    // A higher trust index is favourable: its colors run from red (VeryLow)
    // to light green (VeryHigh), mirroring the risk-like scales.
    higherIsBetter: ["trustIndex"],
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
          xMax: 1,
          axisLabels: {
            xKey: "index.graphs.axes.errorsX",
            yKey: "index.graphs.axes.errorsY",
          },
          showPeakLabels: true,
        },
        connections: {
          canvasId: "connectionsCanvas",
          xMax: 200,
          axisLabels: {
            xKey: "index.graphs.axes.connectionsX",
            yKey: "index.graphs.axes.connectionsY",
          },
          showPeakLabels: true,
        },
        bytes: {
          canvasId: "bytesCanvas",
          xMax: 12,
          axisLabels: {
            xKey: "index.graphs.axes.bytesX",
            yKey: "index.graphs.axes.bytesY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "trustIndex",
        canvasId: "trustCanvas",
        axisLabels: {
          xKey: "index.graphs.axes.trustX",
          yKey: "index.graphs.axes.trustY",
        },
        showPeakLabels: true,
      },
      aggregated: {
        canvasId: "trustAggregatedCanvas",
        membershipId: "tActivations",
        axisLabels: {
          xKey: "index.graphs.axes.trustX",
          yKey: "index.graphs.axes.trustY",
        },
      },
    },
  });
});
