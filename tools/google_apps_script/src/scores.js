// BiS ratio: normalized tier presence divided by (BiS loots + 1).
function bisRatio_(tierPresence, tierMax, bisLoots) {
  var presence = Number(tierPresence || 0);
  var max = Number(tierMax || 0);
  var loots = Number(bisLoots || 0);
  if (max <= 0) {
    max = 1;
  }
  return (presence / max) / (loots + 1);
}

// Impact score: (tier presence / raids of the tier) × parse × item gain in DPS / (Impact loots + 1).
// Only for an IMPACT Statut, never for tanks (null); an empty gain counts as 0.
function impactScore_(tierPresence, tierMax, parse, impactLoots, isTank, statut, gainDps) {
  if (isTank || statut !== 'IMPACT') {
    return null;
  }

  var presence = Number(tierPresence || 0);
  var max = Number(tierMax || 0);
  var loots = Number(impactLoots || 0);
  // Same rule as the sheet: only a real non-zero number counts as the parse, anything else is 1.
  var parseNumber = typeof parse === 'number' && parse !== 0 && isFinite(parse) ? parse : 1;

  if (max <= 0) {
    max = 1;
  }

  return (presence / max) * parseNumber * Number(gainDps || 0) / (loots + 1);
}
