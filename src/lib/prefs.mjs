// 外观偏好的取值约束：配置来自磁盘，可能是手改过的、或者老版本留下的。
// 非法值一律回落到默认，避免 dataset 上挂个不存在的名字导致样式全丢。
export const ACCENTS = ['violet', 'blue', 'teal', 'amber']
export const DENSITIES = ['cozy', 'compact']

export function normalizeAccent(value) {
  return ACCENTS.includes(value) ? value : 'violet'
}

export function normalizeDensity(value) {
  return DENSITIES.includes(value) ? value : 'cozy'
}
