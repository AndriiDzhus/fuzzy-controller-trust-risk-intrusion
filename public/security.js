document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "security",
    inputs: [
      {
        key: "energy",
        sliderId: "energySlider",
        numberId: "energyNumber",
        valueId: "energyValue",
        min: 0,
        max: 0.05,
        step: 0.001,
        digits: 3,
      },
      {
        key: "strength",
        sliderId: "strengthSlider",
        numberId: "strengthNumber",
        valueId: "strengthValue",
        min: 0,
        max: 40,
        step: 0.1,
        digits: 1,
      },
      {
        key: "response",
        sliderId: "responseSlider",
        numberId: "responseNumber",
        valueId: "responseValue",
        min: 0,
        max: 10,
        step: 0.1,
        digits: 1,
      },
    ],
    output: {
      valueId: "riskValue",
      termId: "riskTerm",
    },
    rules: {
      containerId: "securityRuleEval",
    },
    membership: {
      energy: "energyMembership",
      strength: "strengthMembership",
      response: "responseMembership",
      risk: "riskMembership",
    },
    graphs: {
      inputs: {
        energy: {
          canvasId: "energyCanvas",
          xMax: 0.05,
          axisLabels: {
            xKey: "security.graphs.axes.energyX",
            yKey: "security.graphs.axes.energyY",
          },
          showPeakLabels: true,
        },
        strength: {
          canvasId: "strengthCanvas",
          xMax: 40,
          axisLabels: {
            xKey: "security.graphs.axes.strengthX",
            yKey: "security.graphs.axes.strengthY",
          },
          showPeakLabels: true,
        },
        response: {
          canvasId: "responseCanvas",
          xMax: 10,
          axisLabels: {
            xKey: "security.graphs.axes.responseX",
            yKey: "security.graphs.axes.responseY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "risk",
        canvasId: "riskCanvas",
        axisLabels: {
          xKey: "security.graphs.axes.riskX",
          yKey: "security.graphs.axes.riskY",
        },
      },
    },
  });
});
