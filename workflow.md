git checkout -b feat/NomFeature

# Développement + commits
git add .
git commit -m "feat: ..."

# Push de la branche → déclenche le CI (lint + smoke test)
git push origin feat/NomFeature

# Vérifier que le CI est vert sur GitHub Actions avant de merger
# Si rouge → corriger, commit, push → CI se relance automatiquement

git checkout main
git merge feat/NomFeature
git push   # ← déclenche automatiquement le CD (déploiement Render)

# Vérifier sur Render que le déploiement est OK
# (dashboard Render ou l'URL de prod)

git tag vx.y
git push --tags

git branch -d feat/NomFeature
git push origin --delete feat/NomFeature

## ROADMAP
Roadmap révisée et ordonnée :
#Branche Contenu
1refactor/architectureFactorisation code (11)
2feat/robustnessNettoyage mémoire, timeouts, reconnexion
3feat/securityRate limiting, validation, HTTPS
4feat/ci-cdGitHub Actions, déploiement automatique
5feat/testsTests automatisés (12)
6feat/monitoringLogs, Sentry, métriques
7feat/designIcônes, refonte UI, règles (10)
8feat/pwaInstallable téléphone
9feat/statsAnalyse équilibrage (7)
10feat/extensionsNouvelles extensions (4)
11feat/animationsAnimations dés (6)
12feat/boss-modeMode boss (5)
13feat/platformComptes, amis, invitations (1)
14feat/matchmakingParties publiques, classement (2)
15feat/chatChat / communication (8)
16feat/universeChangement univers D&D (3)
17feat/legalLicence, droits (9)