document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "intrusion",
    inputs: [
      {
        key: "packets",
        sliderId: "packetsSlider",
        numberId: "packetsNumber",
        valueId: "packetsValue",
        min: 0,
        max: 15,
        step: 0.1,
        digits: 1,
      },
      {
        key: "rate",
        sliderId: "rateSlider",
        numberId: "rateNumber",
        valueId: "rateValue",
        min: 0,
        max: 3000,
        step: 1,
        digits: 0,
      },
      {
        key: "weight",
        sliderId: "weightSlider",
        numberId: "weightNumber",
        valueId: "weightValue",
        min: 0,
        max: 250,
        step: 0.5,
        digits: 1,
      },
    ],
    surface: {
      outputTitleKey: "intrusion.membership.intrusion",
    },
    output: {
      valueId: "intrusionValue",
      termId: "intrusionTerm",
    },
    rules: {
      containerId: "intrusionRuleEval",
    },
    // Assignment rule table: NP, Rate and output IP take the feminine form
    // (IP "none" reads as absent), We takes the neuter form.
    termForms: {
      packets: "f",
      rate: "f",
      weight: "n",
      intrusion: "f",
    },
    membership: {
      packets: "packetsMembership",
      rate: "rateMembership",
      weight: "weightMembership",
      intrusion: "intrusionMembership",
    },
    graphs: {
      inputs: {
        packets: {
          canvasId: "packetsCanvas",
          xMax: 15,
          axisLabels: {
            xKey: "intrusion.graphs.axes.packetsX",
            yKey: "intrusion.graphs.axes.packetsY",
          },
          showPeakLabels: true,
        },
        rate: {
          canvasId: "rateCanvas",
          xMax: 3000,
          axisLabels: {
            xKey: "intrusion.graphs.axes.rateX",
            yKey: "intrusion.graphs.axes.rateY",
          },
          showPeakLabels: true,
        },
        weight: {
          canvasId: "weightCanvas",
          xMax: 250,
          axisLabels: {
            xKey: "intrusion.graphs.axes.weightX",
            yKey: "intrusion.graphs.axes.weightY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "intrusion",
        canvasId: "intrusionCanvas",
        axisLabels: {
          xKey: "intrusion.graphs.axes.intrusionX",
          yKey: "intrusion.graphs.axes.intrusionY",
        },
        showPeakLabels: true,
      },
      aggregated: {
        canvasId: "intrusionAggregatedCanvas",
        membershipId: "intrusionActivations",
        axisLabels: {
          xKey: "intrusion.graphs.axes.intrusionX",
          yKey: "intrusion.graphs.axes.intrusionY",
        },
      },
    },
  });
});
