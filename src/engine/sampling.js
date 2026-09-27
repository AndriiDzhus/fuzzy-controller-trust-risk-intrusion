/**
 * Uniform grids and sampled membership curves for the charts and for the
 * discrete centroid.
 */

/** Grid start + i·step built from an integer counter, so it never drifts. */
function gridPoints([start, end], step) {
  const count = Math.round((end - start) / step);
  const xs = [];
  for (let i = 0; i <= count; i += 1) {
    xs.push(i === count ? end : Number((start + i * step).toFixed(10)));
  }
  return xs;
}

/** Samples every term of a variable on [0, max] with the given step. */
function sampleVariable(variable, step, max) {
  const xs = gridPoints([0, max], step);
  const out = {};
  variable.terms.forEach((term) => {
    out[term.name] = xs.map((x) => ({ x, y: term.valueAt(x) }));
  });
  return out;
}

module.exports = {
  gridPoints,
  sampleVariable,
};
