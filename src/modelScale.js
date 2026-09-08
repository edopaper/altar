import modelScaleConfig from '../public/configuraciones/model-scale.json' with { type: 'json' }

export function getConfiguredModelScale(modelPath) {
  const rel = modelPath.replace(/^\/models\/altar\//, '')
  const scale = modelScaleConfig.models?.[rel]?.scale
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function configuredScaleVector(modelPath) {
  const scale = getConfiguredModelScale(modelPath)
  return [scale, scale, scale]
}
