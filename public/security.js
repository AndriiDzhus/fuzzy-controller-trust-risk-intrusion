document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "security",
    inputs: [
      { key: "energy", sliderId: "energySlider", numberId: "energyNumber", valueId: "energyValue" },
      { key: "strength", sliderId: "strengthSlider", numberId: "strengthNumber", valueId: "strengthValue" },
      { key: "response", sliderId: "responseSlider", numberId: "responseNumber", valueId: "responseValue" },
    ],
    output: {
      valueId: "riskValue",
      termId: "riskTerm",
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
          axisLabels: {
            xKey: "security.graphs.axes.energyX",
            yKey: "security.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        strength: {
          canvasId: "strengthCanvas",
          axisLabels: {
            xKey: "security.graphs.axes.strengthX",
            yKey: "security.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        response: {
          canvasId: "responseCanvas",
          axisLabels: {
            xKey: "security.graphs.axes.responseX",
            yKey: "security.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "risk",
        canvasId: "riskCanvas",
        axisLabels: {
          xKey: "security.graphs.axes.riskX",
          yKey: "security.graphs.axes.membershipY",
        },
      },
    },
  });
});
