import { DispatcherModal as Modal } from './DispatcherModal'
import { useState } from 'react'
import { useStore } from '../context'
import { uid } from '../data'
import { LICENSE_CATEGORIES } from '../types'
import type { Driver, LicenseCategory, Vehicle } from '../types'

export function AddVehicleModal({ onClose, vehicle }: { onClose: () => void; vehicle?: Vehicle }) {
  const { act } = useStore()
  const [name, setName] = useState(vehicle?.name ?? '')
  const [plate, setPlate] = useState(vehicle?.plate ?? '')
  const [capacity, setCapacity] = useState(vehicle ? String(vehicle.capacity) : '')
  const [category, setCategory] = useState<LicenseCategory | ''>(
    vehicle?.requiredLicenseCategory ?? '',
  )

  return (
    <Modal title={vehicle ? 'Upraviť vozidlo' : 'Pridať vozidlo'} onClose={onClose} actionErrors>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (
            act(
              {
                type: vehicle ? 'updateVehicle' : 'addVehicle',
                vehicle: {
                  id: vehicle?.id ?? uid(),
                  name,
                  plate,
                  capacity: Number(capacity),
                  requiredLicenseCategory: category || null,
                },
              },
              vehicle ? 'Vozidlo bolo upravené.' : 'Vozidlo bolo pridané.',
            )
          )
            onClose()
        }}
      >
        <label className="field">
          <span>Názov vozidla</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Evidenčné číslo</span>
          <input
            required
            maxLength={20}
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Požadované vodičské oprávnenie</span>
          <select
            required
            value={category}
            onChange={(event) => setCategory(event.target.value as LicenseCategory | '')}
          >
            <option value="">Vyberte skupinu</option>
            {LICENSE_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Počet miest pre cestujúcich</span>
          <input
            required
            type="number"
            min={1}
            max={category === 'B' ? 8 : undefined}
            step={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        <button className="btn" type="submit">
          {vehicle ? 'Uložiť zmeny' : 'Pridať vozidlo'}
        </button>
      </form>
    </Modal>
  )
}

export function AddDriverModal({ onClose, driver }: { onClose: () => void; driver?: Driver }) {
  const { act } = useStore()
  const [name, setName] = useState(driver?.name ?? '')
  const [categories, setCategories] = useState<LicenseCategory[]>(driver?.licenseCategories ?? [])

  return (
    <Modal title={driver ? 'Upraviť vodiča' : 'Pridať vodiča'} onClose={onClose} actionErrors>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (
            act(
              {
                type: driver ? 'updateDriver' : 'addDriver',
                driver: { id: driver?.id ?? uid(), name, licenseCategories: categories },
              },
              driver ? 'Vodič bol upravený.' : 'Vodič bol pridaný.',
            )
          )
            onClose()
        }}
      >
        <label className="field">
          <span>Meno a priezvisko</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Skupiny vodičského oprávnenia</legend>
          <div className="dispatch-actions">
            {LICENSE_CATEGORIES.map((item) => (
              <label className="approve-place-checkbox" key={item}>
                <input
                  type="checkbox"
                  checked={categories.includes(item)}
                  onChange={(event) =>
                    setCategories(
                      event.target.checked
                        ? [...categories, item]
                        : categories.filter((category) => category !== item),
                    )
                  }
                />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn" type="submit" disabled={!categories.length}>
          {driver ? 'Uložiť zmeny' : 'Pridať vodiča'}
        </button>
      </form>
    </Modal>
  )
}
