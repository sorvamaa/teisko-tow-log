# Teiskon lentopaikan hinauskirjanpito — Vaatimusmäärittely

**Versio:** 1.0
**Päivämäärä:** 16.4.2026
**Projekti:** Teisko Tow Log

---

## 1. Yleiskuvaus

Web-sovellus Teiskon lentopaikan autohinausten kirjanpitoon. Sovelluksella seurataan lentopäiviä, hinauksia, pilotteja sekä niihin liittyviä maksuja ja kuluja. Sovellus korvaa nykyisen Excel-pohjaisen kirjanpidon.

### 1.1 Tavoitteet

- Lentopäivien ja hinausten helppo kirjaaminen kentällä (mobiili)
- Pilottien läsnäolon seuranta
- Hinausmaksujen ja kausikorttien hallinta
- Kulujen kirjanpito (polttoaine, varaosat ym.)
- Yhteenveto tuloista, kuluista ja tuloksesta

### 1.2 Kohderyhmä

- Teiskon lentopaikan hinausryhmän jäsenet ja lentäjät

---

## 2. Tekninen arkkitehtuuri

Sama pino kuin Pilottipolku-sovelluksessa:

| Komponentti | Teknologia |
|---|---|
| Backend | Node.js + Express |
| Tietokanta | PostgreSQL |
| Templating | EJS (server-side rendered) |
| Autentikointi | Salasanapohjainen (bcrypt) |
| Tietoturva | Helmet, CSRF-suojaus, rate limiting |
| Hosting | Railway |
| Tyylitys | CSS (kevyt, mobiiliresponsiivinen) |

### 2.1 Tietokantarakenne (alustavat taulut)

**users** — Käyttäjätili
- id, nimi, sähköposti, salasana_hash, rooli (admin/user), luotu, päivitetty

**pilots** — Pilottirekisteri
- id, nimi, huomautus (esim. "Oppilas"), aktiivinen, luotu

**vehicles** — Hinausajoneuvot
- id, nimi (esim. "Lada", "Markon Tojota"), aktiivinen, luotu

**flight_days** — Lentopäivät
- id, päivämäärä, huomautukset, kirjaaja (user_id), luotu, päivitetty

**flight_day_vehicles** — Lentopäivän ajoneuvot ja hinausmäärät
- id, flight_day_id, vehicle_id, hinausmäärä

**flight_day_pilots** — Lentopäivän pilotit
- id, flight_day_id, pilot_id

**payments** — Hinausmaksut
- id, pilot_id, summa, maksutapa (MobilePay, käteinen ym.), tyyppi (päivämaksu/kausikortti), päivämäärä, huomautus, kirjaaja (user_id), luotu

**expenses** — Kulut
- id, päivämäärä, summa, kuka_hankki, mitä, huomautus, kirjaaja (user_id), luotu

---

## 3. Käyttäjäroolit

### 3.1 Käyttäjä (user)

Peruskäyttäjä joka voi:

- **Kirjata lentopäivän:**
  - Valita päivämäärän
  - Valita hinausajoneuvon/ajoneuvot ja merkitä hinausmäärät per ajoneuvo
  - Valita paikalla olleet pilotit listasta
  - Lisätä uuden pilotin nopeasti (jos ei listassa)
  - Lisätä huomautuksia
- **Selata lentopäiviä** (oma historia)

### 3.2 Ylläpitäjä (admin)

Kaikki käyttäjän oikeudet, sekä lisäksi:

- **Hinausajoneuvot:** lisätä, muokata, poistaa/arkistoida
- **Maksut:** kirjata hinausmaksuja (10 €/päivä tai 50 €/kausikortti), nähdä maksuhistoria
- **Kulut:** kirjata kuluja (pvm, summa, kuka hankki, mitä), nähdä kuluhistoria
- **Yhteenveto:** nähdä talousyhteenveto (tulot, menot, tulos)
- **Käyttäjähallinta:** luoda käyttäjiä, asettaa rooleja
- **Pilottien hallinta:** muokata ja arkistoida pilotteja

---

## 4. Toiminnalliset vaatimukset

### 4.1 Autentikointi

- Kirjautuminen sähköpostilla ja salasanalla
- Salasanan palautus sähköpostilla
- Istunnonhallinta PostgreSQL-pohjaisesti
- Bcrypt-salasanojen hajautus
- Rate limiting kirjautumisyrityksille

### 4.2 Lentopäivän kirjaaminen

Sovelluksen ydintoiminto. Yksi kirjaus = yksi lentopäivä.

**Kentät:**
- Päivämäärä (oletus: tänään)
- Hinausajoneuvot: valinta listasta, voi valita useita. Jokaiselle merkitään hinausmäärä
- Pilotit: valinta listasta (monivalinta), mahdollisuus lisätä uusi pilotti lennossa
- Huomautukset (vapaa teksti)

**Ei kirjata:** yksittäisten pilottien hinausmääriä erikseen — riittää päivän kokonaismäärät per ajoneuvo ja lista paikalla olleista piloteista.

### 4.3 Hinausmaksujen hallinta (admin)

- Kirjaa maksu: valitse pilotti, summa, maksutapa, tyyppi
- Maksutyypit:
  - **Päivämaksu:** 10 € / päivä
  - **Kausikortti:** 50 € / kausi
- Maksutavat: MobilePay, käteinen, tilisiirto ym.
- Maksuhistoria pilotin ja päivämäärän mukaan

### 4.4 Kulujen hallinta (admin)

- Kirjaa kulu: päivämäärä, summa, kuka hankki, mitä, huomautus
- Kuluhistorian selaus ja suodatus

### 4.5 Yhteenveto ja raportit (admin)

- Tulot yhteensä (hinausmaksut)
- Menot yhteensä (kulut)
- Tulos (tulot - menot)
- Hinausmäärät per ajoneuvo
- Suodatus ajanjaksolla (kausi/kuukausi)

### 4.6 Pilottien hallinta

- Pilottirekisteri: nimi, huomautus (esim. "Oppilas"), aktiivinen-tila
- Käyttäjä voi lisätä uuden pilotin lentopäivää kirjatessa
- Admin voi muokata ja arkistoida pilotteja

### 4.7 Ajoneuvojen hallinta (admin)

- Ajoneuvorekisteri: nimi, aktiivinen-tila
- Lisää, muokkaa, arkistoi

---

## 5. Ei-toiminnalliset vaatimukset

### 5.1 Käytettävyys

- Mobiiliresponsiivinen (käyttö kentällä puhelimella)
- Suomenkielinen käyttöliittymä
- Nopea ja yksinkertainen kirjaus — mahdollisimman vähän klikkauksia

### 5.2 Tietoturva

- HTTPS
- Helmet-suojausotsikot
- CSRF-suojaus
- Syötteiden validointi (XSS-esto)
- Roolipohjainen pääsynhallinta

### 5.3 Suorituskyky

- Kevyt sovellus, ei raskaita laskentoja
- Sivujen lataus < 2s

---

## 6. Kehitysvaiheet

### Vaihe 1 — MVP
- Autentikointi (kirjautuminen, salasanan palautus)
- Lentopäivän kirjaaminen (ajoneuvot, hinausmäärät, pilotit)
- Pilottirekisteri (lisäys ja valinta)
- Ajoneuvorekisteri
- Admin: maksujen ja kulujen kirjaaminen
- Perusyhteenveto

### Vaihe 2 — Laajennukset
- Tarkemmat raportit ja tilastot
- Pilotin oma näkymä (omat lennot, maksutilanne)
- Excel-vienti
- Ilmoitukset (esim. kausikortin voimassaolo)

---

## 7. Olemassa olevan datan migraatio

Nykyisestä Excel-tiedostosta (Hinauskirjanpito Teisko.xlsx) tuodaan:

- Hinausajoneuvot: Lada, Markon Tojota, Extremen Golf
- Pilotit: 12 pilotin nimilista
- Lentopäivät: 3 lentopäivää (20.3., 27.3., 3.4.2026)
- Hinausmaksut: 11 maksutapahtumaa
- Kulut: 2 kulutapahtumaa

---

## 8. Päätetyt rajaukset

- Pilotin omia tilastoja ei tarvita MVP:ssä
- Kausikorttiin ei voimassaoloaikaa
- Vain Teisko, ei useita lentopaikkoja
- Ei säätietoa tai lisäkenttiä lentopäivälle
