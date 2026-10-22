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

// Impact base: normalized lifetime presence * parse / (Impact loots + 1), null for tanks.
function impactBase_(lifetimePresence, lifetimeMax, parse, impactLoots, isTank) {
  if (isTank) {
    return null;
  }

  var presence = Number(lifetimePresence || 0);
  var max = Number(lifetimeMax || 0);
  var loots = Number(impactLoots || 0);
  // Same rule as the sheet's IF(N(parse)=0,1,parse): only a real non-zero number counts.
  var parseNumber = typeof parse === 'number' && parse !== 0 && isFinite(parse) ? parse : 1;

  if (max <= 0) {
    max = 1;
  }

  return (presence / max) * parseNumber / (loots + 1);
}

// Full impact score: only for IMPACT items, null otherwise.
function impactScore_(impactBase, statut, gainFraction) {
  if (statut !== 'IMPACT' || impactBase === null || impactBase === undefined) {
    return null;
  }
  return Number(impactBase) * Number(gainFraction || 0);
}
