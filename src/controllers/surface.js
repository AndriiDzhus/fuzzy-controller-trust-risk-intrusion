/**
 * Response surface (control surface) of a controller: the crisp output as a
 * function of two inputs while the third input is held at a fixed value, the
 * same view as gensurf / Surface Viewer in MATLAB Fuzzy Logic Toolbox.
 */

const DEFAULT_POINTS = 25;
const MIN_POINTS = 5;
const MAX_POINTS = 61;

function linspace(min, max, n) {
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? max : Number((min + ((max - min) * i) / (n - 1)).toFixed(10))
  );
}

/**
 * @param {{calculate: Function, ranges: Object}} controller controller module
 * @param {object} options
 * @param {string} options.xKey input on the x axis
 * @param {string} options.yKey input on the y axis
 * @param {Object.<string, number>} options.inputs values of all inputs; the
 *   remaining input stays fixed at its value
 * @param {number} [options.points] grid points per axis
 * @returns {{xKey, yKey, fixed, x: number[], y: number[], z: (number|null)[][]}}
 *   z[j][i] is the output at (x[i], y[j]); null where no rule fired
 */
function computeSurface(controller, { xKey, yKey, inputs, points = DEFAULT_POINTS }) {
  const keys = Object.keys(controller.ranges);
  if (!keys.includes(xKey) || !keys.includes(yKey) || xKey === yKey) {
    throw new Error("xKey and yKey must be two different inputs of the controller");
  }
  const n = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(Number(points) || DEFAULT_POINTS)));
  const x = linspace(controller.ranges[xKey].min, controller.ranges[xKey].max, n);
  const y = linspace(controller.ranges[yKey].min, controller.ranges[yKey].max, n);

  const fixed = {};
  keys.filter((key) => key !== xKey && key !== yKey).forEach((key) => {
    fixed[key] = inputs[key];
  });

  const z = y.map((yValue) =>
    x.map((xValue) => {
      const { value } = controller.calculate({ ...fixed, [xKey]: xValue, [yKey]: yValue });
      return value == null ? null : value;
    })
  );

  return { xKey, yKey, fixed, x, y, z };
}

module.exports = {
  computeSurface,
  DEFAULT_POINTS,
};
