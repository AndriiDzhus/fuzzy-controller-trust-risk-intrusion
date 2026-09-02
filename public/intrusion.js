document.addEventListener("DOMContentLoaded", async () => {
  await createFuzzyPage({
    controller: "intrusion",
    inputs: [
      { key: "packets", sliderId: "packetsSlider", numberId: "packetsNumber", valueId: "packetsValue" },
      { key: "rate", sliderId: "rateSlider", numberId: "rateNumber", valueId: "rateValue" },
      { key: "delivery", sliderId: "deliverySlider", numberId: "deliveryNumber", valueId: "deliveryValue" },
    ],
    output: {
      valueId: "intrusionValue",
      termId: "intrusionTerm",
    },
    membership: {
      packets: "packetsMembership",
      rate: "rateMembership",
      delivery: "deliveryMembership",
      intrusion: "intrusionMembership",
    },
    graphs: {
      inputs: {
        packets: {
          canvasId: "packetsCanvas",
          axisLabels: {
            xKey: "intrusion.graphs.axes.packetsX",
            yKey: "intrusion.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        rate: {
          canvasId: "rateCanvas",
          axisLabels: {
            xKey: "intrusion.graphs.axes.rateX",
            yKey: "intrusion.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
        delivery: {
          canvasId: "deliveryCanvas",
          axisLabels: {
            xKey: "intrusion.graphs.axes.deliveryX",
            yKey: "intrusion.graphs.axes.membershipY",
          },
          showPeakLabels: true,
        },
      },
      output: {
        key: "intrusion",
        canvasId: "intrusionCanvas",
        axisLabels: {
          xKey: "intrusion.graphs.axes.intrusionX",
          yKey: "intrusion.graphs.axes.membershipY",
        },
        showPeakLabels: true,
      },
      aggregated: {
        canvasId: "intrusionAggregatedCanvas",
        axisLabels: {
          xKey: "intrusion.graphs.axes.intrusionX",
          yKey: "intrusion.graphs.axes.membershipY",
        },
      },
    },
  });
});
