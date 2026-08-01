#!/bin/sh
# =============================================================================
#  Medusa container entrypoint
#  Runs database migrations (and module link sync) before the server binds,
#  then hands the PID over to the Medusa process.
# =============================================================================
set -e

# Resolve the CLI from the built server package; fall back to npx without
# allowing a network install, so a broken image fails loudly instead of
# silently downloading a different Medusa version at boot.
if [ -x ./node_modules/.bin/medusa ]; then
	MEDUSA="./node_modules/.bin/medusa"
else
	MEDUSA="npx --no-install medusa"
fi

echo "[entrypoint] Medusa CLI: ${MEDUSA}"
echo "[entrypoint] worker mode: ${MEDUSA_WORKER_MODE:-shared}"

# `db:migrate` is idempotent and also syncs module links in v2, so running it
# on every boot is safe. Postgres is already gated by a compose healthcheck;
# the retry loop covers the narrow window where it accepts connections but is
# still finishing crash recovery.
attempt=1
max_attempts=5
until $MEDUSA db:migrate; do
	if [ "$attempt" -ge "$max_attempts" ]; then
		echo "[entrypoint] migrations failed after ${max_attempts} attempts — aborting" >&2
		exit 1
	fi
	echo "[entrypoint] migration attempt ${attempt}/${max_attempts} failed, retrying in 5s..." >&2
	attempt=$((attempt + 1))
	sleep 5
done

echo "[entrypoint] migrations complete — starting server on :${PORT:-9000}"
exec $MEDUSA start
