# Deploy — Lakofon na internet (24/7)

Projekat je spreman za deploy (ima `Dockerfile`, `render.yaml`, `DATA_DIR` za trajni disk).
Naloge i push moraš da uradiš ti — ispod su tačni koraci.

---

## Varijanta A — Render.com (preporučeno)

### 1. Stavi kod na GitHub
U terminalu, iz foldera projekta:
```bash
gh auth login        # ako nemaš gh: https://cli.github.com  (ili napravi repo ručno na github.com)
gh repo create lakofon --private --source=. --push
```
(Repo je već inicijalizovan i komitovan, pa ide odmah na push.)

### 2. Napravi servis na Render-u
1. Idi na https://render.com i uloguj se (može preko GitHub-a).
2. **New +  →  Blueprint**, izaberi svoj `lakofon` repo. Render pročita `render.yaml`.
3. Klikni **Apply**. Sačekaj build (par minuta).
4. Dobićeš javnu adresu tipa `https://lakofon.onrender.com`.

### 3. (Bitno) Trajnost podataka
- `render.yaml` je podešen na **plan `starter`** (~$7/mo) jer je **trajni disk** moguć samo na plaćenom planu. Tako baza i prilozi prežive redeploy.
- Ako želiš **besplatno**: u `render.yaml` promeni `plan: starter` u `plan: free` i **obriši ceo `disk:` blok**. Radi, ali se baza i prilozi resetuju pri svakom redeployu / uspavljivanju servisa.
  - U tom slučaju **obavezno podesi SMTP** (dole) da ti zahtevi stižu na mejl sa prilogom — pa gubitak baze nije problem.

### 4. Mejl obaveštenja i lozinka (Environment u Render dashboard-u)
Dodaj Environment varijable (Settings → Environment):
| Ključ | Vrednost |
|---|---|
| `SMTP_HOST` | npr. `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | tvoj mejl |
| `SMTP_PASS` | app-password (Gmail: https://myaccount.google.com/apppasswords) |
| `ADMIN_PASSWORD` | tvoja admin lozinka (menja default) |
| `ADMIN_EMAIL` | mejl za prijavu / obaveštenja |

> Ove varijable se primenjuju samo pri **prvom** kreiranju baze. Kasnije sve menjaš i kroz Admin → Podešavanja.

---

## Varijanta B — Railway.app (bez GitHub-a, preko CLI)
```bash
npm i -g @railway/cli
railway login
railway init          # napravi novi projekat
railway up            # deploy iz ovog foldera
```
Zatim u Railway dashboard-u:
- Dodaj **Volume** montiran na `/data` (za trajnost) i env var `DATA_DIR=/data`.
- Dodaj iste SMTP/ADMIN env varijable kao gore.
- **Settings → Networking → Generate Domain** za javnu adresu.

---

## Posle deploya — proveri
- Otvori javnu adresu → forma se učitava.
- `/admin.html` → prijava sa svojim mejlom i lozinkom.
- Pošalji test zahtev → stigne na dashboard (i na mejl ako je SMTP podešen).
