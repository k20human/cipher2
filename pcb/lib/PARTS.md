# Empreintes retenues

Relevées dans la bibliothèque KiCad 9.0.3 installée, pas supposées. Chaque
cote a été extraite du fichier `.kicad_mod` lui-même.

## Empreintes livrées par KiCad

| Repère | Empreinte | Pastilles |
|---|---|---|
| `J1` | `Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical` | `1`…`5` |
| `J2` | `Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical` | `1`…`6` |
| `J3` | `Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical` | `1`…`5` |
| `J4` | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical` | `1`…`4` |
| `R1` `R2` `R3` | `Resistor_SMD:R_1206_3216Metric` | `1`, `2` |
| `C1` | `Capacitor_SMD:C_1206_3216Metric` | `1`, `2` |
| `SJ1` | `Jumper:SolderJumper-2_P1.3mm_Open_Pad1.0x1.5mm` | `1`, `2` |
| — | `MountingHole:MountingHole_3.2mm_M3` | aucune |

### Pourquoi du 1206 et non du 0805

Gotronic, où ces pièces sont achetées, ne stocke **ni le 150 Ω ni le 100 nF en
0805** — les deux n'existent chez eux qu'en 1206. Le 1206 fait 3,2 × 1,6 mm
contre 2,0 × 1,25 : plus grand, moins cher, en stock, et plus facile à souder
au fer. La carte a la place.

## L'empreinte dessinée à la main

Une seule : `cipher2.pretty/ProMicro_2x12_P2.54mm.kicad_mod`. Aucune empreinte
de Pro Micro n'est livrée par KiCad — vérifié par recherche sur les 152
bibliothèques installées.

Il y en avait trois. Le bouton, l'encodeur et le trackball sont partis sur
câble quand la carte est devenue un concentrateur, emportant leurs empreintes
maison — **et c'étaient les risquées**. Ce qui reste est une grille de
pastilles au pas de 2,54 mm, difficile à rater et facile à vérifier.

| | |
|---|---|
| Pastilles | 2 × 12, nommées d'après `PRO_MICRO_ROWS` |
| Pas | 2,54 mm |
| Entraxe des rangées | 15,24 mm (0,6 pouce) |
| Perçage | 1,0 mm, pastille 1,7 mm |

**Les pastilles portent le nom du signal**, pas un numéro : `D2`, `GND1`,
`VCC`… Un net nommé `SDA` se pose sur une pastille nommée `D2` ; aucune
transcription ne s'intercale.

### Elle est en miroir

`PRO_MICRO_ROWS[0]` est placée en **+x** là où un module droit la mettrait en
−x. La raison est le module lui-même : ses barrettes ont été soudées broches
vers le haut, et le retourner pour l'enficher échange ses deux rangées.
L'empreinte les rééchange.

**C'est la seule chose de cette carte qui serait fausse pour un Pro Micro monté
normalement.** Un module de remplacement soudé de la façon habituelle ne
rentrera pas — voir `pcb/README.md`.

La sérigraphie porte `PRO MICRO - COMPONENTS DOWN` au-dessus de son
emplacement. Ce n'est pas un ornement : monté à l'endroit, le module met 5 V
sur la masse du trackball et le détruit.

## Correspondance nom ↔ numéro de pastille

Vide, et cette vacuité est le choix : chaque empreinte utilise soit des
numéros simples, soit — pour le Pro Micro — des noms de signaux. Rien n'a
besoin d'être traduit.

`netlist.PIN_NUMBERS` reste comme couture, pour qu'adopter une empreinte à
numérotation différente soit une ligne à changer plutôt qu'une reprise dans
trois fichiers.
