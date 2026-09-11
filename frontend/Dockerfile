FROM node:20-bookworm-slim AS builder

WORKDIR /app

# ROOT CAUSE (found after several false leads - update-notifier, IPv6/DNS,
# npm's own "Exit handler never called!" bug): package-lock.json was
# originally generated inside Replit's dev environment, which transparently
# rewrites npm's registry to an internal proxy (package-firewall.replit.local)
# for every package. That hostname only resolves inside Replit, so every
# "resolved" URL baked into the lockfile was unreachable from the Coolify
# build host, causing npm ci to fail (sometimes as ENOTFOUND, sometimes as
# npm's own confusing internal crash once enough requests failed). Fixed by
# regenerating package-lock.json against the real registry.npmjs.org and
# pinning it via frontend/.npmrc so it can't silently happen again.
COPY package.json package-lock.json .npmrc ./

# Rendre node_modules/.bin explicitement disponible dans le PATH
# pour garantir que tsc et vite sont trouvés quel que soit l'environnement
ENV PATH="/app/node_modules/.bin:$PATH"

# npm ci with a clean, deterministic install avoids the known npm optional-
# dependencies bug that breaks Rollup/esbuild native binaries on Alpine/musl
# (build fails silently before producing dist/). Debian slim uses glibc,
# which sidesteps the issue entirely. --no-audit/--no-fund skip extra
# network round-trips to the registry that aren't needed for a build.
#
# Kept as a defensive retry (cheap insurance against ordinary transient
# network blips) even though the root cause above is now fixed: verify the
# binaries we actually need exist afterward rather than trusting npm's exit
# code, and retry a couple of times before failing loudly.
RUN for i in 1 2 3; do \
      echo "npm ci attempt $i/3..."; \
      rm -rf node_modules; \
      npm install --include=dev --no-audit --no-fund; \
      if [ -x node_modules/.bin/tsc ] && [ -x node_modules/.bin/vite ]; then \
        echo "npm ci attempt $i produced a working install."; \
        exit 0; \
      fi; \
      echo "npm ci attempt $i did not install tsc/vite - retrying."; \
    done; \
    echo "ERREUR: npm ci n'a pas réussi à installer TypeScript/Vite après 3 tentatives" && exit 1

COPY . .

# Utiliser directement les binaires locaux (pas npx) pour ne jamais risquer
# un fallback silencieux vers un package du registre npm portant le même nom.
RUN tsc -b
RUN vite build

# Filet de sécurité : si vite build a réussi mais n'a pas produit dist/,
# on échoue explicitement plutôt que de laisser nginx servir un dossier vide.
RUN test -f dist/index.html || (echo "ERREUR: le build Vite n'a pas produit dist/index.html" && exit 1)

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
