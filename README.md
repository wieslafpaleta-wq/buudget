# 💰 Budżet+ — PWA do zarządzania budżetem miesięcznym

Nowoczesna, instalowalna aplikacja **Progressive Web App** do codziennego śledzenia wydatków i kontrolowania budżetu miesięcznego. Zbudowana w 100% na czystym **HTML5, CSS3 i vanilla JavaScript (ES6+)** — bez frameworków, bez zewnętrznych bibliotek, bez build-toola. Działa w pełni offline dzięki Service Workerowi.

![Motyw: złoto/grafit](https://img.shields.io/badge/motyw-z%C5%82oto%20%2F%20grafit-FFD700?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-instalowalna-1C1C1E?style=flat-square)
![Bez frameworków](https://img.shields.io/badge/frameworki-brak-2FAE60?style=flat-square)

---

## 📋 Spis treści

- [Opis projektu](#-opis-projektu)
- [Funkcje](#-funkcje)
- [Struktura projektu](#-struktura-projektu)
- [Instalacja lokalna](#-instalacja-lokalna)
- [Uruchomienie](#-uruchomienie)
- [Publikacja na GitHub Pages](#-publikacja-na-github-pages)
- [Instalacja jako aplikacja PWA](#-instalacja-jako-aplikacja-pwa)
- [Aktualizacja aplikacji](#-aktualizacja-aplikacji)
- [Uwagi projektowe](#-uwagi-projektowe)

---

## 📖 Opis projektu

Budżet+ pomaga kontrolować domowe finanse poprzez proste, szybkie wpisywanie codziennych wydatków i automatyczne przeliczanie, ile pieniędzy zostało do końca miesiąca. Aplikacja automatycznie wykrywa bieżący miesiąc kalendarzowy i na tej podstawie wylicza:

- ile dni budżetowych zostało,
- ile można jeszcze wydać dzisiaj,
- jaki procent budżetu został wykorzystany,
- i ostrzega czerwonym alertem, gdy budżet zostanie przekroczony.

Okres budżetowy jest **stały: zawsze 1–31 sierpnia**. Aplikacja nigdy nie zmienia miesiąca automatycznie na podstawie bieżącej daty systemowej — jedynym edytowalnym parametrem okresu jest **rok**, ustawiany ręcznie w zakładce *Ustawienia*. Domyślny budżet miesięczny to **800 zł**, również edytowalny w Ustawieniach.

Jeśli dzisiejsza data jest poza skonfigurowanym okresem, dashboard pokazuje odpowiedni komunikat zamiast bieżących obliczeń dziennych:
- przed 1 sierpnia: „Budżet zacznie się 1 sierpnia”
- po 31 sierpnia: „Budżet sierpniowy zakończony”

Wszystkie dane (wydatki, budżet, wybrany motyw) są przechowywane **wyłącznie lokalnie** w `localStorage` przeglądarki — nic nie jest wysyłane na żaden serwer.

## ✨ Funkcje

**Dashboard**
- Budżet początkowy, pozostały budżet, wydano łącznie
- Liczba dni pozostałych do końca miesiąca
- Dzisiejszy limit wydatków i średni dzienny wydatek
- Animowany pasek wykorzystania budżetu (zmienia kolor na czerwony przy przekroczeniu)
- Baner ostrzegawczy przy przekroczeniu budżetu

**Dodawanie wydatków**
- Formularz: kwota, opis, kategoria (8 gotowych ikon), data
- Walidacja pól, animacja po zapisaniu, automatyczny zapis do `localStorage`

**Historia**
- Pełna lista wydatków z ikoną kategorii
- Edycja i usuwanie (z potwierdzeniem)
- Wyszukiwarka po opisie
- Filtrowanie po kategorii i po dacie
- Sortowanie: od najnowszych / najstarszych / najwyższa / najniższa kwota

**Statystyki**
- Liczba transakcji, średni / największy / najmniejszy wydatek
- Wykres kołowy (donut) wydatków według kategorii — narysowany ręcznie na `<canvas>`, bez bibliotek

**Dane**
- Eksport do JSON i CSV
- Import z JSON (zawsze z potwierdzeniem — import **dodaje** wydatki, nigdy nie usuwa istniejących danych bez zgody)
- Czyszczenie wszystkich danych (z potwierdzeniem)

**Tryb ciemny** — przełącznik w topbarze i ustawieniach, zapamiętywany w `localStorage` (domyślnie zgodny z preferencją systemową).

**PWA** — manifest, Service Worker z cache’owaniem powłoki aplikacji, pełne wsparcie instalacji na Androidzie i iOS, ikony, kolor motywu i tła.

## 🗂 Struktura projektu

```
budget-pwa/
│
├── index.html              # Struktura aplikacji (dashboard, formularz, historia, statystyki, ustawienia)
├── style.css                # Style — mobile-first, motyw złoto/grafit, dark mode, animacje
├── script.js                 # Cała logika aplikacji (dane, obliczenia, renderowanie, zdarzenia)
├── manifest.json           # Manifest PWA (nazwa, ikony, kolory, tryb standalone)
├── sw.js                        # Service Worker — cache offline, aktualizacje
├── README.md              # Ten plik
├── .gitignore
│
├── assets/
│   ├── icons/
│   │   ├── icon-192.png     # Ikona aplikacji 192×192 (also / maskable)
│   │   ├── icon-512.png     # Ikona aplikacji 512×512 (also / maskable)
│   │   └── favicon.png      # Favicon
│   └── screenshots/         # Miejsce na zrzuty ekranu do dokumentacji
│
└── screenshots/             # (opcjonalnie) zrzuty ekranu do README / GitHub
```

### Architektura kodu (`script.js`)

Plik podzielony jest na jasno opisane sekcje, ułatwiające dalszy rozwój:

1. **Stałe i konfiguracja** — kategorie, klucze `localStorage`, domyślny budżet
2. **Warstwa danych** — `Store` (odczyt/zapis `localStorage`)
3. **Logika obliczeniowa** — granice miesiąca, dni pozostałe, statystyki
4. **Funkcje UI** — formatowanie walut/dat, toast, modal potwierdzenia
5. **Renderowanie widoków** — dashboard, historia, statystyki
6. **Nawigacja** — przełączanie widoków (bottom nav)
7. **Wykres kategorii** — rysowanie na `<canvas>`
8. **Eksport / import danych** — JSON, CSV
9. **Inicjalizacja + rejestracja Service Workera**

## 💻 Instalacja lokalna

Projekt nie wymaga żadnych zależności ani procesu budowania.

```bash
git clone https://github.com/TWOJA-NAZWA-UZYTKOWNIKA/budget-pwa.git
cd budget-pwa
```

## ▶️ Uruchomienie

Service Worker i niektóre funkcje PWA wymagają serwowania plików przez `http://` (nie `file://`). Najprostsze opcje:

**Python (wbudowany w system):**
```bash
python3 -m http.server 8000
```
Następnie otwórz `http://localhost:8000` w przeglądarce.

**Node.js (pakiet `serve`):**
```bash
npx serve .
```

**VS Code:** rozszerzenie *Live Server* → prawy klik na `index.html` → *Open with Live Server*.

## 🚀 Publikacja na GitHub Pages

1. Utwórz nowe repozytorium na GitHubie (patrz sekcja niżej).
2. Wypchnij pliki projektu do gałęzi `main`.
3. W repozytorium na GitHubie wejdź w **Settings → Pages**.
4. W sekcji **Build and deployment** wybierz źródło **Deploy from a branch**.
5. Jako gałąź wybierz `main`, folder `/ (root)`, kliknij **Save**.
6. Po ok. 1–2 minutach aplikacja będzie dostępna pod adresem:
   `https://TWOJA-NAZWA-UZYTKOWNIKA.github.io/budget-pwa/`

> 💡 Adresy w `manifest.json`, `sw.js` i `index.html` są względne (`./`), więc działają poprawnie niezależnie od tego, czy aplikacja jest hostowana w katalogu głównym domeny, czy w podkatalogu (jak na GitHub Pages).

## 📲 Instalacja jako aplikacja PWA

### Android (Chrome)
1. Otwórz stronę aplikacji w Chrome.
2. Dotknij menu (⋮) w prawym górnym rogu.
3. Wybierz **„Zainstaluj aplikację”** lub **„Dodaj do ekranu głównego”**.
4. Potwierdź — ikona Budżet+ pojawi się na ekranie głównym.

### iPhone (Safari)
1. Otwórz stronę aplikacji w Safari (import jako PWA działa tylko w Safari, nie w Chrome na iOS).
2. Dotknij ikony **Udostępnij** (kwadrat ze strzałką w górę).
3. Wybierz **„Dodaj do ekranu początkowego”**.
4. Potwierdź nazwę i dotknij **„Dodaj”**.

Po instalacji aplikacja uruchamia się w trybie pełnoekranowym (bez paska adresu), z własną ikoną i kolorem motywu, i działa offline dzięki wcześniej pobranej powłoce aplikacji.

## 🔄 Aktualizacja aplikacji

1. Wprowadź zmiany w plikach lokalnie i przetestuj (`python3 -m http.server`).
2. **Ważne:** przy każdej zmianie plików statycznych zwiększ numer wersji w `sw.js`:
   ```js
   const CACHE_VERSION = 'budgetplus-v2'; // było v1
   ```
   Dzięki temu Service Worker wykryje nową wersję, pobierze świeże pliki i wyczyści stary cache.
3. Wypchnij zmiany do GitHuba:
   ```bash
   git add .
   git commit -m "Opis zmian"
   git push
   ```
4. GitHub Pages automatycznie przebuduje stronę w ciągu 1–2 minut.
5. Użytkownicy z zainstalowaną aplikacją PWA otrzymają aktualizację automatycznie przy następnym uruchomieniu z dostępem do sieci.

## 📝 Uwagi projektowe

- **Okres budżetowy jest stały** — zawsze 1–31 sierpnia. Miesiąc nigdy nie jest wyliczany z bieżącej daty systemowej; jedynym edytowalnym parametrem jest rok (Ustawienia → Budżet sierpniowy). Pole daty w formularzu dodawania wydatku oraz filtr daty w historii są ograniczone do tego zakresu, aby nie dało się przypadkowo zapisać wydatku spoza śledzonego budżetu. Domyślna kwota budżetu to 800 zł, edytowalna w Ustawieniach.
- **Dane lokalne** — aplikacja nie wysyła żadnych danych na serwer; wszystko jest przechowywane w `localStorage` przeglądarki na danym urządzeniu. Czyszczenie danych przeglądarki usunie również dane aplikacji (zalecany regularny eksport JSON jako kopia zapasowa).
- **Ikony** wygenerowane w stylu graficznym aplikacji (złota moneta na grafitowym tle), zgodne ze specyfikacją ikon maskowalnych (`purpose: maskable`).

---

Stworzone z 💰 przy użyciu czystego HTML, CSS i JavaScript.
