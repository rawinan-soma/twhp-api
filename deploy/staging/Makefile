# The staging deploy, run from the laptop. From the repository root:
#
#   make -C deploy/staging deploy HOST=<ssh host>        # every time: sync … check
#   make -C deploy/staging migrate HOST=<ssh host>       # first, if schema.ts changed
#   make -C deploy/staging rollback HOST=<ssh host> TAG=<sha>
#
# Every target deploys a commit, never the working tree: TAG defaults to the
# tip of the local `staging` branch. HOST has no default, so no command reaches
# a server it did not name. `make -n <target>` prints what it would run.

SHELL := /bin/bash

TAG  ?= $(shell git rev-parse --short staging)
ROOT := $(shell git rev-parse --show-toplevel)
HERE := $(ROOT)/deploy/staging

# All the server gets from a commit. Anything else there is removed by sync,
# except what rsync-exclude protects.
TREE := src nginx package.json bun.lock tsconfig.json drizzle.config.ts Dockerfile .dockerignore docker-compose.yaml

# Expanded here, run on the server, where `~` is the server's home. The project
# name is the one the running stack's volumes were created under; changing it
# starts staging on empty volumes.
D  := ~/twhp-api
DC := docker compose --project-name twhp-api --profile staging -f $(D)/docker-compose.yaml -f $(D)/compose.staging.yml

.DEFAULT_GOAL := help

# Every target but help talks to the server, so it must be named on the command
# line (a `make rollback` passes it on to its sub-make).
ifneq ($(filter-out help,$(or $(MAKECMDGOALS),help)),)
ifneq ($(origin HOST),command line)
$(error HOST is required: make $(MAKECMDGOALS) HOST=<ssh host>)
endif
endif
.PHONY: help diff sync build run migrate check deploy rollback ps logs dc down

help:
	@echo 'Deploy:     deploy           (sync, build, run, check)'
	@echo 'Schema:     migrate          (db:push, run before deploy when schema.ts changed)'
	@echo 'Roll back:  rollback TAG=<sha>'
	@echo 'Steps:      diff  sync  build  run  check'
	@echo 'Operate:    ps  logs  dc ARGS="<compose args>"'
	@echo 'Stop:       down             (keeps the volumes)'
	@echo 'Every target but help needs HOST=<ssh host>.'
	@echo 'Now:        TAG=$(TAG)'

# Mirrors TREE at TAG onto the server. rsync-exclude protects the server's own
# files from --delete.
define mirror_tag
set -eo pipefail; \
tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
git -C $(ROOT) archive --format=tar $(TAG) $(TREE) | tar -x -C "$$tmp"; \
rsync -az --delete --exclude-from=$(HERE)/rsync-exclude $(1) "$$tmp/" $(HOST):$(D)/
endef

# What sync would change, including every file it would delete. Writes nothing.
diff:
	@$(call mirror_tag,-ni)

# compose.staging.yml comes from the working tree, not TAG: it describes this
# server, so a rollback to a commit older than the file must still get it.
sync:
	@ssh $(HOST) 'test -f $(D)/docker.env' || { echo 'No docker.env on $(HOST).' >&2; exit 1; }
	@$(call mirror_tag,)
	scp -q $(HERE)/compose.staging.yml $(HOST):$(D)/compose.staging.yml
	ssh $(HOST) "echo TWHP_TAG=$(TAG) > $(D)/release.env && $(DC) config --quiet && echo config ok"

# The server has no bun, and api-dev bind-mounts the repository over the image's
# node_modules, so dependencies are installed through the container.
build: sync
	ssh -t $(HOST) "$(DC) build && $(DC) run --rm --no-deps api-dev bun install --frozen-lockfile"

# Safe to repeat. Rebuilt in `build`, so worker-dev cannot keep stale code.
run: build
	ssh -t $(HOST) "$(DC) up -d && $(DC) ps"

# Staging's migrate-dev is a no-op, so a schema change only lands through here.
# ssh -t keeps drizzle-kit's data-loss prompts answerable.
migrate: build
	ssh -t $(HOST) "$(DC) up -d --wait postgres redis && $(DC) run --rm --no-deps api-dev bun run db:push"

# Runs them all, then fails if any failed.
check:
	@fail=0; \
	addr=$$(ssh -G $(HOST) | awk '/^hostname /{print $$2}'); \
	code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$$addr:81/twhp/api/health"); \
	if [ "$$code" = 200 ]; \
	  then echo "ok    /twhp/api/health through nginx"; \
	  else echo "FAIL  /twhp/api/health through nginx: $$code"; fail=1; fi; \
	running=$$(ssh $(HOST) "$(DC) ps --status running --services"); \
	for s in postgres redis minio api-dev worker-dev nginx-backend-stg; do \
	  if grep -qx "$$s" <<<"$$running"; \
	    then echo "ok    $$s running"; \
	    else echo "FAIL  $$s not running"; fail=1; fi; \
	done; \
	echo "running: $$(ssh $(HOST) 'cat $(D)/release.env')"; \
	exit $$fail

deploy: run
	@sleep 5
	$(MAKE) check

# Code only: a schema already pushed stays pushed.
rollback:
	@[ "$(origin TAG)" = "command line" ] || { echo 'Usage: make rollback TAG=<sha>' >&2; exit 1; }
	$(MAKE) deploy TAG=$(TAG)

ps:
	ssh $(HOST) "$(DC) ps"

logs:
	ssh $(HOST) "$(DC) logs --tail 100 api-dev worker-dev nginx-backend-stg"

dc:
	ssh -t $(HOST) "$(DC) $(ARGS)"

down:
	ssh $(HOST) "$(DC) down"
