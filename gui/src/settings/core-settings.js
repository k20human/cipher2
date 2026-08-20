import { THEME_NAMES, GLYPH_SETS, CLOCK_SIZES, LOGO_STYLES, AMBIENT_SCOPES } from '../core/schema.js'

const options = (values, labels) => values.map((value, i) => ({ value, label: labels[i] }))

// The core sections use the very same declaration shape as a module's
// `settings`. The panel therefore knows one format and one only.
export const CORE_SECTIONS = [
  {
    id: 'theme',
    title: 'Thème',
    path: 'theme',
    settings: [
      {
        key: 'name',
        type: 'select',
        label: 'Palette',
        default: 'matrix',
        options: options(THEME_NAMES, ['Matrix', 'Night City', 'Arasaka']),
      },
      { key: 'hue', type: 'range', label: 'Teinte', default: null, min: 0, max: 359, step: 1, nullable: true },
    ],
  },
  {
    id: 'ambient',
    title: 'Ambiance',
    path: 'ambient',
    settings: [
      { key: 'enabled', type: 'bool', label: 'Fond animé', default: true },
      {
        key: 'scope',
        type: 'select',
        label: 'Portée',
        default: 'column',
        options: options(AMBIENT_SCOPES, ['Colonne', 'Plein écran']),
      },
      { key: 'density', type: 'range', label: 'Densité', default: 0.6, min: 0.05, max: 1, step: 0.05 },
      { key: 'speed', type: 'range', label: 'Vitesse', default: 0.3, min: 0.05, max: 1, step: 0.05 },
      { key: 'trail', type: 'range', label: 'Traînée', default: 0.6, min: 0.05, max: 1, step: 0.05 },
      {
        key: 'glyphs',
        type: 'select',
        label: 'Glyphes',
        default: 'katakana',
        options: options(GLYPH_SETS, ['Katakana', 'Hexadécimal', 'ASCII']),
      },
      { key: 'resolutionScale', type: 'range', label: 'Résolution', default: 1, min: 0.5, max: 2, step: 0.1 },
      { key: 'fpsCap', type: 'range', label: 'Images / s', default: 30, min: 10, max: 60, step: 5 },
    ],
  },
  {
    id: 'effects',
    title: 'Effets',
    path: 'effects',
    settings: [
      { key: 'scanlines', type: 'bool', label: 'Scanlines', default: true },
      { key: 'grain', type: 'bool', label: 'Grain', default: false },
      { key: 'vignette', type: 'bool', label: 'Vignettage', default: true },
      { key: 'glitch', type: 'bool', label: 'Glitch', default: false },
      { key: 'glow', type: 'bool', label: 'Lueur', default: false },
    ],
  },
  {
    id: 'layout',
    title: 'Disposition',
    path: 'layout',
    settings: [
      {
        key: 'columns',
        type: 'select',
        label: 'Colonnes',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Auto (remplit la bande)' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '4', label: '4' },
        ],
      },
      {
        key: 'ink',
        type: 'select',
        label: 'Encre',
        default: 'white',
        options: [
          { value: 'white', label: 'Blanche' },
          { value: 'theme', label: 'Couleur du thème' },
        ],
      },
      {
        key: 'logoInk',
        type: 'select',
        label: 'Encre du logo',
        default: 'white',
        options: [
          { value: 'white', label: 'Blanche' },
          { value: 'theme', label: 'Couleur du thème' },
        ],
      },
      {
        key: 'avatarInk',
        type: 'select',
        label: 'Encre de l’avatar',
        default: 'white',
        options: [
          { value: 'white', label: 'Blanche' },
          { value: 'theme', label: 'Couleur du thème' },
        ],
      },
      {
        key: 'clockSize',
        type: 'select',
        label: 'Taille de l’horloge',
        default: 'small',
        options: options(CLOCK_SIZES, ['Petite', 'Moyenne', 'Grande']),
      },
      {
        key: 'logoStyle',
        type: 'select',
        label: 'Style du logo',
        default: 'plate',
        options: options(LOGO_STYLES, ['Glitch', 'Plaque', 'Cadre', 'Major']),
      },
    ],
  },
]
