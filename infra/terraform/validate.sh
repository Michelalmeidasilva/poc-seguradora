#!/usr/bin/env bash
# Offline validation of the Terraform stack. Never talks to GCP: no plan, no apply, no
# credentials. Only `fmt`, `init -backend=false` (downloads providers from the public
# registry) and `validate`, plus structural checks on the .tf files.
# Compatible with macOS bash 3.2 (no mapfile, no associative arrays, no empty-array expansion).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() {
  echo "ok   $*"
}

# Fail fast when there is no configuration at all.
if ! ls ./*.tf >/dev/null 2>&1; then
  echo "FAIL: no .tf files in $DIR"
  exit 1
fi

# Neutralize ambient credentials so nothing here can reach a real project by accident.
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CREDENTIALS GOOGLE_OAUTH_ACCESS_TOKEN CLOUDSDK_AUTH_ACCESS_TOKEN || true

echo "== terraform fmt -check -recursive"
if terraform fmt -check -recursive; then pass "fmt"; else fail "terraform fmt (run: terraform fmt -recursive)"; fi

echo "== terraform init -backend=false"
if terraform init -backend=false -input=false >/dev/null; then pass "init"; else fail "terraform init"; fi

echo "== terraform validate"
if terraform validate -no-color; then pass "validate"; else fail "terraform validate"; fi

echo "== outputs expose no secret"
if [ ! -f outputs.tf ]; then
  fail "outputs.tf missing"
elif grep -nE 'random_password|secret|sensitive[[:space:]]*=[[:space:]]*true' outputs.tf; then
  fail "outputs.tf references a secret (lines above)"
else
  pass "outputs.tf has no secret reference"
fi

echo "== secret value never in a .tf file"
# The only allowed source of the session secret value is random_password.
if grep -nE '(secret_data|SESSION_SECRET)[^=]*=[[:space:]]*"' ./*.tf; then
  fail "a literal secret value is assigned in a .tf file (lines above)"
else
  pass "no literal secret value"
fi
if grep -q 'secret_data[[:space:]]*=[[:space:]]*random_password\.' secrets.tf 2>/dev/null; then
  pass "secret version is fed by random_password"
else
  fail "secrets.tf must set secret_data from random_password"
fi

echo "== .gitignore covers tfvars, state and .terraform/"
for path in terraform.tfvars prod.tfvars terraform.tfstate terraform.tfstate.backup .terraform/x crash.log; do
  if git check-ignore -q "$DIR/$path"; then pass "ignored: $path"; else fail "not git-ignored: $path"; fi
done
if git check-ignore -q "$DIR/terraform.tfvars.example"; then fail "terraform.tfvars.example must NOT be ignored"; else pass "tracked: terraform.tfvars.example"; fi
if git check-ignore -q "$DIR/.terraform.lock.hcl"; then fail ".terraform.lock.hcl must NOT be ignored"; else pass "tracked: .terraform.lock.hcl"; fi

echo "== every variable has a description and a type"
# Split variables.tf into blocks: a block starts at `variable "x" {` and ends at a line `}`.
if [ ! -f variables.tf ]; then
  fail "variables.tf missing"
else
  missing="$(awk '
    /^variable "/ { name = $2; desc = 0; typ = 0; inblock = 1; next }
    inblock && /^[[:space:]]+description[[:space:]]*=/ { desc = 1 }
    inblock && /^[[:space:]]+type[[:space:]]*=/ { typ = 1 }
    inblock && /^}/ {
      if (!desc) print name " (no description)"
      if (!typ) print name " (no type)"
      inblock = 0
    }
  ' variables.tf)"
  if [ -n "$missing" ]; then fail "variables without description/type: $missing"; else pass "all variables have description and type"; fi
  nvars="$(grep -c '^variable "' variables.tf || true)"
  echo "     variables: $nvars"
fi

echo "== structural assertions"
# Prints the count of a resource type across all .tf files and checks the expected value.
count_type() {
  cat ./*.tf | grep -cE "^(resource|data) \"$1\"" || true
}
expect() {
  local type="$1" want="$2" got
  got="$(count_type "$type")"
  if [ "$got" = "$want" ]; then pass "$type blocks: $got"; else fail "$type blocks: got $got, want $want"; fi
}
expect google_cloud_run_v2_service 4
expect google_cloud_run_v2_service_iam_member 4
expect google_service_account 5
expect google_secret_manager_secret 1
expect google_secret_manager_secret_version 1
expect google_secret_manager_secret_iam_member 1
expect random_password 1
expect google_compute_network 1
expect google_compute_subnetwork 1
expect google_artifact_registry_repository 1
expect google_billing_budget 1
expect google_iam_workload_identity_pool 1
expect google_iam_workload_identity_pool_provider 1

# Behavioural settings from the plan's Global Constraints, checked per service block.
run_block() {
  awk -v name="$1" '
    $0 ~ "^resource \"google_cloud_run_v2_service\" \"" name "\"" { on = 1 }
    on { print }
    on && /^}/ { exit }
  ' run.tf
}
assert_in() {
  local svc="$1" pattern="$2" label="$3"
  if run_block "$svc" | grep -qE "$pattern"; then pass "$svc: $label"; else fail "$svc: missing $label"; fi
}
assert_not_in() {
  local svc="$1" pattern="$2" label="$3"
  if run_block "$svc" | grep -qE "$pattern"; then fail "$svc: must not have $label"; else pass "$svc: no $label"; fi
}
if [ -f run.tf ]; then
  for svc in gateway chatbot fake_services; do
    assert_in "$svc" 'max_instance_count[[:space:]]*=[[:space:]]*1$' "max_instance_count = 1"
    assert_in "$svc" 'session_affinity[[:space:]]*=[[:space:]]*true' "session_affinity = true"
  done
  assert_in web 'max_instance_count[[:space:]]*=[[:space:]]*2$' "max_instance_count = 2"
  for svc in web gateway; do
    assert_in "$svc" 'timeout[[:space:]]*=[[:space:]]*"3600s"' 'timeout = "3600s"'
    assert_in "$svc" 'ingress[[:space:]]*=[[:space:]]*"INGRESS_TRAFFIC_ALL"' "public ingress"
  done
  for svc in chatbot fake_services; do
    assert_in "$svc" 'ingress[[:space:]]*=[[:space:]]*"INGRESS_TRAFFIC_INTERNAL_ONLY"' "internal ingress"
  done
  for svc in gateway chatbot; do
    assert_in "$svc" 'egress[[:space:]]*=[[:space:]]*"ALL_TRAFFIC"' "Direct VPC egress ALL_TRAFFIC"
  done
  assert_in gateway 'cpu_idle[[:space:]]*=[[:space:]]*false' "cpu_idle = false"
  for svc in web chatbot fake_services; do
    assert_not_in "$svc" 'cpu_idle[[:space:]]*=[[:space:]]*false' "cpu_idle = false"
  done
  assert_in gateway 'secret_key_ref' "SESSION_SECRET from Secret Manager"
  assert_in gateway 'var\.trust_proxy_hops' "TRUST_PROXY_HOPS from var.trust_proxy_hops"
else
  fail "run.tf missing"
fi
if grep -qE 'private_ip_google_access[[:space:]]*=[[:space:]]*true' network.tf 2>/dev/null; then pass "subnet private_ip_google_access"; else fail "subnet without private_ip_google_access = true"; fi
if grep -qE '"10\.10\.0\.0/24"' network.tf 2>/dev/null; then pass "subnet 10.10.0.0/24"; else fail "subnet range is not 10.10.0.0/24"; fi
if grep -qE 'backend "gcs" \{\}' versions.tf 2>/dev/null; then pass "partial gcs backend"; else fail 'versions.tf needs backend "gcs" {}'; fi

echo "== resource counts by type (blocks in the .tf files; see README 'O que o plan deve mostrar')"
{ cat ./*.tf | grep -E '^resource "' || true; } | awk '{ gsub(/"/, "", $2); print $2 }' | sort | uniq -c

if [ "$failures" -gt 0 ]; then
  echo "validate.sh: $failures failure(s)"
  exit 1
fi
echo "validate.sh: all checks passed"
