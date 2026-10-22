// Roster roles shown to the owner; story 4.6 maps them to Interchange v1 (TANK, HEALER, DPS).
var ROLE_OPTIONS = ['Tank', 'Heal', 'Melee DPS', 'Ranged DPS', 'Caster DPS'];

// Display values and colours for role dropdowns in Roster and Rerolls.
var ROLE_DISPLAY = {
  'Tank': { value: '🛡️ Tank', colorHex: 'C9D6E3', textHex: '1F1F1F' },
  'Heal': { value: '✚ Heal', colorHex: 'C8E6C9', textHex: '1F1F1F' },
  'Melee DPS': { value: '⚔️ Melee DPS', colorHex: 'F4C7C3', textHex: '1F1F1F' },
  'Ranged DPS': { value: '🏹 Ranged DPS', colorHex: 'E0CDB5', textHex: '1F1F1F' },
  'Caster DPS': { value: '🔮 Caster DPS', colorHex: 'D9C8F0', textHex: '1F1F1F' }
};

// One source for the class dropdown, the class colours and the spec check (French client names).
// colorHex is the WoW class colour used as cell background; textHex keeps the text readable on it.
var CLASS_SPECS = [
  {
    name: 'Guerrier',
    specs: ['Armes', 'Fureur', 'Protection'],
    specIcons: { 'Armes': '⚔️', 'Fureur': '💢', 'Protection': '🛡️' },
    colorHex: 'C69B6D',
    textHex: '1F1F1F'
  },
  {
    name: 'Paladin',
    specs: ['Sacré', 'Protection', 'Vindicte'],
    specIcons: { 'Sacré': '✨', 'Protection': '🛡️', 'Vindicte': '⚖️' },
    colorHex: 'F48CBA',
    textHex: '1F1F1F'
  },
  {
    name: 'Chasseur',
    specs: ['Maîtrise des bêtes', 'Précision', 'Survie'],
    specIcons: { 'Maîtrise des bêtes': '🐾', 'Précision': '🎯', 'Survie': '🌲' },
    colorHex: 'AAD372',
    textHex: '1F1F1F'
  },
  {
    name: 'Voleur',
    specs: ['Assassinat', 'Combat', 'Finesse'],
    specIcons: { 'Assassinat': '🗡️', 'Combat': '⚔️', 'Finesse': '🌫️' },
    colorHex: 'FFF468',
    textHex: '1F1F1F'
  },
  {
    name: 'Prêtre',
    specs: ['Discipline', 'Sacré', 'Ombre'],
    specIcons: { 'Discipline': '📿', 'Sacré': '✨', 'Ombre': '🌑' },
    colorHex: 'FFFFFF',
    textHex: '1F1F1F'
  },
  {
    name: 'Chaman',
    specs: ['Élémentaire', 'Amélioration', 'Restauration'],
    specIcons: { 'Élémentaire': '⚡', 'Amélioration': '🌪️', 'Restauration': '💧' },
    colorHex: '0070DD',
    textHex: 'FFFFFF'
  },
  {
    name: 'Mage',
    specs: ['Arcanes', 'Feu', 'Givre'],
    specIcons: { 'Arcanes': '🔮', 'Feu': '🔥', 'Givre': '❄️' },
    colorHex: '3FC7EB',
    textHex: '1F1F1F'
  },
  {
    name: 'Démoniste',
    specs: ['Affliction', 'Démonologie', 'Destruction'],
    specIcons: { 'Affliction': '☠️', 'Démonologie': '😈', 'Destruction': '💥' },
    colorHex: '8788EE',
    textHex: '1F1F1F'
  },
  {
    name: 'Druide',
    specs: ['Équilibre', 'Combat farouche', 'Restauration'],
    specIcons: { 'Équilibre': '🌙', 'Combat farouche': '🐻', 'Restauration': '🌿' },
    colorHex: 'FF7C0A',
    textHex: '1F1F1F'
  }
];

// Spec grid contract: ordered columns after Objet (ID) and Objet.
var SPEC_COLUMNS = [
  { role: 'Tank', className: 'Guerrier', spec: 'Protection', label: 'Guerrier Protection' },
  { role: 'Tank', className: 'Paladin', spec: 'Protection', label: 'Paladin Protection' },
  { role: 'Tank', className: 'Druide', spec: 'Combat farouche', label: 'Druide Combat farouche (tank)' },
  { role: 'Heal', className: 'Paladin', spec: 'Sacré', label: 'Paladin Sacré' },
  { role: 'Heal', className: 'Prêtre', spec: 'Discipline', label: 'Prêtre Discipline' },
  { role: 'Heal', className: 'Prêtre', spec: 'Sacré', label: 'Prêtre Sacré' },
  { role: 'Heal', className: 'Chaman', spec: 'Restauration', label: 'Chaman Restauration' },
  { role: 'Heal', className: 'Druide', spec: 'Restauration', label: 'Druide Restauration' },
  { role: 'Melee DPS', className: 'Guerrier', spec: 'Armes', label: 'Guerrier Armes' },
  { role: 'Melee DPS', className: 'Guerrier', spec: 'Fureur', label: 'Guerrier Fureur' },
  { role: 'Melee DPS', className: 'Paladin', spec: 'Vindicte', label: 'Paladin Vindicte' },
  { role: 'Melee DPS', className: 'Voleur', spec: 'Assassinat', label: 'Voleur Assassinat' },
  { role: 'Melee DPS', className: 'Voleur', spec: 'Combat', label: 'Voleur Combat' },
  { role: 'Melee DPS', className: 'Voleur', spec: 'Finesse', label: 'Voleur Finesse' },
  { role: 'Melee DPS', className: 'Chaman', spec: 'Amélioration', label: 'Chaman Amélioration' },
  { role: 'Melee DPS', className: 'Druide', spec: 'Combat farouche', label: 'Druide Combat farouche (félin)' },
  { role: 'Ranged DPS', className: 'Chasseur', spec: 'Maîtrise des bêtes', label: 'Chasseur Maîtrise des bêtes' },
  { role: 'Ranged DPS', className: 'Chasseur', spec: 'Précision', label: 'Chasseur Précision' },
  { role: 'Ranged DPS', className: 'Chasseur', spec: 'Survie', label: 'Chasseur Survie' },
  { role: 'Caster DPS', className: 'Mage', spec: 'Arcanes', label: 'Mage Arcanes' },
  { role: 'Caster DPS', className: 'Mage', spec: 'Feu', label: 'Mage Feu' },
  { role: 'Caster DPS', className: 'Mage', spec: 'Givre', label: 'Mage Givre' },
  { role: 'Caster DPS', className: 'Démoniste', spec: 'Affliction', label: 'Démoniste Affliction' },
  { role: 'Caster DPS', className: 'Démoniste', spec: 'Démonologie', label: 'Démoniste Démonologie' },
  { role: 'Caster DPS', className: 'Démoniste', spec: 'Destruction', label: 'Démoniste Destruction' },
  { role: 'Caster DPS', className: 'Prêtre', spec: 'Ombre', label: 'Prêtre Ombre' },
  { role: 'Caster DPS', className: 'Chaman', spec: 'Élémentaire', label: 'Chaman Élémentaire' },
  { role: 'Caster DPS', className: 'Druide', spec: 'Équilibre', label: 'Druide Équilibre' }
];

// Grid tabs rebuilt or refreshed by setup. tierItems is the former single grid, kept only so setup can remove it.
var GRID_TABS = {
  presence: { name: 'Présence', sheetId: 1011 },
  awards: { name: 'Awards', sheetId: 1012 },
  tierItems: { name: 'TierItems', sheetId: 1013 }
};

// Shared grid coordinates used by setup formulas and grid builders.
var PRESENCE_FIRST_RAIDER_COLUMN = 3;
var PRESENCE_RAID_ID_COLUMN = 0;
var PRESENCE_DATE_COLUMN = 2;
var PRESENCE_FIRST_RAID_ROW = 3;
var AWARDS_BLOCK_WIDTH = 5;
var AWARDS_DATE_OFFSET = 0;
var AWARDS_TREATMENT_OFFSET = 3;
var AWARDS_RAID_ID_OFFSET = 4;
var AWARDS_FIRST_ROW = 3;

// Columns of raiders no longer in Roster or Rerolls move here; they come back when the name is listed again.
var ARCHIVE_TABS = {
  presence: { name: 'Présence (archive)', sheetId: 1016 },
  awards: { name: 'Awards (archive)', sheetId: 1017 }
};

// One item grid per role, same layout as the former TierItems, restricted to the role's specs.
var ITEM_TABS = ROLE_OPTIONS.map(function (role, index) {
  return { role: role, name: 'Objets ' + role, sheetId: 1021 + index };
});

// Tab order applied on every setup run; technical tabs last. Tabs not listed end up after these.
var TAB_ORDER = ['Roster', 'Rerolls', 'Présence', 'Awards']
  .concat(ITEM_TABS.map(function (tab) { return tab.name; }))
  .concat(['Raids', 'Config', ARCHIVE_TABS.presence.name, ARCHIVE_TABS.awards.name, '_Listes']);

// Light WoW item-rarity tints for Présence (rare blue) and Awards (epic purple, legendary orange for BIS).
var RARITY_STYLE = {
  rareHeader: { background: 'DCE9F7', text: '0B4F9C' },
  rareCell: { background: 'E8F1FC', text: '0070DD' },
  epicHeader: { background: 'EDE1F7', text: '6A1FA8' },
  epicCell: { background: 'F4ECFB', text: 'A335EE' },
  legendaryCell: { background: 'FFF1E0', text: 'C65F00' },
  subHeader: { background: 'F3F3F3', text: '1F1F1F' },
  muted: { text: '8A8A8A' }
};

// Hidden helper tab for dependent dropdown values.
var LISTS_TAB = { name: '_Listes', sheetId: 1020 };

// Column contract for every data tab, in creation order.
// Code reads columns by `key` (stable); `label` is what people see in row 1; `note` shows on hover.
// group: 'input' = filled by the owner, 'log' = written by the script (different tab colour).
// sheetId is used only when setup creates the tab; code finds tabs by name. Later stories may only append columns.
var TABS = [
  {
    // Single value row (row 2) for the active tier and BiS window.
    name: 'Config',
    sheetId: 1001,
    group: 'input',
    columns: [
      { key: 'tierId', label: 'Palier actif (ID)', note: 'Identifiant du palier en cours, ex. forever-t1. Rempli par l\'officier en ligne 2.' },
      { key: 'bisWindowId', label: 'Fenêtre BiS active (ID)', note: 'Identifiant de la fenêtre BiS active, ex. forever-t1-w1.' },
      { key: 'bisWindowStart', label: 'Début fenêtre BiS', note: 'Date de reset qui ouvre la fenêtre BiS active. Les raids à partir de cette date sont dans la fenêtre.' },
      { key: 'openRaidId', label: 'Raid ouvert (ID)', note: 'Identifiant du raid ouvert pour la saisie courante.' }
    ]
  },
  {
    name: 'Roster',
    sheetId: 1002,
    group: 'input',
    columns: [
      { key: 'raiderKey', label: 'Raider (nom exact en jeu)', note: 'Nom du personnage exactement comme en jeu (majuscules et accents compris), sans royaume. Doit être unique.' },
      { key: 'class', label: 'Classe', note: 'Classe du personnage (liste).' },
      { key: 'spec', label: 'Spé', note: 'Spécialisation : une des trois spés de la classe, ex. Mage → Arcanes, Feu ou Givre.' },
      { key: 'role', label: 'Rôle', note: 'Tank, Heal, Melee DPS, Ranged DPS ou Caster DPS.' },
      { key: 'dpsParse', label: 'Parse WCL moyen', formerLabels: ['Parse WCL moyen (1-100)'], note: 'Parse moyen Warcraft Logs du palier, de 1 à 100. Vide = 1.' },
      { key: 'tierPresence', label: 'Présence palier', note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'tierPresenceMax', label: 'Nombre de raids du palier', formerLabels: ['Max palier', 'Nombre de raids par palier'], note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'lifetimePresence', label: 'Présence totale', formerLabels: ['Présence vie'], note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'lifetimePresenceMax', label: 'Nombre de raids totaux', formerLabels: ['Max vie'], note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'bisLootCount', label: 'Loots BiS', note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'impactLootCount', label: 'Loots Impact', note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'bisRatio', label: 'Ratio BiS', note: 'Calculé, ne pas saisir.', formula: true },
      { key: 'impactBase', label: 'Impact (sans gain objet)', note: 'Calculé, ne pas saisir.', formula: true }
    ]
  },
  {
    name: 'Rerolls',
    sheetId: 1003,
    group: 'input',
    columns: [
      { key: 'rerollName', label: 'Reroll (nom exact)', note: 'Nom exact du reroll. Sa présence compte pour le personnage principal, jamais son loot.' },
      { key: 'class', label: 'Classe', note: 'Classe du personnage (liste).' },
      { key: 'spec', label: 'Spé', note: 'Spécialisation : une des trois spés de la classe, avec emoji.' },
      { key: 'role', label: 'Rôle', note: 'Tank, Heal, Melee DPS, Ranged DPS ou Caster DPS.' },
      { key: 'dpsParse', label: 'Parse WCL moyen', note: 'Parse moyen Warcraft Logs du palier, de 1 à 100. Vide = 1.' },
      { key: 'mainKey', label: 'Personnage principal', note: 'Nom exact du personnage principal, tel qu\'écrit dans Roster.' }
    ]
  },
  {
    // New id: the old Raids (1004) is deleted in the same batch that creates this one.
    name: 'Raids',
    sheetId: 1014,
    group: 'log',
    columns: [
      { key: 'raidId', label: 'Raid (ID)', note: 'Identifiant unique du raid. Écrit par le script.' },
      { key: 'instance', label: 'Instance', note: 'Nom de l\'instance. Écrit par le script.' },
      { key: 'raidDate', label: 'Date du raid', note: 'Date du raid. Écrit par le script.' },
      { key: 'reportCodes', label: 'Rapports WCL', note: 'Codes de rapports importés pour ce raid, séparés par des espaces.' },
      { key: 'importedAt', label: 'Importé le', note: 'Date et heure du dernier import de rapport pour ce raid.' }
    ]
  }
];

// Contract entry for a tab name, or null.
function tabByName_(name) {
  for (var i = 0; i < TABS.length; i += 1) {
    if (TABS[i].name === name) {
      return TABS[i];
    }
  }
  return null;
}

function keysOf_(tab) {
  if (!tab || !Array.isArray(tab.columns)) {
    return [];
  }
  return tab.columns.map(function (column) { return column.key; });
}

function labelsOf_(tab) {
  if (!tab || !Array.isArray(tab.columns)) {
    return [];
  }
  return tab.columns.map(function (column) { return column.label; });
}

function notesOf_(tab) {
  if (!tab || !Array.isArray(tab.columns)) {
    return [];
  }
  return tab.columns.map(function (column) { return column.note || ''; });
}

function classNames_() {
  return CLASS_SPECS.map(function (entry) { return entry.name; });
}

// 0-based column index by stable key; throws on a typo so a wrong column is never read.
function columnOf_(tab, key) {
  if (!tab || !Array.isArray(tab.columns)) {
    throw new Error('columnOf_ requires a tab definition with columns.');
  }

  var keys = keysOf_(tab);
  var index = keys.indexOf(key);
  if (index === -1) {
    throw new Error('Unknown column key "' + key + '" in tab "' + tab.name + '".');
  }

  return index;
}
