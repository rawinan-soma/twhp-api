# The production deploy, run from the laptop. From the repository root:
#
#   make -C deploy/production deploy HOST=<ssh host>
#   make -C deploy/production rollback HOST=<ssh host> TAG=previous
#
# Database safety is structural. No target runs db:push, db:seed, a Compose
# `down`, or a free-form Compose command, and a release recreates only the api
# and worker containers. `deploy` stops before touching them if the server is
# not the expected stack, if the new image does not fit the live database and
# docker.env, or if a verified backup cannot be written.
#
# Every target deploys a commit, never the working tree: TAG defaults to the tip
# of `main` and must be on origin/main. HOST has no default, so no command
# reaches a server it did not name. `make -n <target>` prints what it would run.

SHELL := /bin/bash

TAG     ?= $(shell git rev-parse --short main)
IMAGE   := rawinan/twhp-elysia-api
PROJECT := twhp-api
ROOT    := $(shell git rev-parse --show-toplevel)
HERE    := $(ROOT)/deploy/production

# Expanded here, run on the server, where `~` is the server's home.
D  := ~/twhp-api
DC := docker compose --project-name $(PROJECT) --profile production -f $(D)/docker-compose.yaml

.DEFAULT_GOAL := help

ifneq ($(filter-out help,$(or $(MAKECMDGOALS),help)),)
ifneq ($(origin HOST),command line)
$(error HOST is required: make $(MAKECMDGOALS) HOST=<ssh host>)
endif
endif
.PHONY: help confirm preflight build pull fit-check backup release check deploy rollback ps logs

help:
	@echo 'Deploy:     deploy           (preflight, build, fit-check, backup, release, check)'
	@echo 'Roll back:  rollback TAG=previous, or TAG=<sha>'
	@echo 'Steps:      preflight  build  fit-check  backup  release  check'
	@echo 'Operate:    ps  logs'
	@echo 'Every target but help needs HOST=<ssh host>.'
	@echo 'Now:        TAG=$(TAG)'

confirm:
	@read -rp 'Type "release $(TAG)" to release it to production on $(HOST): ' a; \
	[ "$$a" = 'release $(TAG)' ] || { echo 'Not released.' >&2; exit 1; }

preflight:
	ssh $(HOST) bash -s -- $(PROJECT) $(IMAGE) < $(HERE)/preflight.sh

# seed_data/ is gitignored but the Dockerfile copies it, so it joins the
# committed tree in the build context.
build:
	git -C $(ROOT) fetch -q origin main
	@git -C $(ROOT) merge-base --is-ancestor $(TAG) origin/main || { echo '$(TAG) is not on origin/main.' >&2; exit 1; }
	@set -eo pipefail; \
	tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
	git -C $(ROOT) archive --format=tar $(TAG) | tar -x -C "$$tmp"; \
	cp -R $(ROOT)/seed_data "$$tmp/"; \
	docker buildx build --platform linux/amd64 --target release \
	  --label org.opencontainers.image.revision=$(TAG) \
	  -t $(IMAGE):$(TAG) -t $(IMAGE):latest --push "$$tmp"

# `previous` exists only on the server.
pull:
	@[ "$(TAG)" = previous ] || ssh $(HOST) "docker pull -q $(IMAGE):$(TAG)"

# Runs the new image against the live database in a read-only session.
fit-check: pull
	ssh $(HOST) "docker run --rm -i --env-file $(D)/docker.env --network $(PROJECT)_default $(IMAGE):$(TAG) bun run -" < $(HERE)/fit-check.ts

backup:
	ssh $(HOST) bash -s -- $(TAG) < $(HERE)/backup.sh

# Compose `up` does not pull an image that exists locally, so `latest` here is
# whichever image was tagged on this line. Nginx resolves the api address once,
# at load, so it reloads after the container is recreated.
release:
	ssh $(HOST) "set -e; target=\$$(docker image inspect -f '{{.Id}}' $(IMAGE):$(TAG)); current=\$$(docker inspect -f '{{.Image}}' twhp-api-prod); docker tag \$$current $(IMAGE):previous; docker tag \$$target $(IMAGE):latest; $(DC) up -d --no-deps --wait --wait-timeout 180 api worker; docker exec twhp-nginx nginx -s reload; echo \"\$$(date '+%FT%T%z') $(TAG)\" >> $(D)/releases.log"

check:
	ssh $(HOST) bash -s -- $(TAG) < $(HERE)/check.sh

deploy: confirm preflight build fit-check backup release check

rollback:
	@[ "$(origin TAG)" = "command line" ] || { echo 'Usage: make rollback TAG=previous' >&2; exit 1; }
	$(MAKE) confirm preflight fit-check backup release check TAG=$(TAG)

ps:
	ssh $(HOST) "$(DC) ps"

logs:
	ssh $(HOST) "$(DC) logs --tail 100 api worker nginx-backend-prod"
