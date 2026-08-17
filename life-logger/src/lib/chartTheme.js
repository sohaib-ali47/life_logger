// Chart chrome, tuned to stay recessive against the #141821 card surface.
export const CHROME = {
  grid: '#212838',
  axis: '#262d3d',
  tick: '#6f7b93',
  surface: '#141821',
  accent: '#3987e5',
}

export const axisTick = { fill: CHROME.tick, fontSize: 11 }

/** Short y-axis ticks: minutes below an hour, whole hours above. */
export const tickMinutes = (v) => (v < 60 ? `${v}m` : `${Math.round(v / 60)}h`)
