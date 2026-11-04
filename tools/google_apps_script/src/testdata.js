// Menu actions: fill the workbook with TBC test data to preview the raider portal, then remove exactly what was added.
// What was added (raiders, items per Objets tab, raids) is kept in the document properties so the clear never touches real rows.

var TEST_DATA_PROPERTY = 'parsimonie-test-data';

// Fantasy names, unlikely to clash with a real guild; the fill refuses if one is already in Roster.
var TEST_RAIDERS = [
  'Aelwynn', 'Brakmor', 'Celesthra', 'Dornak', 'Elyndra', 'Faelith', 'Grimbolt', 'Hestara', 'Ithrion', 'Jorvak',
  'Kaelyss', 'Lunara', 'Morgrim', 'Nymeria', 'Orthak', 'Peryn', 'Quelith', 'Rhogar', 'Sylvanna', 'Thaldrin'
];

// BiS lists of the ZA phase from wowtbc.gg (item IDs from Wowhead), one entry per item with the specs that list it.
// No Discipline list there: Discipline uses the Holy priest one (see TEST_SPEC_ALIASES).
var TEST_ITEMS = [
  { id: 32521, name: 'Faceplate of the Impenetrable', slot: 'Tête', specs: ['Guerrier Protection', 'Paladin Protection'] },
  { id: 33296, name: 'Brooch of Deftness', slot: 'Cou', specs: ['Guerrier Protection', 'Druide Combat farouche (ours)'] },
  { id: 30979, name: 'Onslaught Shoulderblades', slot: 'Épaules', specs: ['Guerrier Protection', 'Guerrier Armes', 'Guerrier Fureur'] },
  { id: 33484, name: 'Dory\'s Embrace', slot: 'Dos', specs: ['Guerrier Protection'] },
  { id: 30975, name: 'Onslaught Breastplate', slot: 'Torse', specs: ['Guerrier Protection', 'Guerrier Armes', 'Guerrier Fureur'] },
  { id: 33516, name: 'Bracers of the Ancient Phalanx', slot: 'Poignets', specs: ['Guerrier Protection'] },
  { id: 32280, name: 'Gauntlets of Enforcement', slot: 'Mains', specs: ['Guerrier Protection'] },
  { id: 33811, name: 'Vindicator\'s Plate Belt', slot: 'Taille', specs: ['Guerrier Protection'] },
  { id: 30977, name: 'Onslaught Greaves', slot: 'Jambes', specs: ['Guerrier Protection'] },
  { id: 33812, name: 'Vindicator\'s Plate Greaves', slot: 'Pieds', specs: ['Guerrier Protection'] },
  { id: 33496, name: 'Signet of Primal Wrath', slot: 'Doigt', specs: ['Guerrier Protection', 'Guerrier Armes', 'Guerrier Fureur', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 33919, name: 'Vindicator\'s Band of Triumph', slot: 'Doigt', specs: ['Guerrier Protection'] },
  { id: 28121, name: 'Icon of Unyielding Courage', slot: 'Bijou', specs: ['Guerrier Protection'] },
  { id: 33831, name: 'Berserker\'s Call', slot: 'Bijou', specs: ['Guerrier Protection', 'Druide Combat farouche (ours)', 'Guerrier Armes', 'Guerrier Fureur', 'Paladin Vindicte', 'Chaman Amélioration', 'Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 32254, name: 'The Brutalizer', slot: 'Arme', specs: ['Guerrier Protection'] },
  { id: 32375, name: 'Bulwark of Azzinoth', slot: 'Main gauche', specs: ['Guerrier Protection', 'Paladin Protection'] },
  { id: 32253, name: 'Legionkiller', slot: 'Distance', specs: ['Guerrier Protection'] },
  { id: 33921, name: 'Vindicator\'s Pendant of Dominance', slot: 'Cou', specs: ['Paladin Protection'] },
  { id: 30998, name: 'Lightbringer Shoulderguards', slot: 'Épaules', specs: ['Paladin Protection'] },
  { id: 29925, name: 'Phoenix-Wing Cloak', slot: 'Dos', specs: ['Paladin Protection'] },
  { id: 30991, name: 'Lightbringer Chestguard', slot: 'Torse', specs: ['Paladin Protection'] },
  { id: 32279, name: 'The Seeker\'s Wristguards', slot: 'Poignets', specs: ['Paladin Protection'] },
  { id: 30985, name: 'Lightbringer Handguards', slot: 'Mains', specs: ['Paladin Protection'] },
  { id: 32342, name: 'Girdle of Mighty Resolve', slot: 'Taille', specs: ['Paladin Protection'] },
  { id: 30995, name: 'Lightbringer Legguards', slot: 'Jambes', specs: ['Paladin Protection'] },
  { id: 32245, name: 'Tide-Stomper\'s Greaves', slot: 'Pieds', specs: ['Paladin Protection'] },
  { id: 33054, name: 'The Seal of Danzalar', slot: 'Doigt', specs: ['Paladin Protection'] },
  { id: 29172, name: 'Ashyen\'s Gift', slot: 'Doigt', specs: ['Paladin Protection'] },
  { id: 33829, name: 'Hex Shrunken Head', slot: 'Bijou', specs: ['Paladin Protection', 'Mage Arcanes', 'Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 30447, name: 'Tome of Fiery Redemption', slot: 'Bijou', specs: ['Paladin Protection'] },
  { id: 30910, name: 'Tempest of Chaos', slot: 'Arme', specs: ['Paladin Protection', 'Mage Arcanes'] },
  { id: 27917, name: 'Libram of the Eternal Rest', slot: 'Relique', specs: ['Paladin Protection'] },
  { id: 33672, name: 'Vengeful Gladiator\'s Dragonhide Helm', slot: 'Tête', specs: ['Druide Combat farouche (ours)'] },
  { id: 31048, name: 'Thunderheart Pauldrons', slot: 'Épaules', specs: ['Druide Combat farouche (ours)', 'Druide Combat farouche (félin)'] },
  { id: 33593, name: 'Slikk\'s Cloak of Placation', slot: 'Dos', specs: ['Druide Combat farouche (ours)'] },
  { id: 31042, name: 'Thunderheart Chestguard', slot: 'Torse', specs: ['Druide Combat farouche (ours)', 'Druide Combat farouche (félin)'] },
  { id: 33881, name: 'Vindicator\'s Dragonhide Bracers', slot: 'Poignets', specs: ['Druide Combat farouche (ours)'] },
  { id: 31034, name: 'Thunderheart Gauntlets', slot: 'Mains', specs: ['Druide Combat farouche (ours)', 'Druide Combat farouche (félin)'] },
  { id: 30106, name: 'Belt of One-Hundred Deaths', slot: 'Taille', specs: ['Druide Combat farouche (ours)', 'Guerrier Armes', 'Guerrier Fureur', 'Paladin Vindicte', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Druide Combat farouche (félin)'] },
  { id: 31044, name: 'Thunderheart Leggings', slot: 'Jambes', specs: ['Druide Combat farouche (ours)', 'Druide Combat farouche (félin)'] },
  { id: 33880, name: 'Vindicator\'s Dragonhide Boots', slot: 'Pieds', specs: ['Druide Combat farouche (ours)'] },
  { id: 29279, name: 'Violet Signet of the Great Protector', slot: 'Doigt', specs: ['Druide Combat farouche (ours)'] },
  { id: 30834, name: 'Shapeshifter\'s Signet', slot: 'Doigt', specs: ['Druide Combat farouche (ours)', 'Paladin Vindicte'] },
  { id: 32658, name: 'Badge of Tenacity', slot: 'Bijou', specs: ['Druide Combat farouche (ours)'] },
  { id: 30883, name: 'Pillar of Ferocity', slot: 'Arme', specs: ['Druide Combat farouche (ours)'] },
  { id: 32387, name: 'Idol of the Raven Goddess', slot: 'Relique', specs: ['Druide Combat farouche (ours)', 'Druide Équilibre'] },
  { id: 30988, name: 'Lightbringer Greathelm', slot: 'Tête', specs: ['Paladin Sacré'] },
  { id: 33281, name: 'Brooch of Nature\'s Mercy', slot: 'Cou', specs: ['Paladin Sacré', 'Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration', 'Mage Arcanes', 'Mage Givre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 30996, name: 'Lightbringer Pauldrons', slot: 'Épaules', specs: ['Paladin Sacré'] },
  { id: 32524, name: 'Shroud of the Highborne', slot: 'Dos', specs: ['Paladin Sacré', 'Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Chaman Élémentaire'] },
  { id: 30992, name: 'Lightbringer Chestpiece', slot: 'Torse', specs: ['Paladin Sacré'] },
  { id: 32571, name: 'Dawnsteel Bracers', slot: 'Poignets', specs: ['Paladin Sacré'] },
  { id: 32328, name: 'Botanist\'s Gloves of Growth', slot: 'Mains', specs: ['Paladin Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 32258, name: 'Naturalist\'s Preserving Cinch', slot: 'Taille', specs: ['Paladin Sacré', 'Chaman Restauration'] },
  { id: 30994, name: 'Lightbringer Leggings', slot: 'Jambes', specs: ['Paladin Sacré'] },
  { id: 33324, name: 'Treads of the Life Path', slot: 'Pieds', specs: ['Paladin Sacré', 'Chaman Restauration'] },
  { id: 29309, name: 'Band of the Eternal Restorer', slot: 'Doigt', specs: ['Paladin Sacré', 'Druide Restauration'] },
  { id: 33498, name: 'Signet of the Quiet Forest', slot: 'Doigt', specs: ['Paladin Sacré', 'Prêtre Sacré', 'Chaman Restauration'] },
  { id: 32496, name: 'Memento of Tyrande', slot: 'Bijou', specs: ['Paladin Sacré', 'Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 29376, name: 'Essence of the Martyr', slot: 'Bijou', specs: ['Paladin Sacré', 'Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 32255, name: 'Felstone Bulwark', slot: 'Main gauche', specs: ['Paladin Sacré'] },
  { id: 25644, name: 'Blessed Book of Nagrand', slot: 'Relique', specs: ['Paladin Sacré'] },
  { id: 31063, name: 'Cowl of Absolution', slot: 'Tête', specs: ['Prêtre Sacré'] },
  { id: 31069, name: 'Mantle of Absolution', slot: 'Épaules', specs: ['Prêtre Sacré'] },
  { id: 31066, name: 'Vestments of Absolution', slot: 'Torse', specs: ['Prêtre Sacré'] },
  { id: 32584, name: 'Swiftheal Wraps', slot: 'Poignets', specs: ['Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 31060, name: 'Gloves of Absolution', slot: 'Mains', specs: ['Prêtre Sacré'] },
  { id: 30895, name: 'Angelista\'s Sash', slot: 'Taille', specs: ['Prêtre Sacré'] },
  { id: 30912, name: 'Leggings of Eternity', slot: 'Jambes', specs: ['Prêtre Sacré', 'Druide Restauration'] },
  { id: 32609, name: 'Boots of the Divine Light', slot: 'Pieds', specs: ['Prêtre Sacré', 'Druide Restauration'] },
  { id: 32528, name: 'Blessed Band of Karabor', slot: 'Doigt', specs: ['Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 32500, name: 'Crystal Spire of Karabor', slot: 'Arme', specs: ['Prêtre Sacré', 'Chaman Restauration', 'Druide Restauration'] },
  { id: 30911, name: 'Scepter of Purification', slot: 'Main gauche', specs: ['Prêtre Sacré', 'Druide Restauration'] },
  { id: 32363, name: 'Naaru-Blessed Life Rod', slot: 'Distance', specs: ['Prêtre Sacré'] },
  { id: 31012, name: 'Skyshatter Helmet', slot: 'Tête', specs: ['Chaman Restauration'] },
  { id: 31022, name: 'Skyshatter Shoulderpads', slot: 'Épaules', specs: ['Chaman Restauration'] },
  { id: 31016, name: 'Skyshatter Chestguard', slot: 'Torse', specs: ['Chaman Restauration'] },
  { id: 31019, name: 'Skyshatter Leggings', slot: 'Jambes', specs: ['Chaman Restauration'] },
  { id: 30882, name: 'Bastion of Light', slot: 'Main gauche', specs: ['Chaman Restauration'] },
  { id: 28523, name: 'Totem of Healing Rains', slot: 'Relique', specs: ['Chaman Restauration'] },
  { id: 31037, name: 'Thunderheart Helmet', slot: 'Tête', specs: ['Druide Restauration'] },
  { id: 31047, name: 'Thunderheart Spaulders', slot: 'Épaules', specs: ['Druide Restauration'] },
  { id: 31041, name: 'Thunderheart Tunic', slot: 'Torse', specs: ['Druide Restauration'] },
  { id: 32339, name: 'Belt of Primal Majesty', slot: 'Taille', specs: ['Druide Restauration'] },
  { id: 27886, name: 'Idol of the Emerald Queen', slot: 'Relique', specs: ['Druide Restauration'] },
  { id: 30972, name: 'Onslaught Battle-Helm', slot: 'Tête', specs: ['Guerrier Armes'] },
  { id: 32591, name: 'Choker of Serrated Blades', slot: 'Cou', specs: ['Guerrier Armes'] },
  { id: 32323, name: 'Shadowmoon Destroyer\'s Drape', slot: 'Dos', specs: ['Guerrier Armes', 'Guerrier Fureur', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration'] },
  { id: 33513, name: 'Eternium Rage-shackles', slot: 'Poignets', specs: ['Guerrier Armes'] },
  { id: 30969, name: 'Onslaught Gauntlets', slot: 'Mains', specs: ['Guerrier Armes'] },
  { id: 32341, name: 'Leggings of Divine Retribution', slot: 'Jambes', specs: ['Guerrier Armes', 'Guerrier Fureur'] },
  { id: 32345, name: 'Dreadboots of the Legion', slot: 'Pieds', specs: ['Guerrier Armes', 'Guerrier Fureur'] },
  { id: 32497, name: 'Stormrage Signet Ring', slot: 'Doigt', specs: ['Guerrier Armes', 'Guerrier Fureur', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 28830, name: 'Dragonspine Trophy', slot: 'Bijou', specs: ['Guerrier Armes', 'Guerrier Fureur', 'Paladin Vindicte', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 30902, name: 'Cataclysm\'s Edge', slot: 'Arme', specs: ['Guerrier Armes'] },
  { id: 33474, name: 'Ancient Amani Longbow', slot: 'Distance', specs: ['Guerrier Armes', 'Guerrier Fureur'] },
  { id: 32235, name: 'Cursed Vision of Sargeras', slot: 'Tête', specs: ['Guerrier Fureur', 'Paladin Vindicte', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 32260, name: 'Choker of Endless Nightmares', slot: 'Cou', specs: ['Guerrier Fureur', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 30863, name: 'Deadly Cuffs', slot: 'Poignets', specs: ['Guerrier Fureur', 'Chaman Amélioration'] },
  { id: 32278, name: 'Grips of Silent Justice', slot: 'Mains', specs: ['Guerrier Fureur'] },
  { id: 32837, name: 'Warglaive of Azzinoth', slot: 'Arme', specs: ['Guerrier Fureur', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 32838, name: 'Warglaive of Azzinoth', slot: 'Main gauche', specs: ['Guerrier Fureur', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 30022, name: 'Pendant of the Perilous', slot: 'Cou', specs: ['Paladin Vindicte'] },
  { id: 30055, name: 'Shoulderpads of the Stranger', slot: 'Épaules', specs: ['Paladin Vindicte'] },
  { id: 33590, name: 'Cloak of Fiends', slot: 'Dos', specs: ['Paladin Vindicte'] },
  { id: 30905, name: 'Midnight Chestguard', slot: 'Torse', specs: ['Paladin Vindicte', 'Chaman Amélioration'] },
  { id: 32574, name: 'Bindings of Lightning Reflexes', slot: 'Poignets', specs: ['Paladin Vindicte'] },
  { id: 29947, name: 'Gloves of the Searing Grip', slot: 'Mains', specs: ['Paladin Vindicte'] },
  { id: 30900, name: 'Bow-Stitched Leggings', slot: 'Jambes', specs: ['Paladin Vindicte', 'Chaman Amélioration', 'Chasseur Survie'] },
  { id: 32366, name: 'Shadowmaster\'s Boots', slot: 'Pieds', specs: ['Paladin Vindicte', 'Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Chaman Amélioration', 'Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 32335, name: 'Unstoppable Aggressor\'s Ring', slot: 'Doigt', specs: ['Paladin Vindicte'] },
  { id: 32332, name: 'Torch of the Damned', slot: 'Arme', specs: ['Paladin Vindicte'] },
  { id: 27484, name: 'Libram of Avengement', slot: 'Relique', specs: ['Paladin Vindicte'] },
  { id: 31030, name: 'Slayer\'s Shoulderpads', slot: 'Épaules', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 31028, name: 'Slayer\'s Chestguard', slot: 'Torse', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 32324, name: 'Insidious Bands', slot: 'Poignets', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse', 'Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 31026, name: 'Slayer\'s Handguards', slot: 'Mains', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 31029, name: 'Slayer\'s Legguards', slot: 'Jambes', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 30450, name: 'Warp-Spring Coil', slot: 'Bijou', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 32471, name: 'Shard of Azzinoth', slot: 'Arme', specs: ['Voleur Assassinat'] },
  { id: 30901, name: 'Boundless Agony', slot: 'Main gauche', specs: ['Voleur Assassinat'] },
  { id: 29949, name: 'Arcanite Steam-Pistol', slot: 'Distance', specs: ['Voleur Assassinat', 'Voleur Combat', 'Voleur Finesse'] },
  { id: 32581, name: 'Swiftstrike Shoulders', slot: 'Épaules', specs: ['Chaman Amélioration'] },
  { id: 32234, name: 'Fists of Mukoa', slot: 'Mains', specs: ['Chaman Amélioration'] },
  { id: 32262, name: 'Syphon of the Nathrezim', slot: 'Arme', specs: ['Chaman Amélioration'] },
  { id: 33507, name: 'Stonebreaker\'s Totem', slot: 'Relique', specs: ['Chaman Amélioration'] },
  { id: 30017, name: 'Telonicus\'s Pendant of Mayhem', slot: 'Cou', specs: ['Druide Combat farouche (félin)', 'Chasseur Survie'] },
  { id: 29994, name: 'Thalassian Wildercloak', slot: 'Dos', specs: ['Druide Combat farouche (félin)', 'Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 29301, name: 'Band of the Eternal Champion', slot: 'Doigt', specs: ['Druide Combat farouche (félin)', 'Chasseur Survie'] },
  { id: 32505, name: 'Madness of the Betrayer', slot: 'Bijou', specs: ['Druide Combat farouche (félin)'] },
  { id: 33465, name: 'Staff of Primal Fury', slot: 'Arme', specs: ['Druide Combat farouche (félin)'] },
  { id: 29390, name: 'Everbloom Idol', slot: 'Relique', specs: ['Druide Combat farouche (félin)'] },
  { id: 31006, name: 'Gronnstalker\'s Spaulders', slot: 'Épaules', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 31004, name: 'Gronnstalker\'s Chestguard', slot: 'Torse', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 31001, name: 'Gronnstalker\'s Gloves', slot: 'Mains', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 30879, name: 'Don Alejandro\'s Money Belt', slot: 'Taille', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 31005, name: 'Gronnstalker\'s Leggings', slot: 'Jambes', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 29993, name: 'Twinblade of the Phoenix', slot: 'Arme', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision'] },
  { id: 30906, name: 'Bristleblitz Striker', slot: 'Distance', specs: ['Chasseur Maîtrise des bêtes', 'Chasseur Précision', 'Chasseur Survie'] },
  { id: 31003, name: 'Gronnstalker\'s Helmet', slot: 'Tête', specs: ['Chasseur Survie'] },
  { id: 30040, name: 'Belt of Deep Shadow', slot: 'Taille', specs: ['Chasseur Survie'] },
  { id: 33492, name: 'Trollbane', slot: 'Arme', specs: ['Chasseur Survie'] },
  { id: 30206, name: 'Cowl of Tirisfal', slot: 'Tête', specs: ['Mage Arcanes'] },
  { id: 30210, name: 'Mantle of Tirisfal', slot: 'Épaules', specs: ['Mage Arcanes'] },
  { id: 32331, name: 'Cloak of the Illidari Council', slot: 'Dos', specs: ['Mage Arcanes', 'Mage Feu', 'Mage Givre', 'Druide Équilibre'] },
  { id: 30196, name: 'Robes of Tirisfal', slot: 'Torse', specs: ['Mage Arcanes'] },
  { id: 30870, name: 'Cuffs of Devastation', slot: 'Poignets', specs: ['Mage Arcanes'] },
  { id: 30205, name: 'Gloves of Tirisfal', slot: 'Mains', specs: ['Mage Arcanes'] },
  { id: 30888, name: 'Anetheron\'s Noose', slot: 'Taille', specs: ['Mage Arcanes', 'Mage Feu', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Druide Équilibre'] },
  { id: 30916, name: 'Leggings of Channeled Elements', slot: 'Jambes', specs: ['Mage Arcanes', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 32239, name: 'Slippers of the Seacaller', slot: 'Pieds', specs: ['Mage Arcanes', 'Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 29305, name: 'Band of the Eternal Sage', slot: 'Doigt', specs: ['Mage Arcanes'] },
  { id: 32527, name: 'Ring of Ancient Knowledge', slot: 'Doigt', specs: ['Mage Arcanes', 'Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 30720, name: 'Serpent-Coil Braid', slot: 'Bijou', specs: ['Mage Arcanes'] },
  { id: 30872, name: 'Chronicle of Dark Secrets', slot: 'Main gauche', specs: ['Mage Arcanes'] },
  { id: 33192, name: 'Carved Witch Doctor\'s Stick', slot: 'Distance', specs: ['Mage Arcanes', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre'] },
  { id: 32525, name: 'Cowl of the Illidari High Lord', slot: 'Tête', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 32589, name: 'Hellfire-Encased Pendant', slot: 'Cou', specs: ['Mage Feu'] },
  { id: 31059, name: 'Mantle of the Tempest', slot: 'Épaules', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 31057, name: 'Robes of the Tempest', slot: 'Torse', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 32586, name: 'Bracers of Nimble Thought', slot: 'Poignets', specs: ['Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 31055, name: 'Gloves of the Tempest', slot: 'Mains', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 31058, name: 'Leggings of the Tempest', slot: 'Jambes', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 32483, name: 'The Skull of Gul\'dan', slot: 'Bijou', specs: ['Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 32374, name: 'Zhar\'doom, Greatstaff of the Devourer', slot: 'Arme', specs: ['Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Équilibre'] },
  { id: 29982, name: 'Wand of the Forgotten Star', slot: 'Distance', specs: ['Mage Feu', 'Mage Givre'] },
  { id: 32256, name: 'Waistwrap of Infinity', slot: 'Taille', specs: ['Mage Givre', 'Prêtre Ombre'] },
  { id: 31051, name: 'Hood of the Malefic', slot: 'Tête', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 32349, name: 'Translucent Spellthread Necklace', slot: 'Cou', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 31054, name: 'Mantle of the Malefic', slot: 'Épaules', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 30107, name: 'Vestments of the Sea-Witch', slot: 'Torse', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 31050, name: 'Gloves of the Malefic', slot: 'Mains', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 31053, name: 'Leggings of the Malefic', slot: 'Jambes', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 33497, name: 'Mana Attuned Band', slot: 'Doigt', specs: ['Démoniste Affliction', 'Démoniste Démonologie', 'Démoniste Destruction'] },
  { id: 31064, name: 'Hood of Absolution', slot: 'Tête', specs: ['Prêtre Ombre'] },
  { id: 33466, name: 'Loop of Cursed Bones', slot: 'Cou', specs: ['Prêtre Ombre'] },
  { id: 31070, name: 'Shoulderpads of Absolution', slot: 'Épaules', specs: ['Prêtre Ombre'] },
  { id: 32590, name: 'Nethervoid Cloak', slot: 'Dos', specs: ['Prêtre Ombre'] },
  { id: 31065, name: 'Shroud of Absolution', slot: 'Torse', specs: ['Prêtre Ombre'] },
  { id: 31061, name: 'Handguards of Absolution', slot: 'Mains', specs: ['Prêtre Ombre'] },
  { id: 21870, name: 'Frozen Shadoweave Boots', slot: 'Pieds', specs: ['Prêtre Ombre'] },
  { id: 31014, name: 'Skyshatter Headguard', slot: 'Tête', specs: ['Chaman Élémentaire'] },
  { id: 31023, name: 'Skyshatter Mantle', slot: 'Épaules', specs: ['Chaman Élémentaire'] },
  { id: 31017, name: 'Skyshatter Breastplate', slot: 'Torse', specs: ['Chaman Élémentaire'] },
  { id: 31008, name: 'Skyshatter Gauntlets', slot: 'Mains', specs: ['Chaman Élémentaire'] },
  { id: 32276, name: 'Flashfire Girdle', slot: 'Taille', specs: ['Chaman Élémentaire'] },
  { id: 32330, name: 'Totem of Ancestral Guidance', slot: 'Relique', specs: ['Chaman Élémentaire'] },
  { id: 31040, name: 'Thunderheart Headguard', slot: 'Tête', specs: ['Druide Équilibre'] },
  { id: 31049, name: 'Thunderheart Shoulderpads', slot: 'Épaules', specs: ['Druide Équilibre'] },
  { id: 31043, name: 'Thunderheart Vest', slot: 'Torse', specs: ['Druide Équilibre'] },
  { id: 31035, name: 'Thunderheart Handguards', slot: 'Mains', specs: ['Druide Équilibre'] }
];

var TEST_SPEC_ALIASES = { 'Prêtre Discipline': 'Prêtre Sacré' };

// Oldest first; the IDs carry a "test-" prefix so they never collide with Raid > Démarrer IDs.
var TEST_RAIDS = ['Black Temple', 'Mount Hyjal', 'Zul\'Aman', 'Black Temple', 'Mount Hyjal', 'Sunwell Plateau'];


function fillTestData() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(fillTestData_());
  } catch (error) {
    ui.alert('Données de test impossibles :\n' + error.message);
  }
}

function clearTestData() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert(clearTestData_());
  } catch (error) {
    ui.alert('Effacement des données de test impossible :\n' + error.message);
  }
}

// Three steps, each one batch: input rows, then a refresh (raider columns in Présence/Awards), then raids and loots.
function fillTestData_() {
  var properties = PropertiesService.getDocumentProperties();
  if (properties.getProperty(TEST_DATA_PROPERTY)) {
    throw new Error('Des données de test sont déjà en place. Effacez-les d\'abord (Données de test > Effacer).');
  }

  var record = { raiders: TEST_RAIDERS.slice(), items: {}, raids: [] };
  var raids = [];

  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var configTab = tabByName_('Config');
    var configRow = requireCurrentLayout_(snapshotSheet_(spreadsheet, 'Config').getDataRange().getValues(), 'Config')[1] || [];
    if (normalizeCellString_(configRow[columnOf_(configTab, 'openRaidId')]).trim()) {
      throw new Error('Un raid est démarré : terminez-le ou annulez-le d\'abord.');
    }
    var tierId = normalizeCellString_(configRow[columnOf_(configTab, 'tierId')]).trim();
    raids = testRaidPlan_(dateSerialFromCell_(configRow[columnOf_(configTab, 'bisWindowStart')]), dateSerialFromCell_(new Date()));
    record.raids = raids.map(function (raid) { return raid.raidId; });

    return buildTestRosterRequests_(spreadsheet)
      .concat(buildTestItemRequests_(spreadsheet, record.items))
      .concat(buildTestRaidsRequests_(spreadsheet, raids, tierId));
  });

  // Saved before the next steps so a failure there can still be cleared.
  properties.setProperty(TEST_DATA_PROPERTY, JSON.stringify(record));

  refreshWorkbook_();

  var awardCount = 0;
  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    var built = buildTestRaidRowsRequests_(spreadsheet, raids);
    awardCount = built.awardCount;
    return built.requests;
  });

  return 'Données de test ajoutées : ' + TEST_RAIDERS.length + ' raiders, ' + TEST_ITEMS.length + ' objets TBC, ' +
    raids.length + ' raids et ' + awardCount + ' loots.\nLe portail les montre sous une minute. Données de test > Effacer les retire.';
}

// Removes the recorded raids, the test raiders (Roster rows and their Présence/Awards columns) and the added item rows.
function clearTestData_() {
  var properties = PropertiesService.getDocumentProperties();
  var stored = properties.getProperty(TEST_DATA_PROPERTY);
  if (!stored) {
    return 'Aucune donnée de test à effacer.';
  }
  var record = JSON.parse(stored);

  // One read, one batch: row deletions first, then the raider columns (row deletions never move columns).
  applyBatch_(function () {
    var spreadsheet = SpreadsheetApp.getActive();
    return buildTestRaidDeleteRequests_(spreadsheet, record.raids || [])
      .concat(buildTestClearRequests_(spreadsheet, record));
  });

  refreshWorkbook_();
  properties.deleteProperty(TEST_DATA_PROPERTY);
  return 'Données de test effacées.';
}

// Raid dates spread from the later of the tier start and five weeks ago, up to yesterday.
function testRaidPlan_(tierStartSerial, todaySerial) {
  var start = todaySerial - 35;
  if (tierStartSerial !== null && tierStartSerial > start) {
    start = tierStartSerial;
  }
  var end = Math.max(start, todaySerial - 1);
  return TEST_RAIDS.map(function (instance, index) {
    return {
      raidId: 'test-' + (index + 1),
      instance: instance,
      dateSerial: start + Math.floor((end - start) * index / (TEST_RAIDS.length - 1))
    };
  });
}

// Test raiders below the last Roster name: Raider, Groupe, Classe, Spé, then the parse (Rôle stays a formula).
function buildTestRosterRequests_(spreadsheet) {
  var sheet = snapshotSheet_(spreadsheet, 'Roster');
  var rows = requireCurrentLayout_(sheet.getDataRange().getValues(), 'Roster');
  var tab = tabByName_('Roster');
  var nameColumn = columnOf_(tab, 'raiderKey');
  var lastNamed = 0;
  var existing = Object.create(null);
  for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    var name = normalizeCellString_((rows[rowIndex] || [])[nameColumn]).trim();
    if (name) {
      lastNamed = rowIndex;
      existing[name] = true;
    }
  }
  var clashes = TEST_RAIDERS.filter(function (name) { return existing[name]; });
  if (clashes.length) {
    throw new Error('Ces noms de test sont déjà dans le Roster : ' + clashes.join(', ') + '.');
  }
  // Roster formulas cover rows 2 to 201.
  if (lastNamed + TEST_RAIDERS.length > 200) {
    throw new Error('Pas assez de lignes libres dans le Roster pour ' + TEST_RAIDERS.length + ' raiders de test.');
  }

  var first = lastNamed + 1;
  var identity = TEST_RAIDERS.map(function (name, index) {
    var spec = SPEC_COLUMNS[index % SPEC_COLUMNS.length];
    return { values: [name, RAID_GROUPS[index % 2], spec.className, spec.spec].map(function (value) {
      return { userEnteredValue: { stringValue: value } };
    }) };
  });
  var parses = TEST_RAIDERS.map(function (name, index) {
    return { values: [{ userEnteredValue: { numberValue: 30 + (index * 17) % 70 } }] };
  });
  return [
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: first, columnIndex: nameColumn }, rows: identity, fields: 'userEnteredValue' } },
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: first, columnIndex: columnOf_(tab, 'dpsParse') }, rows: parses, fields: 'userEnteredValue' } }
  ];
}

// Test items below the last row of each Objets tab, skipping IDs already listed there; addedByTab records what was written.
function buildTestItemRequests_(spreadsheet, addedByTab) {
  var requests = [];
  ITEM_TABS.forEach(function (itemTab) {
    var sheet = snapshotSheet_(spreadsheet, itemTab.name);
    var rows = sheet.getDataRange().getValues();
    var existing = Object.create(null);
    var last = 2;
    for (var rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      var id = parseInteger_((rows[rowIndex] || [])[0]);
      if (id !== null) {
        existing[id] = true;
        last = rowIndex;
      }
    }
    var specs = SPEC_COLUMNS.filter(function (spec) { return spec.role === itemTab.role; });
    var items = TEST_ITEMS.filter(function (item) {
      return !existing[item.id] && specs.some(function (spec) { return testStatut_(item, spec); });
    });
    addedByTab[itemTab.name] = items.map(function (item) { return item.id; });
    if (!items.length) {
      return;
    }
    requests.push({
      updateCells: {
        start: { sheetId: sheet.getSheetId(), rowIndex: last + 1, columnIndex: 0 },
        rows: items.map(function (item) {
          var values = [
            { userEnteredValue: { numberValue: item.id } },
            { userEnteredValue: { stringValue: item.name } },
            { userEnteredValue: { stringValue: item.slot } }
          ];
          specs.forEach(function (spec, specIndex) {
            var statut = testStatut_(item, spec);
            values.push(statut ? { userEnteredValue: { stringValue: statut } } : {});
            values.push(statut === 'IMPACT' ? { userEnteredValue: { numberValue: 10 + (TEST_ITEMS.indexOf(item) * 7 + specIndex * 11) % 70 } } : {});
          });
          return { values: values };
        }),
        fields: 'userEnteredValue'
      }
    });
  });
  return requests;
}

// BIS for the specs whose list has the item, one in three of them IMPACT instead (never for tanks); '' otherwise.
function testStatut_(item, spec) {
  if (item.specs.indexOf(TEST_SPEC_ALIASES[spec.label] || spec.label) === -1) {
    return '';
  }
  return spec.role !== 'Tank' && (TEST_ITEMS.indexOf(item) + SPEC_COLUMNS.indexOf(spec)) % 3 === 0 ? 'IMPACT' : 'BIS';
}

// Raids rows: Raid (ID), Instance, Date du raid, then the active tier.
function buildTestRaidsRequests_(spreadsheet, raids, tierId) {
  var sheet = snapshotSheet_(spreadsheet, 'Raids');
  var rows = requireCurrentLayout_(sheet.getDataRange().getValues(), 'Raids');
  var tab = tabByName_('Raids');
  return raids.map(function (raid, index) {
    var values = [];
    values[columnOf_(tab, 'raidId')] = { userEnteredValue: { stringValue: raid.raidId } };
    values[columnOf_(tab, 'instance')] = { userEnteredValue: { stringValue: raid.instance } };
    values[columnOf_(tab, 'raidDate')] = { userEnteredValue: { numberValue: raid.dateSerial }, userEnteredFormat: { numberFormat: { type: 'DATE' } } };
    values[columnOf_(tab, 'raidTier')] = tierId ? { userEnteredValue: { stringValue: tierId } } : {};
    for (var i = 0; i < values.length; i += 1) {
      values[i] = values[i] || {};
    }
    return {
      updateCells: {
        start: { sheetId: sheet.getSheetId(), rowIndex: rows.length + index, columnIndex: 0 },
        rows: [{ values: values }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat'
      }
    };
  });
}

// Présence rows (1 present, B bench, blank absent) and Awards loots, once the raider columns exist.
function buildTestRaidRowsRequests_(spreadsheet, raids) {
  var presenceSheet = snapshotSheet_(spreadsheet, GRID_TABS.presence.name);
  var presenceRows = presenceSheet.getDataRange().getValues();
  var presenceHeader = presenceRows[0] || [];
  var awardsSheet = snapshotSheet_(spreadsheet, GRID_TABS.awards.name);
  var awardsRows = awardsSheet.getDataRange().getValues();
  var requests = [];

  var awardNames = readAwardsBlockNames_(awardsRows).map(function (name) { return normalizeCellString_(name).trim(); });
  var missing = TEST_RAIDERS.filter(function (name) {
    return awardNames.indexOf(name) === -1 || presenceHeader.map(function (value) { return normalizeCellString_(value).trim(); }).indexOf(name) === -1;
  });
  if (missing.length) {
    throw new Error('Les colonnes Présence/Awards des raiders de test n\'ont pas été créées (' + missing.join(', ') +
      '). Données de test > Effacer, puis Remplir à nouveau.');
  }

  raids.forEach(function (raid, raidIndex) {
    var values = [
      { userEnteredValue: { stringValue: raid.raidId } },
      { userEnteredValue: { stringValue: raid.instance } },
      { userEnteredValue: { numberValue: raid.dateSerial }, userEnteredFormat: { numberFormat: { type: 'DATE' } } }
    ];
    for (var column = PRESENCE_FIRST_RAIDER_COLUMN; column < presenceHeader.length; column += 1) {
      var raiderIndex = TEST_RAIDERS.indexOf(normalizeCellString_(presenceHeader[column]).trim());
      var mark = raiderIndex === -1 ? 0 : (raiderIndex * 3 + raidIndex * 5) % 9;
      values.push(raiderIndex === -1 || mark === 0 ? {} : mark === 1 ? { userEnteredValue: { stringValue: 'B' } } : { userEnteredValue: { numberValue: 1 } });
    }
    requests.push({
      updateCells: {
        start: { sheetId: presenceSheet.getSheetId(), rowIndex: presenceRows.length + raidIndex, columnIndex: 0 },
        rows: [{ values: values }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat'
      }
    });
  });

  var blockStartByName = Object.create(null);
  readAwardsBlockNames_(awardsRows).forEach(function (name, index) {
    blockStartByName[normalizeCellString_(name).trim()] = index * AWARDS_BLOCK_WIDTH;
  });
  var nextRowByName = Object.create(null);
  var awardCount = 0;
  raids.forEach(function (raid, raidIndex) {
    for (var k = 0; k < 4; k += 1) {
      var winnerIndex = (raidIndex * 7 + k * 3) % TEST_RAIDERS.length;
      var winner = TEST_RAIDERS[winnerIndex];
      // Same spec as the test Roster row of this raider.
      var spec = SPEC_COLUMNS[winnerIndex % SPEC_COLUMNS.length];
      var wanted = TEST_ITEMS.filter(function (candidate) { return testStatut_(candidate, spec); });
      var blockStart = blockStartByName[winner];
      if (blockStart === undefined || !wanted.length) {
        continue;
      }
      if (nextRowByName[winner] === undefined) {
        nextRowByName[winner] = nextAwardRowIndex_(awardsRows, blockStart);
      }
      // The fourth loot of each raid is an item outside the winner's list, so ALT like the Objets rule gives it.
      var others = TEST_ITEMS.filter(function (candidate) { return !testStatut_(candidate, spec); });
      var item = k === 3 ? others[(raidIndex * 5) % others.length] : wanted[(raidIndex * 3 + k) % wanted.length];
      var award = { itemID: item.id, itemName: item.name, treatment: k === 3 ? 'ALT' : testStatut_(item, spec) };
      requests.push(buildAwardRowWriteRequest_(awardsSheet.getSheetId(), nextRowByName[winner], blockStart, award, raid.raidId, raid.dateSerial));
      nextRowByName[winner] += 1;
      awardCount += 1;
    }
  });

  return { requests: requests, awardCount: awardCount };
}

// Rows of the test raids in Raids, Présence (and archive) and every Awards block (and archive), bottom to top.
function buildTestRaidDeleteRequests_(spreadsheet, raidIds) {
  var isTestRaid = function (value) {
    return raidIds.indexOf(normalizeCellString_(value).trim()) !== -1;
  };
  var matching = function (rows, firstIndex, column) {
    var indexes = [];
    for (var rowIndex = firstIndex; rowIndex < rows.length; rowIndex += 1) {
      if (isTestRaid((rows[rowIndex] || [])[column])) {
        indexes.push(rowIndex);
      }
    }
    return indexes;
  };
  var requests = [];

  var raidsSheet = snapshotSheet_(spreadsheet, 'Raids');
  requests = requests.concat(buildDeleteRowRequests_(raidsSheet.getSheetId(),
    matching(raidsSheet.getDataRange().getValues(), 1, columnOf_(tabByName_('Raids'), 'raidId'))));

  [GRID_TABS.presence.name, ARCHIVE_TABS.presence.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) {
      requests = requests.concat(buildDeleteRowRequests_(sheet.getSheetId(),
        matching(sheet.getDataRange().getValues(), PRESENCE_FIRST_RAID_ROW - 1, PRESENCE_RAID_ID_COLUMN)));
    }
  });

  [GRID_TABS.awards.name, ARCHIVE_TABS.awards.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var rows = sheet.getDataRange().getValues();
    var width = (rows[0] || []).length;
    for (var start = 0; start < width; start += AWARDS_BLOCK_WIDTH) {
      matching(rows, AWARDS_FIRST_ROW - 1, start + AWARDS_RAID_ID_OFFSET).reverse().forEach(function (rowIndex) {
        requests.push({
          deleteRange: {
            range: { sheetId: sheet.getSheetId(), startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: start, endColumnIndex: start + AWARDS_BLOCK_WIDTH },
            shiftDimension: 'ROWS'
          }
        });
      });
    }
  });

  return requests;
}

// Test raider columns (Présence, Awards and their archives), test Roster rows and the added Objets rows; right to left, bottom to top.
function buildTestClearRequests_(spreadsheet, record) {
  var raiders = record.raiders || [];
  var requests = [];

  [GRID_TABS.presence.name, ARCHIVE_TABS.presence.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var header = (sheet.getDataRange().getValues()[0] || []);
    for (var column = header.length - 1; column >= PRESENCE_FIRST_RAIDER_COLUMN; column -= 1) {
      if (raiders.indexOf(normalizeCellString_(header[column]).trim()) !== -1) {
        requests.push({ deleteDimension: { range: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 } } });
      }
    }
  });

  [GRID_TABS.awards.name, ARCHIVE_TABS.awards.name].forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      return;
    }
    var names = readAwardsBlockNames_(sheet.getDataRange().getValues());
    var deletes = [];
    for (var index = names.length - 1; index >= 0; index -= 1) {
      if (raiders.indexOf(normalizeCellString_(names[index]).trim()) !== -1) {
        deletes.push(buildDeleteColumnsRequest_(sheet.getSheetId(), index * AWARDS_BLOCK_WIDTH, AWARDS_BLOCK_WIDTH));
      }
    }
    // Sheets refuses to delete every column: keep one spare when only test blocks are left.
    if (deletes.length * AWARDS_BLOCK_WIDTH >= sheet.getMaxColumns()) {
      requests.push(buildColumnCountRequest_(sheet.getSheetId(), deletes.length * AWARDS_BLOCK_WIDTH + 1));
    }
    requests = requests.concat(deletes);
  });

  var rosterSheet = snapshotSheet_(spreadsheet, 'Roster');
  var rosterRows = rosterSheet.getDataRange().getValues();
  var nameColumn = columnOf_(tabByName_('Roster'), 'raiderKey');
  var rosterIndexes = [];
  for (var rowIndex = 1; rowIndex < rosterRows.length; rowIndex += 1) {
    if (raiders.indexOf(normalizeCellString_((rosterRows[rowIndex] || [])[nameColumn]).trim()) !== -1) {
      rosterIndexes.push(rowIndex);
    }
  }
  requests = requests.concat(buildDeleteRowRequests_(rosterSheet.getSheetId(), rosterIndexes));

  ITEM_TABS.forEach(function (itemTab) {
    var added = (record.items || {})[itemTab.name] || [];
    var sheet = spreadsheet.getSheetByName(itemTab.name);
    if (!sheet || !added.length) {
      return;
    }
    var rows = sheet.getDataRange().getValues();
    var indexes = [];
    for (var index = 3; index < rows.length; index += 1) {
      if (added.indexOf(parseInteger_((rows[index] || [])[0])) !== -1) {
        indexes.push(index);
      }
    }
    requests = requests.concat(buildDeleteRowRequests_(sheet.getSheetId(), indexes));
  });

  return requests;
}
