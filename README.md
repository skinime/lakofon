# Lakofon

Platforma za podnošenje zahteva studenata FON-a — kontakt forma sa automatskim
predlogom studentskog mejla, prozorom za uplatu i admin dashboard-om.

## Pokretanje

```bash
npm install
npm start
```

- Sajt (forma): http://localhost:3000
- Admin panel: http://localhost:3000/admin.html
  — mejl: **boskooviic@icloud.com**, lozinka: **Boskovic2908!**
  (link ka admin panelu nije prikazan na javnoj stranici — pristupaš mu direktno preko `/admin.html`)

> Baza je SQLite (`lakofon.db`) i pravi se automatski pri prvom pokretanju.
> Za razvoj sa auto-restartom: `npm run dev`.

## Šta radi

**Forma (student):**
- Ime, prezime i broj indeksa → mejl se **automatski predlaže** u formatu
  `abXXXXYYYY@student.fon.bg.ac.rs` (a = prvo slovo imena, b = prvo slovo prezimena,
  XXXX = godina upisa, YYYY = četvorocifreni broj indeksa).
  Npr. *Petar Nikolić, 2026/0123 → pn20260123@student.fon.bg.ac.rs*.
  Podržana su i srpska slova (š, č, ć, ž, đ) i ćirilica.
- Dropdown sa predmetima; ako predmeta nema — **„Ostalo"** i sam upišeš naziv.
- Ako izabrani predmet ima cenu, pre slanja iskače **prozor sa podacima za uplatu**,
  gde student može i da **priloži dokaz o uplati** (slika ili PDF).
- Prilog (opciono, do 15 MB).

**Admin dashboard:**
- Pregled svih zahteva, status (Novo / U radu / Završeno), preuzimanje priloga, brisanje.
- Statistika (ukupno, novi, završeni, prihod).
- Kreiranje / izmena / brisanje predmeta i cena.
- Podešavanje podataka za uplatu, admin mejla, SMTP-a i admin lozinke.

## Mejl obaveštenja (opciono)

Da bi ti svaki zahtev stizao i na mejl (sa prilogom kao attachment), u
**Admin → Podešavanja → SMTP** unesi podatke, npr. za Gmail:

- SMTP host: `smtp.gmail.com`
- Port: `587`
- Korisnik: tvoj Gmail
- Lozinka: [App Password](https://myaccount.google.com/apppasswords) (ne obična lozinka)

Ako SMTP nije podešen, zahtevi se svejedno čuvaju i vidljivi su u dashboard-u.

## Prvo što promeni

Admin → Podešavanja: **podatke za uplatu** (račun, primalac, model). Admin mejl i
lozinku za prijavu možeš promeniti u sekciji **Bezbednost**.
