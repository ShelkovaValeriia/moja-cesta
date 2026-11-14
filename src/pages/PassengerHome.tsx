import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BusFront, ChevronRight, CircleHelp, Search, Ticket } from 'lucide-react'
import { HelpContent, Modal } from '../components/ui'
export function PassengerHome() {
  const [help, setHelp] = useState(false)
  return (
    <div className="passenger-home">
      <section className="passenger-welcome">
        <h1>Kam sa chcete vybrať?</h1>
        <p>Nájdeme pre vás najlepší spôsob dopravy.</p>
        <Link className="btn journey-primary home-search-button" to="/passenger/search">
          <Search size={21} />
          Vyhľadať spojenie
          <ArrowRight size={20} />
        </Link>
      </section>
      <div className="home-destinations">
        <Link className="card home-destination" to="/passenger/lines">
          <span className="icon-tile">
            <BusFront size={25} />
          </span>
          <div>
            <h2>Pravidelné linky</h2>
            <p>Naše trasy a cestovné poriadky</p>
          </div>
          <ChevronRight size={22} />
        </Link>
        <Link className="card home-destination" to="/passenger/journeys">
          <span className="icon-tile">
            <Ticket size={25} />
          </span>
          <div>
            <h2>Moje cesty</h2>
            <p>Vaše rezervácie a požiadavky</p>
          </div>
          <ChevronRight size={22} />
        </Link>
        <button className="card home-destination" onClick={() => setHelp(true)}>
          <span className="icon-tile">
            <CircleHelp size={25} />
          </span>
          <div>
            <h2>Pomoc a kontakt</h2>
            <p>Ako cestovať a kto vám pomôže</p>
          </div>
          <ChevronRight size={22} />
        </button>
      </div>
      {help && (
        <Modal title="Pomoc a kontakt" onClose={() => setHelp(false)}>
          <HelpContent />
        </Modal>
      )}
    </div>
  )
}
