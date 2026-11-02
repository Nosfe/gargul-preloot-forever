# Kit de test TBC Anniversary

Données prêtes à coller pour tester le classeur et l'addon sur TBC Anniversary : les 28 noms de guilde et 46 objets TBC du snapshot de test de l'addon. Fichiers générés par `node tests/make_anniversary_kit.js` (depuis `tools/google_apps_script`).

| Fichier | À coller dans | Cellule |
|---|---|---|
| `roster-A2.tsv` | Roster (Raider, Groupe, Classe, Spé) | A2 |
| `roster-parse-F2.tsv` | Roster (Parse WCL moyen) | F2 |
| `objets-tank-A4.tsv` | Objets Tank | A4 |
| `objets-heal-A4.tsv` | Objets Heal | A4 |
| `objets-melee-dps-A4.tsv` | Objets Melee DPS | A4 |
| `objets-ranged-dps-A4.tsv` | Objets Ranged DPS | A4 |
| `objets-caster-dps-A4.tsv` | Objets Caster DPS | A4 |

Pour coller : ouvrir le fichier, Ctrl+A, Ctrl+C, cliquer la cellule indiquée, Ctrl+V. Ne rien coller en colonne E du Roster (Rôle est une formule).

## Déroulé

1. **Classeur**
   - Configuration > Rafraîchir le classeur.
   - Configuration > Nouveau palier (ex. `anniversary-test`, date du jour).
   - Coller les fichiers du kit. Les classes tournent : Yajiru est Démoniste Affliction, corriger sa ligne si besoin.
2. **Un objet à soi** : pour voir l'Impact sur soi, ajouter dans l'onglet Objets de son rôle une ligne avec l'ID d'un objet de ses sacs (Wowhead), `IMPACT` et un gain en DPS brut sur sa spé. L'onglet **Classement par objet** montre alors les 5 meilleurs scores Impact de chaque objet ; ce sont ces scores que Gargul affichera.
3. **Addon**
   - Copier `Gargul_Preloot/Gargul_Preloot` dans `Interface/AddOns` du client Anniversary (normalement `World of Warcraft\_anniversary_\`).
   - Supprimer l'ancienne 1.1.0.
4. **Format d'export** : Configuration > Afficher le format d'export Gargul, puis coller la ligne dans Gargul (Export loot > Custom, décocher offspec et disenchanted).
5. **Import (simulé)**
   - Raid > Démarrer, copier le Base64, puis bouton Preloot dans l'Importer de Gargul (ou `/preloot import`).
   - Lancer des rolls Gargul sur des objets de ses sacs, attribuer, choisir le traitement.
6. **Export**
   - Gargul Export loot (Custom), coller dans Raid > Terminer, puis **Prévisualiser le loot** (fonctionne sans log WCL).
   - Pour aller jusqu'au bout de Terminer : un lien de rapport WCL Anniversary (`fresh.warcraftlogs.com/reports/…`) et Configuration > Identifiants WCL renseignés.
7. **Après le test** : Configuration > Réinitialiser tout le classeur.

**Variante addon seul** : importer `tests/addon/payloads/test-snapshot.b64.txt` (raid `test-1`). Son export sera refusé par le classeur ; elle sert seulement à vérifier l'affichage dans l'addon.

## À renvoyer

- Le texte complet de l'export Custom.
- Le message affiché par Raid > Terminer (ou la prévisualisation).
- Tout écart constaté.

Liste détaillée des vérifications en jeu : `_bmad-output/initiative-preloot/epic-raid-companion/story-real-raid-end-to-end-and-release-plan.md` (dépôt preloot-forever).
