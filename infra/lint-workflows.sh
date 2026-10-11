#!/usr/bin/env bash
# Lint of the GitHub Actions workflows (needs Docker; not part of `pnpm test`).
#   bash infra/lint-workflows.sh        (or: pnpm lint:workflows)
# (0) self-test: the extra checks and actionlint must FAIL on bad workflows written to a temp
#     dir (and pass on a good one), so a check that silently passes everything is caught;
# (1) actionlint (rhysd/actionlint:latest through Docker, includes shellcheck) on
#     .github/workflows/*.yml;
# (2) extra checks (infra/lint-workflows.mjs): no untrusted `${{ ... }}` inside `run:`, every
#     `uses:` pinned to a major tag or SHA, top-level `permissions:`, `id-token: write` only in
#     jobs with `environment:` (never top-level), required workflows and jobs.
# Never runs a workflow and never talks to GitHub or GCP. Written for bash 3.2 (macOS /bin/bash):
# no mapfile and no expansion of a possibly empty array under `set -u`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKS="$ROOT/infra/lint-workflows.mjs"
ACTIONLINT_IMAGE="rhysd/actionlint:latest"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() {
  echo "ok   $*"
}

actionlint() {
  # $1 = directory mounted as /repo; the rest = actionlint arguments (default: every workflow of
  # the repository, which actionlint finds through the .git directory).
  local dir="$1"
  shift
  docker run --rm -v "$dir:/repo" -w /repo "$ACTIONLINT_IMAGE" -color "$@"
}

# --- (0) self-test -------------------------------------------------------------------------
# A valid workflow: every check must pass on it.
good_workflow() {
  cat <<'EOF'
name: good
on:
  workflow_dispatch:
    inputs:
      tag:
        type: string
permissions:
  contents: read
defaults:
  run:
    shell: bash
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v6.1.0
      - uses: actions/setup-node@0a44ba7841725637a19e28fa30b79a866c81b0a6
      - uses: ./local-action
      - name: safe
        env:
          TAG: ${{ inputs.tag }}
        run: |
          echo "tag=$TAG"
      - run: echo "${{ github.sha }}"
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - run: echo deploy
EOF
}

# Bad workflows, one defect each: name|content
bad_case() {
  case "$1" in
    inputs-in-run)
      good_workflow | sed 's|echo "tag=$TAG"|echo "tag=${{ inputs.tag }}"|'
      ;;
    boolean-input-in-run)
      good_workflow | sed 's|echo "tag=$TAG"|if [ "${{ inputs.deploy_existing_tag }}" = true ]; then echo skip; fi|'
      ;;
    event-in-inline-run)
      good_workflow | sed 's|run: echo "${{ github.sha }}"|run: echo "${{ github.event.head_commit.message }}"|'
      ;;
    ref-name-in-run)
      good_workflow | sed 's|echo "tag=$TAG"|echo ok \&\& git tag ${{github.ref_name}}|'
      ;;
    head-ref-in-folded-run)
      good_workflow | sed 's|run: echo "${{ github.sha }}"|run: >-\
          echo\
          ${{ github.head_ref }}|'
      ;;
    unpinned-main)
      good_workflow | sed 's|actions/checkout@v4|actions/checkout@main|'
      ;;
    unpinned-none)
      good_workflow | sed 's|actions/checkout@v4|actions/checkout|'
      ;;
    no-permissions)
      good_workflow | sed '/^permissions:/d; /^  contents: read/d'
      ;;
    id-token-without-environment)
      good_workflow | sed '/^    environment: production$/d'
      ;;
    top-level-id-token)
      good_workflow | sed 's|^  contents: read$|  contents: read\
  id-token: write|'
      ;;
  esac
}

self_test() {
  local dir out name status
  dir="$TMP/good"
  mkdir -p "$dir"
  good_workflow >"$dir/good.yml"
  if out="$(node "$CHECKS" "$dir" 2>&1)"; then
    pass "self-test: extra checks accept a good workflow"
  else
    fail "self-test: extra checks reject a good workflow: $out"
  fi

  for name in inputs-in-run boolean-input-in-run event-in-inline-run ref-name-in-run head-ref-in-folded-run \
    unpinned-main unpinned-none no-permissions id-token-without-environment top-level-id-token; do
    dir="$TMP/bad-$name"
    mkdir -p "$dir"
    bad_case "$name" >"$dir/bad.yml"
    if cmp -s "$dir/bad.yml" "$TMP/good/good.yml"; then
      fail "self-test: bad case $name did not change the workflow (broken fixture)"
      continue
    fi
    if out="$(node "$CHECKS" "$dir" 2>&1)"; then
      fail "self-test: extra checks accepted bad workflow ($name)"
    else
      pass "self-test: extra checks reject $name ($(echo "$out" | head -1))"
    fi
  done

  dir="$TMP/missing"
  mkdir -p "$dir"
  good_workflow >"$dir/ci.yml"
  if node "$CHECKS" --require ci.yml,deploy.yml --require-jobs ci.yml=build,docker "$dir" >/dev/null 2>&1; then
    fail "self-test: missing workflow/job not reported"
  else
    pass "self-test: missing required workflow and job are reported"
  fi

  # actionlint itself must fail on a broken workflow (unknown key, undefined job in needs).
  dir="$TMP/actionlint/.github/workflows"
  mkdir -p "$dir"
  cat >"$dir/broken.yml" <<'EOF'
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    needs: does-not-exist
    stepz:
      - run: echo hi
EOF
  # Exit 1 = lint errors found (2 = bad command line, 3 = fatal): only 1 proves the lint ran.
  # The second file must be accepted, so the self-test cannot pass on an always-failing run.
  status=0
  actionlint "$TMP/actionlint" .github/workflows/broken.yml >/dev/null 2>&1 || status=$?
  if [ "$status" -eq 1 ]; then
    pass "self-test: actionlint rejects a broken workflow (exit 1)"
  else
    fail "self-test: actionlint on a broken workflow exited $status (expected 1: lint errors)"
  fi
  sed '/needs: does-not-exist/d; s|stepz:|steps:|' "$dir/broken.yml" >"$dir/fixed.yml"
  status=0
  actionlint "$TMP/actionlint" .github/workflows/fixed.yml >/dev/null 2>&1 || status=$?
  if [ "$status" -eq 0 ]; then
    pass "self-test: actionlint accepts the fixed workflow"
  else
    fail "self-test: actionlint on the fixed workflow exited $status (expected 0)"
  fi
}

# --- run ---------------------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "FAIL: Docker is not running (actionlint runs in a container)"
  exit 1
fi

self_test

# Explicit file list (does not depend on actionlint finding the .git directory).
cd "$ROOT"
WORKFLOWS=(.github/workflows/*.yml)
if actionlint "$ROOT" "${WORKFLOWS[@]}"; then
  pass "actionlint .github/workflows"
else
  fail "actionlint .github/workflows"
fi

if node "$CHECKS" \
  --require ci.yml,deploy.yml \
  --require-jobs ci.yml=verify,docker \
  --require-jobs deploy.yml=deploy,smoke \
  "$ROOT/.github/workflows"; then
  pass "extra workflow checks"
else
  fail "extra workflow checks"
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all workflow checks passed"
