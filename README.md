# Moja Cesta

Interaktívny frontendový prototyp vidieckej mikrobusovej dopravy v Zamagurí. Celé používateľské rozhranie je v slovenčine. Pravidelné spoje dopĺňajú jazdy na požiadanie; všetku dopravu zabezpečujú dva spoločné mikrobusy. Projekt nepoužíva súkromné vozidlá ani ponuky súkromných vodičov.

## Spustenie

Potrebujete **Node.js 22.12+** (odporúčame Node.js 24) a npm.

```bash
npm ci
npm run dev
```

Otvorte adresu z terminálu, spravidla **http://127.0.0.1:5173**.

```bash
npm run build        # TypeScript a produkčný priečinok dist/
npm run preview      # lokálny náhľad produkčnej zostavy
npm run lint
npm test
npm run format:check
```

Nie sú potrebné API kľúče, registrácia ani backend. Výber miesta používa React Leaflet a verejný podklad OpenStreetMap, ktorý vyžaduje internet. Pri výpadku podkladu zostáva dostupný zoznam demo zastávok a zadanie súradníc. Písmo Manrope je súčasťou zostavy a nevyžaduje Google Fonts. Pri hostovaní nastavte návrat `index.html` pre všetky aplikačné cesty (SPA fallback).

## Obrazovky

| Rola      | Cesty                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cestujúci | `/passenger`, `/passenger/lines`, `/passenger/search`, `/passenger/results`, `/passenger/requests`, `/passenger/requests/new`, `/passenger/requests/:id`, `/passenger/book/:id`, `/passenger/journeys`, `/passenger/recurring`, `/passenger/profile` |
| Vodič     | `/driver`, `/driver/map`, `/driver/current`, `/driver/trips/:id`, `/driver/profile`                                                                                                                                                                  |
| Dispečer  | `/dispatcher`, `/dispatcher/fixed`, `/dispatcher/requests`, `/dispatcher/flex`, `/dispatcher/vehicles`, `/dispatcher/stops`, `/dispatcher/statistics`                                                                                                |

Cestujúci prechádza cez samostatné obrazovky **Domov → Vyhľadať spojenie → Možnosti cesty → Požiadavky na mape → Detail / Nová požiadavka**. Na hlavnej stránke nie je formulár. Vyhľadávanie sa prenáša v URL cez výsledky, mapu, detail aj formulár a pri návrate späť. Navigácia cestujúceho je **Domov / Cesty / Mapa / Profil**; v Cestách je prechod na vyhľadávanie aj pravidelné rezervácie.

Rolu prepnete v hlavičke. Cestujúci a vodič majú na mobile spodnú navigáciu; dispečer bočnú navigáciu na počítači a vodorovnú na mobile.

## Čo funguje

- Čas sa všade ukladá ako `HH:mm`. Vlastný ovládač s hodinami 00–23 a minútami 00–59 nahrádza všetky natívne polia `type="time"`, takže jeho vzhľad nezávisí od systémového nastavenia AM/PM. Formátovanie používa `sk-SK` a 24-hodinový cyklus; migrácia prepočíta platné staršie 12-hodinové časy vrátane polnoci a poludnia.
- Pri oboch poliach **Odkiaľ / Kam** je **Vybrať na mape**: posun, zoom, kliknutie, marker a potvrdenie. Existujúcu zastávku možno vybrať aj zo zoznamu. Vlastnému bodu sa dá ručne doplniť názov alebo adresa; bez názvu zostáva „Vybrané miesto na mape“ s presnými vybranými súradnicami. Reverzné geokódovanie sa nepoužíva.
- Bod obsahuje typ, šírku, dĺžku a názov, existujúca zastávka aj `stopId`. Údaje a potvrdenie pravidelnej zastávky sa prenášajú cez URL a ukladajú spolu s rezerváciou alebo požiadavkou.
- Pri pravidelnom spoji sa navrhne najbližšia demo zastávka. Vlastný bod sa nestáva zastávkou: používateľ musí výslovne potvrdiť nástup a výstup na navrhnutých zastávkach. V Flex požiadavke zostáva bod samostatným návrhom a dispečer ho pred naplánovaním výslovne schváli. Schválený bod sa zobrazí vodičovi v jeho trase bez pridania do zoznamu oficiálnych zastávok. Verejné karty zobrazujú len obce; presný navrhovaný bod a poznámky sú v osobnom detaile dostupné autorovi (`createdByMe`), dispečerovi a priradenému vodičovi. Pridanie záujmu neodhaľuje cudziu súkromnú adresu. Ide o minimalizáciu zobrazenia v deme; produkčné oprávnenia musia byť overené serverom.
- Správca rodinného účtu má `isAccountOwner`, malú korunu a označenie „Správca účtu“. Predvolene je ním Zuzana (`me`). Pri načítaní starých údajov sa použije stabilné ID, nikdy meno alebo poradie; výslovne uložený príznak sa zachová. Označenie nerozširuje prístupové práva a bežnou úpravou profilu ho nemožno meniť.
- Typ cesty, rodinný profil a počet cestujúcich sa vyberajú na začiatku vyhľadávania. Rovnaké údaje sa prenesú do výsledkov, mapy, detailu, novej požiadavky aj rezervácie. Posledný krok rezervácie už iba zhrnie zvolené miesta.
- Vyhľadávanie podľa zastávok, dátumu a času. Časová preferencia „Radšej skôr / Radšej neskôr“ uprednostní príslušnú stranu času odchodu, ale ostatné možnosti ponechá ako alternatívy. „Príchod do“ zostáva najneskorším príchodom. Spiatočná cesta má vlastný režim aj nezávislú preferenciu.
- Žiadny spoj sa nevyberá automaticky. Používateľ vyberie jeden spoj v každom potrebnom smere; až potom pokračuje k potvrdeniu. Zastávky oboch smerov sa zobrazujú v skutočnom poradí s časmi a miestom nástupu a výstupu.
- Formulár priebežne zapisuje údaje do URL bez pridávania krokov do histórie. Šípka späť používa históriu Routera; pri priamom otvorení URL má náhradný predchádzajúci krok scenára.
- Zobrazenie trasy, zastávok, časov a voľných miest na konkrétnom úseku.
- Rezervácia pre ľubovoľný rodinný profil, validácia kapacity, ochrana proti duplicitnej rezervácii a zrušenie s uvoľnením miest.
- Spiatočná cesta: oba smery sa potvrdia naraz; ak jedna strana zlyhá, nevznikne žiadna rezervácia. Zrušenie ruší obe vlastné strany spoločne.
- Vytvorenie požiadavky, pridanie skupiny cestujúcich, zrušenie vlastnej účasti a filtre. Záujem nie je rezervácia. Rovnaký rodinný profil sa nemôže pridať dvakrát; iný profil sa môže pridať samostatne v rámci kapacity.
- Mapa najprv zobrazí požiadavky s rovnakými zastávkami a dátumom v časovom okne ±60 minút. Pri povinnom návrate sa porovná aj spiatočná strana. Pri porovnaní odchodu a príchodu používa ukážkové trvanie 24 minút. Všetky požiadavky sú dostupné cez samostatné prepnutie; zvolený filter sa zachová v URL.
- Výsledky obsahujú dva kroky: pravidelný spoj a prechod na existujúce požiadavky. Nová požiadavka sa vytvára až z obrazovky mapy.
- Dispečerské schválenie vytvorí Flex jazdu, priradí dostupné vozidlo a vytvorí rezervácie účastníkov. Zhodné trasy, dátumy a časy sa zlučujú v rámci kapacity.
- Plánovanie kontroluje časovú dostupnosť vozidla aj vodiča, požadovanú kategóriu oprávnenia a kolízie so všetkými existujúcimi jazdami vrátane 10-minútovej rezervy. Pravidelné spoje sa nemenia. Pri spiatočnej požiadavke musia vyjsť oba smery.
- Zamietnutie vyžaduje dôvod a cestujúci ho vidí.
- Začatie jazdy, nástup, výstup, neprítomnosť a ukončenie. Výstup je možný až po nástupe; ukončenie až po spracovaní všetkých cestujúcich. Rovnaké vozidlo nemôže mať dve aktívne jazdy.
- Pridanie a úprava rodinných profilov. Pri dieťati je povinný platný telefón rodiča či zákonného zástupcu; samotný e-mail nestačí. Pešia vzdialenosť a obľúbené zastávky sa už nezobrazujú; staršie uložené polia sa bezpečne zachovajú.
- Pravidelné cestovanie: nezávislé denné plány, kalendárne potreby, podanie plánu a zabezpečenie konkrétnych Fixed spojov systémom a dispečerom, výnimky, úpravy a pozastavenie.
- Návrhy zastávok v dispečerskom rozhraní, ich schválenie alebo zamietnutie. Schválená zastávka sa objaví vo formulároch.
- Štatistiky sa prepočítavajú z aktuálneho lokálneho stavu.
- Spoločný React Context + `localStorage`, synchronizácia zmien medzi kartami rovnakého prehliadača a obnovenie pôvodných dát v pätičke.

## Pravidelné cestovanie

Na Domove je **Pravidelne cestujem → Nastaviť pravidelné cesty**. Správa je v **Moje cesty → Moje pravidelné cesty** (`/passenger/recurring`).

1. Vyberte existujúci rodinný profil, povinný účel Do práce / Do školy a obdobie najviac 12 kalendárnych mesiacov. Prvá cesta musí byť najmenej o päť kalendárnych dní. Dieťa potrebuje platný telefón zodpovedného dospelého; chýbajúci kontakt možno doplniť priamo v procese.
2. Pridajte prvý deň s vlastným smerom, časom, odchodom/príchodom a preferenciou. Spiatočná cesta má nezávislý smer a čas. Používajú sa rovnaké adresné a mapové ovládače ako pri jednorazovej ceste.
3. Ďalší deň preberie hlbokú kópiu posledného pridaného alebo upraveného dňa. Každý deň možno samostatne meniť alebo odstrániť; týždeň je zoradený pondelok–nedeľa. Rozpracovaný plán sa uchováva v `sessionStorage`, uložené rozvrhy a rezervácie v existujúcom `localStorage`.
4. **Skontrolovať plán** zobrazí zhrnutie týždňa. **Odoslať pravidelný plán** uloží potrebu a úlohy dispečerovi bez vytvárania rezervácií. Cestujúci nevyberá spoje ani jednotlivé dátumy.
5. Dispečer výslovne spustí kontrolu v otvorenej aplikácii. Systém vyberá dostupné publikované Fixed jazdy a opätovne overuje pridelenie, kapacitu úsekov, duplicity a oba smery. Pri spiatočnej ceste potvrdí obe rezervácie naraz, inak zostáva otvorená potreba. Chýbajúce budúce spoje sa nevymýšľajú. Lehota je 24 hodín pred prvým odchodom, omeškanie je viditeľne označené. Bez otvorenej aplikácie nebeží spracovanie ani doručovanie oznámení.
6. Úprava rozvrhu znovu vyžaduje kontrolu a súhlas s nahradením budúcich rezervácií. Vynechanie dátumu uvoľní obe miesta bez odstránenia týždňa; náhradný plán platí iba pre konkrétny dátum a vyžaduje novú kontrolu dispečerom. Pozastavenie/zrušenie uvoľní iba nezačaté budúce miesta a zachová históriu. Obnovenie samo nepotvrdí žiadne miesto.

Dispečer má **Pravidelné dopravné potreby** (`/dispatcher/regular-needs`) s voliteľným obdobím, počtom ľudí, skutočných osobných ciest podľa dátumov a dní, účelmi, pokrytím, chýbajúcimi smermi a kapacitným deficitom. Potvrdené pravidelné rezervácie pokrývajú tú istú potrebu a nepripočítavajú druhý dopyt. Výnimky, zmeny, pauzy a zrušenia sa prepočítajú okamžite. Odhady dodatočných miest a odchodov vychádzajú z nakonfigurovaných kapacít a sú výslovne len podkladom; cestnú optimalizáciu, zlúčenie smerov ani nové Fixed linky nepublikujú.

Demo obsahuje školáčku s neskorším utorkovým návratom a jednosmernou stredou, pracovné dni Po/St/Pi, rôzne smery pre seniora, nepokryté dátumy a plný utorkový návrat. Nové príklady sú v čistom deme; migrácia neprepisuje existujúce uložené dáta.

Vodič môže zaznamenať neúčasť aj opraviť svoju chybnú značku počas jazdy. Správca dostane oznámenie v aplikácii; žiadna SMS ani e-mail sa neposiela. Dispečer môže záznam overiť/opraviť s dôvodom a po individuálnom posúdení nastaviť dočasné zastavenie nového automatického rezervovania. Neexistuje automatická sankcia ani číselný prah; jednorazové ručné rezervácie a existujúce potvrdené miesta zostávajú dostupné.

Doménové funkcie sú v `src/regular.ts`, model rozširuje pôvodný `RecurringRule` o `WeeklyDayPlan` a `ScheduleException`; konkrétne `Booking` obsahuje `ruleId` a `occurrenceDate`. Migrácia starších verzií prevádza staré pravidlá na potreby bez vytvárania neexistujúcich potvrdení. Nové obrazovky sú v `src/pages/Recurring.tsx`, `src/pages/RegularDemand.tsx`; spoločný denný formulár v `src/components/WeeklyDayEditor.tsx`.

## Rýchly scenár pre prezentáciu

1. Na Domove v role **Cestujúci** otvorte **Vyhľadať spojenie**, vyplňte formulár a stlačte **Hľadať**. Vyhľadajte Matiašovce → Spišská Stará Ves na dnešný deň od 06:00. Už vo formulári vyberte Máriu a počet miest. Vo výsledkoch ručne vyberte spoj o 07:15 a pokračujte k rezervácii.
2. Prepnite na **Vodič**, otvorte ten istý spoj, začnite jazdu, potvrďte príchod na zastávku a označte nástup podľa ID cestujúceho. Vo výstupnej zastávke už bude dostupné tlačidlo „Vystúpil“.
3. Ako **Cestujúci** vyhľadajte Matiašovce → Spišská Stará Ves na 09:30. Vo výsledkoch otvorte **Pozrieť požiadavky** a na mape **Vytvoriť novú požiadavku**. Údaje sú už vyplnené; odošlite formulár.
4. Ako **Dispečer** ju nájdite v Požiadavkách a schváľte. Flex jazda pribudne do dnešného plánu; cestujúci uvidí potvrdenie v Moje cesty.
5. Skúste požiadavku na 07:10: obe vozidlá kolidujú s pravidelnou dopravou, preto sa jazda nenaplánuje a zobrazí sa vysvetlenie.
6. V pätičke použite **Obnoviť demo údaje**, ak chcete začať prezentáciu odznova.

Demo pri prvom otvorení používa dátum v časovom pásme Europe/Bratislava a pripraví pravidelné spoje na 8 dní. Uložená simulácia sa počas prezentácie sama neposúva. Na nový deň obnovte demo údaje.

## Hranice prototypu

Všetky údaje sú vymyslené a akcie fungujú len v prehliadači. Neposielajú sa skutočné objednávky, platby, SMS ani e-maily. Požiadavky, výber miesta, prehľad trasy vodiča aj aktívna jazda používajú spoločný interaktívny Leaflet modul s kartou prispôsobenou príslušnému kroku. Polohy demo zastávok sú približné a nie sú geodeticky overené. Počty záujemcov a vyznačené smery vychádzajú zo zobrazených požiadaviek. Zastávky bez súradníc zostávajú v zozname; chýbajúca cestná geometria má upozornenie a nenahrádza sa priamou čiarou.

Flex jazda používa pevné ukážkové trvanie 24 minút. Kontrola časových kolízií nie je geografická optimalizácia: nepočíta skutočnú cestnú trasu, presun vozidla medzi obcami, smeny vodičov ani dostupnosť konkrétneho bezbariérového vozidla. Na ostrú prevádzku nestačí.

Pravidelné plány vytvárajú demo rezervácie iba pri explicitnom spracovaní dispečerom a iba pre zabezpečené publikované dátumy po opätovnej kontrole kapacity. Nie je implementovaný plánovač na pozadí; ďalšie dátumy zostávajú potrebou až do ďalšej kontroly.

`localStorage` nie je databáza: údaje sa nezdieľajú medzi rôznymi zariadeniami a neposkytujú transakčné záruky pre súbežné rezervácie. Vodič vidí svoje pridelené jazdy podľa aktuálneho mock profilu; v rozhraní vodiča nie je výber iného vodiča. Profil obsahuje kategórie oprávnenia, konkrétny automobil a jeho kapacita sú uvedené na jazde. Kompatibilita používa výslovne uloženú požadovanú kategóriu vozidla; neodvodzuje oprávnenie z jeho názvu ani počtu sedadiel. Ručný výber vodiča a vozidla v dispečerskom UI zatiaľ nie je pridaný; model a validovaná operácia `assignTrip` sú pripravené, schvaľovanie Flex prideľuje kompatibilnú dvojicu automaticky. Autorizácia ani prístupové práva nie sú implementované.

## Štruktúra

- `src/types.ts` — typy doménových entít a stavov.
- `src/data.ts` — spoločné demo dáta a dátumové pomocné funkcie.
- `src/domain.ts` — čisté doménové prechody, validácia a výpočet kapacity po úsekoch; pri chybe sa pôvodný stav nemení.
- `src/store.tsx`, `src/context.ts` — stav, perzistencia, synchronizácia a oznámenia.
- `src/storage.ts` — migrácia pôvodných lokálnych údajov na verziu 5 pri zachovaní rovnakého kľúča `moja-cesta-demo-v1`, rezervácií, požiadaviek a profilov.
- `src/people.ts` — validácia profilu a kontaktu pre detského cestujúceho.
- `src/driver.css` — rolovanie kariet vodiča a bezpečné odsadenie od mobilnej navigácie.
- `src/time.ts`, `src/components/TimePicker.tsx` — jednotný 24-hodinový formát a výber času.
- `src/places.ts`, `PlacePickerModal.tsx`, `JourneyPlaceField.tsx` — súradnice, interaktívny výber a odlíšenie bodov od zastávok.
- `src/modules/transport-map/` — nezávislé vykreslenie mapy, cestných geometrií, výberu trasy/zastávky/bodu a spoločnej spodnej karty.
- `src/maps/` — projekcie údajov aplikácie, ochrana verejnej mapy a nastavenie smerovača.
- `src/location-time.css` — lokálne štýly časového ovládača, mapy a označenia správcu.
- `src/search.ts` — prenos vyhľadávania v URL a výber zodpovedajúcich požiadaviek.
- `src/components/` — spoločné ovládacie prvky, navigácia, vyhľadávanie a vlastné SVG ilustrácie.
- `src/pages/` — oddelené obrazovky troch rolí.
- `src/passenger.css` — samostatné kroky cestujúceho, veľké tlačidlá a mobilná vertikálna kompozícia.
- `src/styles.css` — responzívna dizajnová sústava, Tailwind CSS 4 a štýly prístupnosti.
- `src/*.test.*` — doménové testy, testy vykreslenia a integračné DOM testy celého scenára vrátane zachovania údajov a prepínania rolí.

## Pripojenie Java Spring Boot

1. Zachovajte zdieľané TypeScript typy ako základ pre DTO alebo generujte klienta z OpenAPI. Doplňte identifikátor prevádzkovateľa a roly až pri implementácii identity.
2. Pridajte `src/api/` s HTTP klientom a konfigurovateľným `VITE_API_BASE_URL`. Nahraďte lokálne operácie v store volaniami API a zobrazte načítavanie, chyby a konflikty `409`.
3. Navrhované zdroje: `GET /stops`, `GET /trips?from=&to=&date=&time=&timeMode=`, `POST /bookings`, `POST /booking-groups` pre atómové spiatočné rezervácie, `DELETE /booking-groups/{id}`, `GET/POST /ride-requests`, `POST /ride-requests/{id}/join`, `/approve`, `/reject`, `PATCH /trips/{id}/status`, `PATCH /bookings/{id}/rider-status`, `GET/POST/PATCH /passengers`, `/recurring-rules`, `/stop-proposals` a `GET /statistics`.
4. Presuňte kapacitné kontroly, validáciu stavov a obe strany spiatočnej cesty do jednej serverovej transakcie. Použite zamykanie/verziu záznamu; klientova kontrola sama nestačí.
5. Na serveri pridajte skutočný výpočet trás a presunov vozidla, smeny vodičov, dostupnosť vozidiel a pravidlá bezbariérovej prepravy. Zachovajte nemennosť schváleného pravidelného poriadku.
6. Zmeny stavov doručujte cez SSE/WebSocket alebo pravidelné načítanie. Neskôr doplňte registráciu, oprávnenia rolí a notifikácie podľa dohodnutého rozsahu.

Pre lokálny vývoj môžete nastaviť Vite proxy `/api` na Spring Boot; pri oddelených doménach nastavte CORS. Žiadny z týchto backendových krokov nie je súčasťou tohto prototypu.

## Mapový podklad

Samostatný mapový modul je dostupný na **`/map.html`**. Východiskový pilot je **Spišská Stará Ves, Havka, Zálesie, Jezersko, Lechnica a Veľká Lesná v Prešovskom kraji**. Zobrazuje iba jednu vybranú celú cestu; jedným kliknutím sa vyberie trasa a otvoria zastávky, šípkou sa vrátite do zoznamu. Naše zastávky majú čísla podľa poradia. Staré verejné linky z dodaného GTFS nie sú zaradené. T1–T5 kombinujú ukážkovú dopravu do uzla s novo overeným verejným spojom do Popradu na **16. 11. 2026**. Plný modrý úsek je náš, prerušovaný oranžový verejný; geometrie sú vypočítané cestné koridory. Overené budovy majú ikony a odkazy na zdroj. Dátumy sa zadávajú aj zobrazujú v slovenskom poradí, čas je 24-hodinový. Integrácia je v [dokumentácii modulu](src/modules/transport-map/README.md), výsledky webového prieskumu vrátane obmedzenia pri Košiciach v [zdrojoch](src/modules/transport-map/demo/SOURCES.md).

Leaflet plátno sa načíta len pri otvorení mapového rozhrania. Podklad používa HTTPS dlaždice OpenStreetMap, viditeľnú atribúciu a štandardné prehliadačové cache. Nepoužíva hromadné sťahovanie ani prednačítavanie regiónu. Názov alebo adresu bodu zadáva používateľ; geokódovacia služba sa nevolá. V ostrej prevádzke treba zabezpečiť primeraný mapový hosting a overené polohy zastávok.

Dokumentácia: [React Leaflet](https://react-leaflet.js.org/docs/start-setup/), [Leaflet](https://leafletjs.com/reference.html), [pravidlá mapových dlaždíc OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

### Aktívna jazda vodiča

Vodič otvorí pridelený spoj a stlačí **Začať jazdu**. Samostatný režim `/driver/navigation/:id` používa spoločnú interaktívnu mapu cez prezentačný adaptér `DriverNavigationMap` (vstup: pridelená jazda, index zastávky a obsah karty). Zobrazuje cestnú geometriu bez GPS či navigačných pokynov. Výber bodu nemení priebeh jazdy.

Po bezpečnom zastavení vodič potvrdí príchod, spracuje jednotlivé rezervácie na danej zastávke a výslovne pokračuje. Nástupy/výstupy sú viazané na aktuálnu zastávku a kapacitu; neprítomnosť sa hlási bez automatických sankcií a chybnú značku možno na tej istej zastávke opraviť. Po poslednej zastávke sa kontrolujú všetky záznamy a prázdne vozidlo. Súhrn uvádza prevezené osoby/miesta, neúčasti a skutočne zaznamenané časy. Skupinové demo rezervácie zostávajú jedným záznamom s počtom miest.

Index zastávky, otvorená zastávka aj časy sú uložené v existujúcom localStorage; obnovenie stránky aj odchod na prehľad zachovávajú priebeh. Pri staršej aktívnej jazde bez času začiatku sa čas nevymýšľa. Nejde o produkčné prihlásenie ani živé sledovanie vozidla.

Pred začatím jazdy vodič vidí iba súhrnné počty nastupujúcich/vystupujúcich na zastávkach. Osobné záznamy a úkony sú dostupné až po príchode v Aktívnej jazde. Denný prehľad obsahuje všetky priradené spoje v jednom zozname; výber vodiča sa v rozhraní vodiča nezobrazuje, používa sa aktuálny demo profil.

Na otvorenej zastávke majú značky Vo vozidle aj Neprišiel rovnaké tlačidlo **Zmeniť označenie**. Chybný výstup možno tiež vrátiť pred zatvorením zastávky. Doména opätovne kontroluje kapacitu vozidla aj rezervované úseky a uchová históriu opráv; po odchode už úpravy nie sú povolené. Denný zoznam rozlišuje skutočne ukončené, prebiehajúce a jeden najbližší naplánovaný spoj bez odhadovania dokončenia podľa hodín.

### Identifikačné čísla cestujúcich

Každý rodinný profil má trvalý šesťmiestny `passengerCode`, zobrazovaný ako `123 456` s možnosťou kopírovania. Pri vytváraní možno zadať vlastné číslo alebo ho vygenerovať; obsadené čísla sa odmietnu a generátor opakuje kolízie. Existujúce číslo sa bežnou úpravou nemení. Migrácia na verziu 5 pridá chýbajúce čísla a ihneď ich uloží pod pôvodným storage kľúčom bez straty profilov, rezervácií či aktívnej jazdy.

Vodič vidí číslo, počet miest a zastávky namiesto mena. Rezervácie sú spojené cez vnútorný `passengerId`; staršie `personId` zostáva kompatibilným aliasom. Neznáme externé demo rezervácie dostanú samostatný záznam identity, nespájajú sa menom ani nepribúdajú do rodinných profilov. Verejné mapy čísla nezobrazujú.

Unikátnosť je v deme len v spoločnom lokálnom stave; localStorage neposkytuje transakcie medzi používateľmi. Budúci backend musí mať unikátne databázové obmedzenie na `passengerCode`, serverové overenie/odolné opakovanie kolízií a väzby rezervácií cez nemenný interný identifikátor. Číslo nie je prihlasovacie heslo.

### Mapa vodiča

Karta **Mapa** (`/driver/map?tripId=…`) slúži len na prezeranie všetkých pridelených nezavŕšených Fixed/Flex jázd. Odkaz **Zobraziť trasu** v dennej karte predvyberie príslušný spoj. Zobrazuje vozidlo, začiatok/cieľ, všetky zastávky v poradí, plánované časy a súčty nastupujúcich/vystupujúcich z potvrdených rezervácií. Nezačína jazdu ani nemení jej priebeh.

Komponent `DriverNavigationMap` používa ten istý `TransportMap` ako cestujúci. Spodná karta ponúka výber pridelenej jazdy, jej zastávky a detail vybraného bodu so spätnou šípkou. Verejný cestný smerovač dostáva len verejné zastávky; presné súkromné body vyžadujú výslovne nakonfigurovanú vhodnú službu. Aktívna jazda zachováva samostatný režim a doménové pravidlá vykonávania zastávok. Rozhranie `renderCard` a zodpovednosti sú opísané v [dokumentácii modulu](src/modules/transport-map/README.md).
