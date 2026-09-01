# cipher2-panel

La carte de raccordement du deck : elle porte le Pro Micro sur embases, les
quatre connecteurs des commandes, et rien d'autre.

**100 × 42 mm**, deux couches, 1,6 mm, cuivre 35 µm. Elle se loge dans la bande
libre du boîtier, sous le hub USB, et n'est jamais visible.

## Ce que la carte n'est pas

Elle a d'abord été conçue comme une **façade** portant le bouton, l'encodeur et
le trackball soudés dessus. Le boîtier a tranché autrement : les trois commandes
sont montées dans le plastique, loin les unes des autres, et rejoignent la carte
par câble.

Ce qui reste est un concentrateur. Le circuit occupe un quart de la surface ; le
reste appartient au wordmark.

## La carte est générée, pas dessinée

Un seul fichier, `tools/netlist.py`, énumère les liaisons. Le schéma et la
carte en sont produits par script. Deux générateurs ne peuvent pas diverger
d'une source unique.

**Conséquence pratique : on ne modifie jamais `cipher2-panel.kicad_pcb`.** On
modifie `netlist.py` pour une liaison, `PLACEMENT` pour une position, `ROUTES`
ou `ESCAPES` pour une piste, puis on régénère. Une retouche faite dans
l'interface graphique est perdue à la prochaine exécution, sans avertissement.

```sh
make -C pcb test        # les 58 tests, sans matériel ni KiCad ouvert
make -C pcb board       # schéma + carte + DRC
make -C pcb fab         # tout cela, puis les fichiers de fabrication
make -C pcb render      # vues 3D et couches, dans render/
```

## Brochage

Contractuel : le firmware ne change pas pour s'adapter à la carte.

| Broche | Rôle | Sur la carte |
|---|---|---|
| **D2** | Trackball — SDA | `J1.2` |
| **D3** | Trackball — SCL | `J1.3` |
| **D4** | Contact de l'encodeur | `J3.4` |
| **D5** | Bouton d'éveil | `J4.1` |
| **D7** | Encodeur, voie A | `J3.1` |
| **D8** | Encodeur, voie B | `J3.3` |
| **D9** | LED du bouton, via R1 | `R1` → `J4.3` |

`test/test_pinout.py` lit `arduino/screen_wake/screen_wake.ino` lui-même et
vérifie cette correspondance. Une broche renumérotée dans le croquis fait
échouer les tests au lieu d'arriver sous forme de carte morte.

## Les quatre connecteurs

Toutes les broches sont sérigraphiées sur la carte. Les câbles sont des
liaisons Dupont femelle-femelle, **sans détrompeur** : rien n'empêche une
inversion, et sur le trackball une inversion met 5 V sur la masse du module.
C'est la sérigraphie, et elle seule, qui vous protège.

### `J1` — trackball, 5 points

`+5V · SDA · SCL · INT · GND`, dans l'ordre du connecteur du PIM447. Câble
droit, broche 1 sur broche 1.

**Garder ce câble sous 30 cm.** Le bus I²C tolère mal la capacité, et c'est la
raison pour laquelle la carte est calée à gauche du boîtier, près du trackball,
plutôt qu'à droite près du hub. L'USB, lui, tolère cinq mètres.

### `J3` — encodeur, 5 points

`A · GND · B · SW · GND`. L'EC11 a cinq bornes en deux groupes :

| Broche de la carte | Borne de l'encodeur |
|---|---|
| `A` | une extérieure du groupe de trois |
| `GND` | **celle du milieu du groupe de trois** |
| `B` | l'autre extérieure |
| `SW` | une des deux du groupe de deux |
| `GND` | l'autre |

Les noms de la fiche technique sont `A`, `C`, `B`, `S1`, `S2` ; la carte
affiche ce que chaque broche *est*, parce qu'on la câble un sachet de fils à
la main et pas la fiche technique sous les yeux.

**Une seule chose doit être juste : le milieu du groupe de trois va sur
`GND`.** A et B sont interchangeables — les inverser retourne le sens de
rotation, ce qui se corrige en échangeant deux fils. S1 et S2 n'ont pas de sens.

### `J4` — bouton d'éveil, 4 points

`SW · GND · LED+ · GND`. Le contact n'a pas de polarité ; la LED en a une, et
c'est le seul piège de ce connecteur.

### `J2` — broches libres, 6 points

`D1 · D0 · D6 · D10 · +5V · GND`. D0 et D1 sont la liaison série matérielle,
celle qu'on utilise pour déboguer. Les deux rails permettent de mesurer sans
démonter le module.

Il n'y a **pas de broche de reset** : la carte vit dans un boîtier fermé, et
débrancher l'USB fait le même travail depuis l'extérieur.

## Le Pro Micro est monté à l'envers

Ses barrettes ont été soudées broches vers le haut. Pour l'enficher dans les
embases, il faut le retourner — composants vers la carte — et cela échange ses
deux rangées de broches. **L'empreinte les rééchange**, ce qui rend le montage
correct sans dessouder 24 broches.

Le coût est permanent et il faut le connaître : **un Pro Micro de remplacement
soudé de la façon habituelle ne rentrera pas.** Il faudra soit refaire ses
barrettes broches vers le bas, soit inverser l'empreinte dans
`tools/build_footprints.py`.

La sérigraphie porte `PRO MICRO - COMPONENTS DOWN`. Monté à l'endroit, le
module met **5 V sur la masse du trackball** et le détruit.

**Les embases et les barrettes ne figurent dans aucune nomenclature** : elles
accouplent `U1`, elles ne sont pas des composants du schéma, et `fab/bom.csv`
est généré depuis ce schéma. Leurs références, et la barrette à ne surtout pas
acheter, sont dans [`lib/PARTS.md`](lib/PARTS.md).

Le connecteur USB déborde du bord droit. Une fiche coudée occupe 16 mm au-delà
du bord ; une fiche droite en demande une cinquantaine avec sa courbure.
**Un coudé a un sens** : retourner le module retourne son coude, et en
micro-USB — non réversible — le coude peut venir buter sur la carte.

## Ce qui est dessiné mais non monté

| Repère | Rôle | Pourquoi il est là |
|---|---|---|
| `R2`, `R3` | Rappels I²C 4,7 kΩ | Le PIM447 embarque les siens. Mais le bus sort désormais de la carte sur un câble, et sa capacité augmente : ces deux emplacements ont plus de chances de servir qu'à l'époque où le module était à 10 mm |
| `SJ1` | Pont à souder, ouvert | Relie l'interruption du trackball à **D14**, qui porte `PCINT3`. Le firmware interroge le module en boucle et n'en a pas besoin ; le fermer réserve D14 au trackball |

`R2` et `R3` figurent dans `fab/bom-full.csv` marquées `DNP` — ce sont des
pièces achetables qu'on choisit de ne pas monter. `SJ1` n'y figure pas : un
pont à souder est du cuivre, pas une pièce qu'on commande.

**Seuls `R1` et `C1` sont à souder.**

## Le wordmark

**Sérigraphie blanche sur vernis noir**, 61 × 18 mm — un tiers de la surface
de la carte.

Il a d'abord été une ouverture dans le vernis, les lettres étant le plan de
masse doré apparaissant dessous. C'était une erreur : la couleur du logo
devenait otage de la finition cuivre — gris en HASL, or seulement en ENIG, que
PCBWay facture 35 $. En sérigraphie, les lettres sont blanches quelle que soit
la finition, et **le choix de finition redevient purement fonctionnel**.

### Deux polices, et pourquoi

Le nom est en **Cyberway Riders**. Le chiffre est en **DejaVu Sans Mono**.

Cyberway Riders dessine son `2` avec un sommet plat et une diagonale droite :
à toute taille il se lit `Z`, et la carte annonçait CIPHER-Z. Le chiffre vient
donc d'ailleurs — mais pas de n'importe où : DejaVu Sans Mono est la police de
l'interface, celle que `--font-mono` nomme dans `gui/src/styles/theme.css`. La
police d'affichage porte le nom, celle de l'interface porte le numéro.

Mélanger deux fontes impose de les **accorder** : même hauteur de capitale,
même ligne de base, écart réglé. Rien de cela ne se calcule depuis la taille
nominale, parce qu'une fonte déborde couramment de ses métriques déclarées.
`align_wordmark()` mesure l'encre rendue et corrige. Trois tests gardent ce
calage.

### La cote qui compte : l'encre, pas la boîte

`test_wordmark.py` mesure l'étendue réelle des glyphes avec
`GetEffectiveTextShape()`, jamais `GetBoundingBox()`.

**Cyberway Riders déborde de ses propres métriques de 0,24 mm.** À la première
tentative, le haut des lettres arrivait à 0,26 mm du bord de carte — hors du
plan de masse — et tous les contrôles étaient au vert.

### Changer de police

Deux lignes dans `tools/build_board.py` :

```python
WORDMARK_FONT = "Cyberway Riders"
DIGIT_FONT = "DejaVu Sans Mono"
```

Le nom doit être la famille exacte vue par fontconfig
(`fc-query -f '%{family}\n' fichier.otf`). La police n'a besoin d'être
installée **que sur la machine qui exporte** : les Gerbers sortent avec les
lettres déjà converties en formes.

### Le seul avertissement DRC accepté

Cyberway Riders a des terminaisons **pointues**, et une pointe passe sous
l'épaisseur minimale de trait par construction. Augmenter l'épaisseur du texte
n'y change rien : KiCad mesure le contour brut de la police. Sur la carte, les
pointes s'impriment légèrement arrondies.

L'exception est déclarée dans `tools/check_drc.py` avec son argument, et
`test_drc_rules.py` interdit à la liste de s'allonger. Elle n'est pas
désactivée dans le fichier de projet : **KiCad y réécrit tout le bloc
`rule_severities` à chaque exécution.**

## Vérification

```
screen_wake.ino ──test──> netlist.py ──generateur──> schema ──ERC──> 0
                              │                         │
                              │                    parite DRC
                              └──generateur──> carte ──────┘
```

| Maillon | Ce qu'il prouve |
|---|---|
| `test_pinout.py` | La carte suit le firmware réel, pas une transcription |
| `test_symbols.py` | Chaque numéro de broche correspond au nom de pastille de son empreinte — **la seule erreur que l'ERC ne voit pas** |
| `test_footprints.py` | L'empreinte du Pro Micro a les cotes du module réel |
| `test_placement.py` | Rien ne déborde, rien ne se chevauche, l'USB sort bien du bord droit |
| `test_netlist_roundtrip.py` | KiCad lit le schéma comme nous l'avons voulu |
| `test_wordmark.py` | Les deux moitiés du logo partagent ligne de base et hauteur |
| `test_drc_rules.py` | La liste des avertissements tolérés ne s'allonge pas en silence |
| `TestBoardSize` | Le contour, la constante du générateur et la cote citée dans ce README disent la même chose — ils ont divergé une fois |
| ERC | Schéma cohérent — 0 violation |
| `check_drc.py` | 0 erreur, 0 différence de parité, 0 non-connecté |

État : **58 tests**, 61 segments de piste, 21 vias, 16 nets, 46 liaisons,
8 broches déclarées non connectées.

### Le routage en couloirs

Neuf signaux quittent la rangée basse du Pro Micro et traversent la carte vers
l'ouest. Chacun prend une **voie horizontale au dos**, puis un via, puis
descend vers son connecteur **en face avant**. Voies et descentes sur deux
couches différentes : une descente peut franchir n'importe quelle voie sans la
toucher, et c'est toute la raison du via.

L'ordre des voies n'est pas arbitraire. La pastille la plus à l'ouest prend la
voie la plus proche de la rangée, et les voies montent à mesure que les
pastilles vont vers l'est. Chaque sortie ne franchit alors que des voies dont
le parcours s'arrête plus à l'ouest qu'elle. **Dans l'ordre inverse, les neuf
se croisent toutes.**

## Les fichiers sont équivalents d'une génération à l'autre, pas identiques

Régénérer produit des Gerbers qui ne sont **pas** octet pour octet les mêmes.
Mesuré sur deux exécutions consécutives :

| Couche | Écart |
|---|---|
| `F_Cu`, `F_Mask`, les deux sérigraphies, `B_Mask`, `Edge_Cuts` | géométriquement identiques |
| `.drl` | identique, hors horodatage |
| `B_Cu` | **un sommet sur 3 265** dans le contour du plan de masse |

Deux causes, toutes deux dans KiCad. Les **ouvertures sont numérotées** dans
l'ordre où l'exportateur rencontre les empreintes, et cet ordre n'est pas
stable dans le `.kicad_pcb` : la même forme reçoit `D10` à une exécution et
`D12` à la suivante. Et le **remplisseur de zone** tessellise avec une
tolérance, d'où le sommet en trop.

Les deux cartes passent le DRC à `0/0/0` et se fabriquent à l'identique. Mais
la conséquence pratique est réelle :

**Ne régénérez pas entre la relecture et le téléversement.** Relisez le zip que
vous allez envoyer, et envoyez celui-là. Sinon vous téléversez un fichier
équivalent à celui que vous avez examiné, pas le même.

## Commander chez PCBWay

Une seule série, définitive. Le formulaire de devis affiche déjà les bonnes
valeurs pour la plupart des champs ; **quatre seulement sont à changer**.

| Champ | Valeur |
|---|---|
| Size (single) | **100 × 42 mm** |
| Quantity | **5** |
| Solder mask | **Black** |
| Remove product No. | **Specify a location** |
| *(déjà bons)* | Single pieces · 1 design · 2 Layers · FR-4 · TG 150-160 · 1,6 mm · 6/6 mil · 0,3 mm · Silkscreen White · UV printing None · Edge connector No · **HASL with lead** · Tenting vias · 1 oz Cu |

**HASL avec plomb est l'option de base, sans supplément.** Rien de visible n'en
dépend puisque le wordmark est en sérigraphie ; le sans-plomb coûte 13 $ et
l'ENIG 35 $ pour un résultat identique à l'œil. L'alliage plombé se soude même
mieux au fer. Sa seule contrepartie est l'absence de conformité RoHS, ce qui
compte pour vendre, pas pour construire un exemplaire.

**Cocher « Specify a location »** : la sérigraphie porte le repère `WayWayWay`
en bas à droite, la convention documentée de PCBWay pour désigner où poser leur
numéro de série. Sans cette case, ils ne cherchent pas le repère et le texte
`WayWayWay` s'imprime tel quel. Le supprimer coûterait 1,50 $.

Téléverser `fab/cipher2-panel-gerbers.zip`. Joindre en commentaire :

> Internal cutout: none. Standard 2-layer board.

Le visualiseur Gerber en ligne n'accepte **pas** les archives : lui donner les
fichiers décompressés de `fab/gerbers/`.

| Fichier | Contenu |
|---|---|
| `fab/cipher2-panel-gerbers.zip` | Ce qu'on envoie au fabricant |
| `fab/bom.csv` | Ce qu'on commande |
| `fab/bom-full.csv` | Tout, `DNP` compris |
| `fab/placement.csv` | Centroïdes, si vous prenez l'assemblage |
| `mech/*.dxf` | Contour et repères, pour le boîtier |
| `render/` | Vues 3D et couches, régénérables |

## Le contrôle à faire avant de brancher le trackball

**Dix secondes de multimètre, et c'est le seul geste qui attrape une erreur
d'orientation avant qu'elle ne coûte un module.**

Montez la carte, enfichez le Pro Micro, alimentez par l'USB — **et rien
d'autre**. Aucun câble sur `J1`, `J3` ni `J4`.

Multimètre en tension continue, pointe rouge sur `J1.1`, pointe noire sur
`J1.5` :

| Lecture | Signification |
|---|---|
| **+5 V** | L'orientation est bonne. Branchez le trackball. |
| **−5 V** | Les rails sont inversés. **Débranchez tout.** |
| **0 V** | Rien n'arrive. Vérifiez le module et le câble avant d'aller plus loin. |

Même relevé sur `J2.5` et `J2.6`, qui portent les mêmes rails et servent de
contre-épreuve.

Pourquoi ce contrôle existe : le Pro Micro est monté à l'envers, et l'empreinte
compense cette inversion. Si le module arrivait un jour avec ses barrettes
soudées dans l'autre sens — un remplacement, une réparation — la compensation
deviendrait l'erreur, et **5 V se retrouveraient sur la masse du trackball**.
Ni l'ERC, ni le DRC, ni aucun test de ce dépôt ne peut voir cela : ils
décrivent la carte, pas le module qu'on y enfiche.

Le trackball meurt en silence et sans fumée. Le multimètre coûte moins cher.

## Points de vigilance au montage

| Point | Conséquence si c'est faux |
|---|---|
| **Sens du Pro Micro** — composants vers la carte, repère `D1`/`RAW` côté USB | 5 V sur la masse du trackball, module détruit |
| **Sens du connecteur trackball** — câble droit, broche 1 sur broche 1 | Idem |
| **Polarité de la LED du bouton** — `LED+` sérigraphié | La LED n'allume pas |
| **Milieu du groupe de trois de l'encodeur sur `GND`** | L'encodeur ne compte pas |
| **Ordre de soudure** — R1 et C1 avant les embases | Les 1206 deviennent difficiles d'accès |
| **Embases à contacts estampés**, jamais tulipe | Une broche carrée de 0,64 mm mesure 0,90 mm en diagonale et n'entre pas dans un contact tulipe |
| **Embases soudées avec le module en place** comme gabarit | Soudées à main levée, les deux brins dérivent et le module n'entre plus |
| **Pastilles de masse reprises plus chaud et plus longtemps** | Le plan de masse est en liaison pleine sur les deux faces : il pompe la chaleur et laisse un joint froid |
| **Broches arasées sous la carte** | Trois câbles USB passent dessous ; un bourrelet de soudure finit par les user |

## Sans le module trackball

La carte fonctionne. La sonde d'identification échoue au démarrage, le
trackball n'est jamais interrogé, et le bouton, l'encodeur, la LED et la
liaison série sont inchangés — exactement comme le décrit
[`arduino/README.md`](../arduino/README.md). Cette absence est un cas de test,
pas un mode dégradé.
