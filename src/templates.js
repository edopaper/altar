const model = (name, file, position, size = 1) => ({ type: 'model', name, modelPath: `/models/altar/${file}.glb`, position, rotation: [0, 0, 0], scale: [size, size, size], color: '#ffffff' })
const simple = [
  model('Vela izquierda', 'velas/veladora', [-0.85, 1.8, -2.9]),
  model('Vela derecha', 'velas/veladora', [0.85, 1.8, -2.9]),
  model('Pan de muerto', 'comida/pan-muerto', [0, 1.2, -2.05]),
  model('Agua', 'comida/vaso-agua', [0.65, 1.2, -2.05]),
  model('Cempasúchil', 'decoracion/jarron-cempasuchil', [-1.6, 1.8, -2.9]),
]
const traditional = [...simple,
  model('Flores', 'decoracion/jarron-cempasuchil', [1.6, 1.8, -2.9]),
  model('Sal', 'comida/sal', [-0.65, 1.2, -2.05]),
  model('Copal', 'velas/copal', [0, 0.6, -1.15]),
  model('Calavera de azúcar', 'comida/calavera-azucar', [-0.9, 0.6, -1.15]),
  model('Fruta', 'comida/frutas', [0.9, 0.6, -1.15]),
]
export const TEMPLATES = [
  { id: 'sencillo', name: 'Sencillo', description: 'Velas, agua, pan y flores. Un homenaje sereno para empezar.', clothColor: '#f7f2e8', objects: simple },
  { id: 'tradicional', name: 'Tradicional', description: 'Cempasúchil, copal, sal y ofrendas distribuidas en tres niveles.', clothColor: '#edb954', objects: traditional },
  { id: 'familiar', name: 'Familiar', description: 'Una mesa abundante con café, tamales y dulces para compartir recuerdos.', clothColor: '#dcc6e8', objects: [...traditional,
    model('Café', 'comida/cafe', [-1.4, 1.2, -2.05]),
    model('Tamales', 'comida/tamales', [1.4, 1.2, -2.05]),
    model('Dulces', 'comida/dulces', [-1.7, 0.6, -1.15]),
    model('Chocolate', 'comida/chocolate', [1.7, 0.6, -1.15]),
  ] },
]
export function createTemplate(id) {
  const template = TEMPLATES.find(t => t.id === id)
  if (!template) throw new Error('Plantilla desconocida')
  return { objects: structuredClone(template.objects).map((object, index) => ({ ...object, id: index + 1 })), clothColor: template.clothColor }
}
