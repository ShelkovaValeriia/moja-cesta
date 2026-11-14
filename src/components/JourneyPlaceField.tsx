import { useState } from 'react'
import type { JourneyPlace, SearchQuery } from '../types'
import { useStore } from '../context'
import { selectJourneyPlace, stopPlace } from '../places'
import { StopAutocomplete } from './StopAutocomplete'
import { PlacePickerModal } from './PlacePickerModal'
export function JourneyPlaceField({
  label,
  side,
  query,
  onChange,
}: {
  label: string
  side: 'from' | 'to'
  query: SearchQuery
  onChange: (query: SearchQuery) => void
}) {
  const { state } = useStore(),
    [picker, setPicker] = useState(false),
    [draft, setDraft] = useState('')
  const place = side === 'from' ? query.fromPlace : query.toPlace
  function choose(point: JourneyPlace) {
    onChange(selectJourneyPlace(query, side, point, state.stops))
  }
  return (
    <>
      <StopAutocomplete
        label={label}
        value={query[side]}
        place={place}
        onMapPick={(text) => {
          setDraft(text)
          setPicker(true)
        }}
        onChange={(id) =>
          onChange({
            ...query,
            [side]: id,
            [`${side}Place`]: undefined,
            [`${side}StopConfirmed`]: undefined,
          })
        }
      />
      {picker && (
        <PlacePickerModal
          side={side}
          initial={
            place ??
            stopPlace(
              state.stops.find((s) => s.id === query[side]) ?? { id: '', name: '', village: '' },
            )
          }
          draftName={draft}
          onConfirm={choose}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  )
}
