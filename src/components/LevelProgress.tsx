import { MAX_LEVEL } from '../logic/config'
import { pointsNeeded } from '../logic/progress'
import type { TextItem } from '../types'
import ProgressBar from './ProgressBar'

export default function LevelProgress({ text }: { text: TextItem }) {
  if (text.level >= MAX_LEVEL) {
    return <ProgressBar value={1} max={1} label="Максимальный уровень" />
  }
  const need = pointsNeeded(text.level)
  return <ProgressBar value={text.levelPoints} max={need} label={`${text.levelPoints} / ${need}`} />
}
