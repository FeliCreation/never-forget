# Never Forget

Gestionnaire de mots de passe sous forme d'extension Chrome / Edge / Brave. Local, chiffré, sans serveur, gratuit.

## Fonctionnalités

| | |
|---|---|
| Coffre chiffré | identifiants, notes sécurisées, cartes, identités, Wi-Fi ; favoris et collections |
| Remplissage automatique | pastille dans les champs de connexion, sur clic uniquement, refusé sur les pages `http` |
| Enregistrement | propose d'enregistrer ou de mettre à jour un mot de passe après une connexion |
| Générateur | longueur 8–64, familles de caractères, caractères ambigus exclus |
| Codes à usage unique (TOTP) | codes à 6 chiffres générés dans le coffre, compatibles Google Authenticator |
| Santé du coffre | mots de passe faibles, réutilisés, anciens, score sur 100 |
| Fuites de données | vérification via haveibeenpwned.com en k-anonymité (optionnelle) |
| Import / export | CSV Dashlane, Chrome, Bitwarden, 1Password ; sauvegarde chiffrée `.nfvault` |
| Récupération | clé de récupération à 160 bits fournie à la création |
| Thème | clair, sombre ou automatique ; couleur d'accent au choix |

## Installer (utilisateur)

Voir [extension/LISEZMOI.txt](extension/LISEZMOI.txt), ou donner le fichier `dist/NeverForget-1.0.0.zip` (même texte à l'intérieur).

Chrome Web Store : pas encore publié (inscription développeur unique à 5 $). En attendant, l'installation passe par le mode développeur.

## Sécurité

- **Chiffrement** : une clé de données aléatoire (AES-256-GCM) chiffre le coffre. Elle est elle-même chiffrée par une clé dérivée du mot de passe maître (PBKDF2-SHA256, 600 000 itérations) et par une clé dérivée de la clé de récupération. Changer de mot de passe maître ne rechiffre donc pas les données.
- **Zero-knowledge** : aucune donnée ne quitte l'appareil. Pas de compte, pas de serveur, pas de télémétrie.
- **Clé déverrouillée** : conservée dans `chrome.storage.session` (mémoire uniquement, effacée à la fermeture du navigateur, hors de portée des scripts de contenu et des pages web). Verrouillage automatique après inactivité.
- **Hameçonnage** : un site ne peut obtenir que les identifiants de son propre domaine. La correspondance est stricte (`evil-github.com` ne reçoit pas `github.com`) et vérifiée dans le service worker avec l'URL fournie par le navigateur, jamais celle envoyée par la page. Les clics synthétiques sont ignorés.
- **Interface** : construite sans `innerHTML` sur des données du coffre ; CSP stricte sur les pages de l'extension ; interface injectée dans un shadow DOM fermé.
- **Presse-papiers** : effacé après 30 s (réglable).

### Ce que ça ne fait pas (par choix de rester gratuit et sans serveur)

- Pas de synchronisation automatique entre appareils : on déplace un fichier `.nfvault` chiffré.
- Pas de partage entre utilisateurs, pas de passkeys, pas d'application mobile, pas de surveillance du dark web par e-mail (réservée à l'API payante de HIBP).
- Pas de remplissage dans les iframes (limite volontaire contre le détournement).
- Le presse-papiers n'est effacé que si l'onglet Never Forget reste ouvert.
- PBKDF2 est utilisé faute d'Argon2 natif dans le navigateur.
- Le code n'a pas été audité par un tiers. À ce stade, c'est un projet personnel.

## Développement

```bash
npm test        # 18 groupes de tests (chiffrement, coffre, TOTP, CSV, service worker…)
npm run dev     # aperçu de l'interface sur http://localhost:5173/dev.html
npm run icons   # régénère les icônes
```

`tools/dev-shim.js` simule `chrome.storage` pour prévisualiser l'interface dans un onglet normal ; il n'est pas livré.

Structure : `extension/lib` (cœur sans interface, testé), `extension/app.js` (page du coffre), `extension/popup.js`, `extension/content.js` (pastille et enregistrement), `extension/background.js` (service worker).
