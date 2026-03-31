# ⚔️ Atouts Mythiques

Jeu de société multijoueur en temps réel — navigateur web, chacun sur son téléphone.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Serveur | Node.js + Express |
| Temps réel | Socket.io (WebSockets) |
| Client | HTML / CSS / JS vanilla (sans build) |
| Déploiement | Render, Railway, Fly.io, ou simple VPS |

---

## Installation locale (réseau Wi-Fi commun)

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer le serveur
npm start

# 3. Trouver votre IP locale
# macOS/Linux : ifconfig | grep "inet "
# Windows     : ipconfig

# 4. Les joueurs ouvrent sur leur téléphone :
#    http://192.168.x.x:3000
```

> **Important** : tous les joueurs doivent être sur le **même réseau Wi-Fi**.

---

## Déploiement en ligne (parties à distance)

### Option A — Render (gratuit, recommandé)
1. Poussez ce projet sur GitHub
2. Créez un compte sur [render.com](https://render.com)
3. Nouveau service → Web Service → sélectionnez votre repo
4. Build command : `npm install`
5. Start command : `npm start`
6. Partagez l'URL fournie par Render à vos amis

### Option B — Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Structure du projet

```
atouts-mythiques/
├── server.js          # Serveur Express + Socket.io + logique de jeu
├── public/
│   └── index.html     # Client mobile complet (tout-en-un)
├── package.json
└── README.md
```

---

## Flux de jeu

```
Lobby → Salle d'attente → [Manche N]
                              │
                    ┌─────────▼─────────┐
                    │   Phase Paris     │  Chaque joueur voit ses dés
                    │   (simultané)     │  et parie 0..N plis
                    └─────────┬─────────┘
                              │ (quand tous ont parié)
                    ┌─────────▼─────────┐
                    │   Phase Jeu       │  Tour par tour, chaque
                    │   (tour par tour) │  joueur choisit un dé
                    └─────────┬─────────┘
                              │ (quand tous ont joué)
                    ┌─────────▼─────────┐
                    │  Résultat du pli  │  Qui gagne ? Bonus ?
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Répéter N fois   │  N = roundNumber
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Scores de manche │  Calcul pari/plis + bonus
                    └─────────┬─────────┘
                              │
                      Manche suivante (chef de salle)
                              │
                         Fin de partie → Classement final
```

---

## Événements Socket.io

### Client → Serveur
| Événement | Données | Description |
|-----------|---------|-------------|
| `create-room` | `{ name }` | Créer une salle |
| `join-room` | `{ code, name }` | Rejoindre une salle |
| `start-game` | `{ code }` | Lancer la partie (chef) |
| `place-bet` | `{ code, bet }` | Poser un pari |
| `play-die` | `{ code, dieIndex }` | Jouer un dé de sa main |
| `next-trick` | `{ code }` | Passer au pli suivant |
| `next-round` | `{ code }` | Lancer la manche suivante (chef) |

### Serveur → Client
| Événement | Description |
|-----------|-------------|
| `room-created` | Salle créée, données initiales |
| `room-joined` | Joueur rejoint avec succès |
| `room-updated` | Mise à jour de l'état public |
| `round-started` | Nouvelle manche + mains privées |
| `trick-resolved` | Résultat du pli + bonus |
| `round-ended` | Scores de la manche |
| `player-left` | Un joueur s'est déconnecté |
| `error` | Message d'erreur |

---

## Prochaines étapes suggérées

- [ ] **Animations** : lancer de dé animé, confettis pour le gagnant
- [ ] **Son** : effets sonores pour les atouts, les bonus
- [ ] **Reconnexion** : permettre de retrouver sa partie après déconnexion
- [ ] **Minuterie** : limite de temps par tour (anti-AFK)
- [ ] **Historique** : log des coups joués dans la manche
- [ ] **Règles in-game** : pop-up de rappel des hiérarchies d'atouts
- [ ] **PWA** : installable sur l'écran d'accueil du téléphone
